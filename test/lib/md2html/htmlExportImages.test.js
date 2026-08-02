const { test, describe } = require('node:test')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')

const { exportHtml } = require('../../../lib/md2html/exportHtml')

/**
 * Creates a temporary spec structure, runs exportHtml, and returns results.
 * opts.embedImages defaults to true (matching exportHtml default).
 */
function exportSpec(mdContent, opts = {}) {
  const tempDir = path.join(os.tmpdir(), `specpress-html-export-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const specDir = path.join(tempDir, 'spec')
  const outputPath = path.join(tempDir, 'output', 'index.html')
  const cacheDir = path.join(tempDir, 'cached')
  fs.mkdirSync(specDir, { recursive: true })
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  fs.writeFileSync(path.join(specDir, '01 Test.md'), mdContent)

  if (opts.withPng) {
    const assetsDir = path.join(specDir, 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    // Minimal 1x1 red PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
    fs.writeFileSync(path.join(assetsDir, 'test.png'), png)
  }

  if (opts.cachedSvgs) {
    fs.mkdirSync(cacheDir, { recursive: true })
    for (const [filename, content] of Object.entries(opts.cachedSvgs)) {
      fs.writeFileSync(path.join(cacheDir, filename), content)
      const pngName = filename.replace(/\.svg$/, '.png')
      fs.writeFileSync(path.join(cacheDir, pngName), Buffer.from('png'))
    }
  }

  const embedImages = opts.embedImages !== undefined ? opts.embedImages : true

  exportHtml({
    inputPaths: [specDir],
    outputPath,
    specRoot: specDir,
    embedImages,
    mscgenConfig: opts.mscgenConfig || null,
  })

  const html = fs.readFileSync(outputPath, 'utf8')
  const mediaDir = path.join(path.dirname(outputPath), 'media')
  const mediaFiles = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []

  return { html, mediaFiles, mediaDir, tempDir }
}

function cleanup(tempDir) {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

/**
 * Verifies every <img src="media/..."> has a corresponding file on disk.
 */
function verifyMediaLinks(html, mediaDir) {
  const imgSrcs = (html.match(/<img[^>]*src="([^"]+)"[^>]*>/g) || [])
    .map(tag => tag.match(/src="([^"]+)"/)[1])
  const errors = []
  for (const src of imgSrcs) {
    if (src.startsWith('media/')) {
      const filePath = path.join(mediaDir, src.slice('media/'.length))
      if (!fs.existsSync(filePath)) errors.push(`Missing: ${src}`)
    } else if (!src.startsWith('http') && !src.startsWith('data:')) {
      errors.push(`Unexpected src: ${src}`)
    }
  }
  if (errors.length > 0) throw new Error(`Image link verification failed:\n  ${errors.join('\n  ')}`)
  return imgSrcs.filter(s => s.startsWith('media/')).length
}

// ---------------------------------------------------------------------------
// PNG images
// ---------------------------------------------------------------------------
describe('HTML export — PNG images (embedded, default)', () => {

  test('PNG image is embedded as data URI', () => {
    const md = '# Test\n\n![alt text](assets/test.png)\n'
    const { html, mediaFiles, tempDir } = exportSpec(md, { withPng: true })
    try {
      assert.ok(html.includes('src="data:image/png;base64,'), 'PNG should be embedded as data URI')
      assert.ok(!html.includes('src="media/'), 'should not use media/ path when embedding')
      assert.strictEqual(mediaFiles.length, 0, 'media/ directory should be empty')
      assert.ok(html.includes('alt="alt text"'), 'alt text should be preserved')
      assert.ok(!html.includes('vscode-resource'), 'should not contain vscode-resource URIs')
    } finally { cleanup(tempDir) }
  })

})

describe('HTML export — PNG images (media/, embedImages=false)', () => {

  test('PNG image is copied to media/ with relative path', () => {
    const md = '# Test\n\n![alt text](assets/test.png)\n'
    const { html, mediaFiles, mediaDir, tempDir } = exportSpec(md, { withPng: true, embedImages: false })
    try {
      assert.ok(mediaFiles.some(f => f.endsWith('.png')), 'PNG should be in media/')
      assert.ok(html.includes('src="media/'), 'img src should use relative media/ path')
      assert.ok(!html.includes('vscode-resource'), 'should not contain vscode-resource URIs')
      assert.ok(html.includes('alt="alt text"'), 'alt text should be preserved')
      verifyMediaLinks(html, mediaDir)
    } finally { cleanup(tempDir) }
  })

})

// ---------------------------------------------------------------------------
// Explicit image scaling ({width=/height=} GitLab-style block)
// ---------------------------------------------------------------------------
describe('HTML export — explicit image size {width=/height=}', () => {

  test('{width=300} sets width and keeps a plain image link', () => {
    const md = '# Test\n\n![alt text](assets/test.png){width=300}\n'
    const { html, tempDir } = exportSpec(md, { withPng: true })
    try {
      assert.ok(/<img[^>]*\bwidth="300"/.test(html), 'width should be set on the img')
      assert.ok(html.includes('src="data:image/png;base64,'), 'image should still be embedded')
      assert.ok(!html.includes('{width='), 'the {...} block should be stripped from the output')
      assert.ok(html.includes('alt="alt text"'), 'alt text should be preserved')
    } finally { cleanup(tempDir) }
  })

  test('{width=300 height=200} sets both dimensions', () => {
    const md = '# Test\n\n![alt text](assets/test.png){width=300 height=200}\n'
    const { html, tempDir } = exportSpec(md, { withPng: true })
    try {
      assert.ok(/<img[^>]*\bwidth="300"/.test(html), 'width should be set')
      assert.ok(/<img[^>]*\bheight="200"/.test(html), 'height should be set')
      assert.ok(!html.includes('{width='), 'the {...} block should be stripped')
    } finally { cleanup(tempDir) }
  })

  test('{width=50%} keeps the percentage', () => {
    const md = '# Test\n\n![alt text](assets/test.png){width=50%}\n'
    const { html, tempDir } = exportSpec(md, { withPng: true })
    try {
      assert.ok(/<img[^>]*\bwidth="50%"/.test(html), 'percentage width should be preserved')
      assert.ok(!html.includes('{width='), 'the {...} block should be stripped')
    } finally { cleanup(tempDir) }
  })

})

// ---------------------------------------------------------------------------
// Mermaid diagrams (cached)
// ---------------------------------------------------------------------------
describe('HTML export — mermaid diagrams cached (embedded, default)', () => {

  test('mermaid cached SVG is embedded as data URI', () => {
    const code = 'graph TD; A-->B'
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMermaidConfig } = require('../../../lib/common/mermaidConfig')
    const key = cacheKey(code, loadMermaidConfig(null))
    const svgContent = '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><text>A to B</text></svg>'

    const md = '# Test\n\n```mermaid\n' + code + '\n```\n'
    const { html, mediaFiles, tempDir } = exportSpec(md, { cachedSvgs: { [`${key}.svg`]: svgContent } })
    try {
      assert.ok(html.includes('src="data:image/svg+xml;base64,'), 'SVG should be embedded as data URI')
      assert.ok(!html.includes('src="media/'), 'should not use media/ path when embedding')
      assert.strictEqual(mediaFiles.length, 0, 'media/ should be empty')
      assert.ok(html.includes('class="mermaid-figure"'), 'should have mermaid-figure class')
      assert.ok(html.includes('width="'), 'width should be set')
      assert.ok(html.includes('height="'), 'height should be set')
    } finally { cleanup(tempDir) }
  })

})

describe('HTML export — mermaid diagrams cached (media/, embedImages=false)', () => {

  test('mermaid cached SVG is copied to media/', () => {
    const code = 'graph TD; A-->B'
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMermaidConfig } = require('../../../lib/common/mermaidConfig')
    const key = cacheKey(code, loadMermaidConfig(null))
    const svgContent = '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><text>A to B</text></svg>'

    const md = '# Test\n\n```mermaid\n' + code + '\n```\n'
    const { html, mediaFiles, mediaDir, tempDir } = exportSpec(md, {
      cachedSvgs: { [`${key}.svg`]: svgContent },
      embedImages: false
    })
    try {
      assert.ok(mediaFiles.some(f => f.endsWith('.svg')), 'SVG should be in media/')
      assert.ok(html.includes('src="media/'), 'img src should use relative media/ path')
      assert.ok(html.includes('class="mermaid-figure"'), 'should have mermaid-figure class')
      assert.ok(html.includes('width="'), 'width should be set')
      assert.ok(html.includes('height="'), 'height should be set')
      verifyMediaLinks(html, mediaDir)
    } finally { cleanup(tempDir) }
  })

})

// ---------------------------------------------------------------------------
// Mermaid diagrams (live rendering)
// ---------------------------------------------------------------------------
describe('HTML export — mermaid diagrams (rendering)', () => {

  test('mermaid diagram without cache is rendered if browser available', { skip: (() => {
    const { findBrowser, renderMermaidBatch } = require('../../../lib/common/mermaidRenderer')
    if (!findBrowser()) return 'no browser available'
    const result = renderMermaidBatch(['graph TD; A-->B'])
    return (result[0] && result[0].svg) ? undefined : 'mermaid rendering not available (browser cannot reach CDN)'
  })() }, () => {
    const md = '# Test\n\n```mermaid\ngraph TD; X-->Y\n```\n'
    const { html, tempDir } = exportSpec(md)
    try {
      assert.ok(html.includes('src="data:image/svg+xml;base64,'), 'SVG should be embedded as data URI')
      assert.ok(html.includes('class="mermaid-figure"'), 'should have mermaid-figure class')
    } finally { cleanup(tempDir) }
  })

  test('mermaid diagram falls back to code block when rendering fails', () => {
    const md = '# Test\n\n```mermaid\nINVALID_NOT_A_DIAGRAM @#$%\n```\n'
    const { html, tempDir } = exportSpec(md)
    try {
      assert.ok(
        html.includes('<pre class="mermaid"') || html.includes('INVALID_NOT_A_DIAGRAM'),
        'should show raw code as fallback'
      )
    } finally { cleanup(tempDir) }
  })

})

// ---------------------------------------------------------------------------
// MSC-Gen diagrams (cached)
// ---------------------------------------------------------------------------
describe('HTML export — mscgen diagrams cached (embedded, default)', () => {

  test('mscgen cached SVG is embedded as data URI', () => {
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble } = require('../../../lib/common/mscgenConfig')
    const configJson = loadMscgenConfig(null)
    const rawCode = 'a: A;\nb: B;\na->b: hello;'
    const code = applyMscgenPreamble(rawCode, parseMscgenPreamble(configJson))
    const key = cacheKey(code, configJson)
    const svgContent = '<svg viewBox="0 0 300 150"><text>A→B</text></svg>'

    const md = '# Test\n\n```mscgen\n' + rawCode + '\n```\n'
    const { html, mediaFiles, tempDir } = exportSpec(md, { cachedSvgs: { [`${key}.svg`]: svgContent } })
    try {
      assert.ok(html.includes('src="data:image/svg+xml;base64,'), 'SVG should be embedded as data URI')
      assert.ok(!html.includes('src="media/'), 'should not use media/ path when embedding')
      assert.strictEqual(mediaFiles.length, 0, 'media/ should be empty')
      assert.ok(html.includes('width="300"'), 'width should be set from viewBox')
      assert.ok(html.includes('height="150"'), 'height should be set from viewBox')
      assert.ok(html.includes('class="mscgen-figure"'), 'should have mscgen-figure class')
    } finally { cleanup(tempDir) }
  })

})

describe('HTML export — mscgen diagrams cached (media/, embedImages=false)', () => {

  test('mscgen cached SVG is copied to media/', () => {
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble } = require('../../../lib/common/mscgenConfig')
    const configJson = loadMscgenConfig(null)
    const rawCode = 'a: A;\nb: B;\na->b: hello;'
    const code = applyMscgenPreamble(rawCode, parseMscgenPreamble(configJson))
    const key = cacheKey(code, configJson)
    const svgContent = '<svg viewBox="0 0 300 150"><text>A→B</text></svg>'

    const md = '# Test\n\n```mscgen\n' + rawCode + '\n```\n'
    const { html, mediaFiles, mediaDir, tempDir } = exportSpec(md, {
      cachedSvgs: { [`${key}.svg`]: svgContent },
      embedImages: false
    })
    try {
      assert.ok(mediaFiles.some(f => f.endsWith('.svg')), 'SVG should be in media/')
      assert.ok(html.includes('src="media/'), 'img src should use relative media/ path')
      assert.ok(html.includes('width="300"'), 'width should be set from viewBox')
      assert.ok(html.includes('height="150"'), 'height should be set from viewBox')
      assert.ok(html.includes('class="mscgen-figure"'), 'should have mscgen-figure class')
      verifyMediaLinks(html, mediaDir)
    } finally { cleanup(tempDir) }
  })

})

// ---------------------------------------------------------------------------
// MSC-Gen diagrams (live rendering)
// ---------------------------------------------------------------------------
describe('HTML export — mscgen diagrams (rendering)', () => {

  test('mscgen diagram without cache is rendered if msc-gen available', { skip: (() => {
    const { findMscgen } = require('../../../lib/md2docx/handlers/mscgenHandler')
    return findMscgen() ? undefined : 'msc-gen not installed'
  })() }, () => {
    const md = '# Test\n\n```mscgen\na: A;\nb: B;\na->b: hello;\n```\n'
    const { html, tempDir } = exportSpec(md)
    try {
      assert.ok(html.includes('src="data:image/svg+xml;base64,'), 'SVG should be embedded as data URI')
      assert.ok(html.includes('class="mscgen-figure"'), 'should have mscgen-figure class')
    } finally { cleanup(tempDir) }
  })

  test('mscgen diagram falls back to code block when msc-gen not available', () => {
    const { findMscgen } = require('../../../lib/md2docx/handlers/mscgenHandler')
    if (findMscgen()) return // skip if msc-gen is installed
    const md = '# Test\n\n```mscgen\na: A;\nb: B;\na->b: hello;\n```\n'
    const { html, tempDir } = exportSpec(md)
    try {
      assert.ok(html.includes('<pre class="mscgen"'), 'should show raw code when msc-gen not available')
    } finally { cleanup(tempDir) }
  })

})

// ---------------------------------------------------------------------------
// Mixed content
// ---------------------------------------------------------------------------
describe('HTML export — mixed content (embedded, default)', () => {

  test('PNG, mermaid SVG, and mscgen SVG are all embedded as data URIs', () => {
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMermaidConfig } = require('../../../lib/common/mermaidConfig')
    const { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble } = require('../../../lib/common/mscgenConfig')

    const mermaidCode = 'graph LR; C-->D'
    const mermaidKey = cacheKey(mermaidCode, loadMermaidConfig(null))

    const mscgenRaw = 'x: X;\ny: Y;\nx->y: test;'
    const mscgenConfigJson = loadMscgenConfig(null)
    const mscgenKey = cacheKey(applyMscgenPreamble(mscgenRaw, parseMscgenPreamble(mscgenConfigJson)), mscgenConfigJson)

    const md = [
      '# Test', '',
      '![photo](assets/test.png)', '',
      '```mermaid', mermaidCode, '```', '',
      '```mscgen', mscgenRaw, '```', ''
    ].join('\n')

    const { html, mediaFiles, tempDir } = exportSpec(md, {
      withPng: true,
      cachedSvgs: {
        [`${mermaidKey}.svg`]: '<svg viewBox="0 0 400 80"><text>C→D</text></svg>',
        [`${mscgenKey}.svg`]: '<svg viewBox="0 0 250 120"><text>X→Y</text></svg>'
      }
    })
    try {
      assert.strictEqual(mediaFiles.length, 0, 'media/ should be empty when embedding')
      const imgTags = html.match(/<img[^>]+>/g) || []
      assert.strictEqual(imgTags.length, 3, 'should have 3 img tags total')
      for (const tag of imgTags) {
        assert.ok(tag.includes('src="data:'), `all img tags should have data URI: ${tag.substring(0, 80)}`)
        assert.ok(!tag.includes('vscode-resource'), 'no vscode-resource URIs')
      }
    } finally { cleanup(tempDir) }
  })

  test('no absolute paths, media/ paths, or protocol URIs leak into exported HTML', () => {
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMermaidConfig } = require('../../../lib/common/mermaidConfig')
    const code = 'graph TD; Z-->W'
    const key = cacheKey(code, loadMermaidConfig(null))

    const md = '# Test\n\n```mermaid\n' + code + '\n```\n'
    const { html, tempDir } = exportSpec(md, {
      cachedSvgs: { [`${key}.svg`]: '<svg viewBox="0 0 100 50"><text>Z</text></svg>' }
    })
    try {
      const imgSrcs = (html.match(/src="([^"]+)"/g) || []).map(s => s.slice(5, -1))
      for (const src of imgSrcs) {
        assert.ok(!path.isAbsolute(src), `should not have absolute path: ${src}`)
        assert.ok(!src.startsWith('http'), `should not have http URL: ${src}`)
        assert.ok(!src.includes('vscode'), `should not have vscode URI: ${src}`)
        assert.ok(!src.includes('file:'), `should not have file: URI: ${src}`)
        assert.ok(!src.startsWith('media/'), `should not have media/ path when embedding: ${src}`)
      }
    } finally { cleanup(tempDir) }
  })

})

describe('HTML export — mixed content (media/, embedImages=false)', () => {

  test('PNG, mermaid SVG, and mscgen SVG all use relative media/ paths', () => {
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMermaidConfig } = require('../../../lib/common/mermaidConfig')
    const { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble } = require('../../../lib/common/mscgenConfig')

    const mermaidCode = 'graph LR; C-->D'
    const mermaidKey = cacheKey(mermaidCode, loadMermaidConfig(null))

    const mscgenRaw = 'x: X;\ny: Y;\nx->y: test;'
    const mscgenConfigJson = loadMscgenConfig(null)
    const mscgenKey = cacheKey(applyMscgenPreamble(mscgenRaw, parseMscgenPreamble(mscgenConfigJson)), mscgenConfigJson)

    const md = [
      '# Test', '',
      '![photo](assets/test.png)', '',
      '```mermaid', mermaidCode, '```', '',
      '```mscgen', mscgenRaw, '```', ''
    ].join('\n')

    const { html, mediaFiles, mediaDir, tempDir } = exportSpec(md, {
      withPng: true,
      embedImages: false,
      cachedSvgs: {
        [`${mermaidKey}.svg`]: '<svg viewBox="0 0 400 80"><text>C→D</text></svg>',
        [`${mscgenKey}.svg`]: '<svg viewBox="0 0 250 120"><text>X→Y</text></svg>'
      }
    })
    try {
      assert.ok(mediaFiles.some(f => f.endsWith('.png')), 'PNG in media/')
      assert.strictEqual(mediaFiles.filter(f => f.endsWith('.svg')).length, 2, 'should have 2 SVGs in media/')
      const imgTags = html.match(/<img[^>]+>/g) || []
      assert.strictEqual(imgTags.length, 3, 'should have 3 img tags total')
      for (const tag of imgTags) {
        assert.ok(tag.includes('src="media/'), `all img tags should have relative media/ path: ${tag.substring(0, 80)}`)
        assert.ok(!tag.includes('vscode-resource'), 'no vscode-resource URIs')
      }
      const verified = verifyMediaLinks(html, mediaDir)
      assert.strictEqual(verified, 3, 'all 3 media references should resolve to existing files')
    } finally { cleanup(tempDir) }
  })

})

// ---------------------------------------------------------------------------
// Front pages
// ---------------------------------------------------------------------------
describe('HTML export — front pages', () => {

  test('standard front page is included when frontPageData is passed', () => {
    const { Md2Html } = require('../../../lib/md2html/md2html')
    const md = '# Scope\n\nSome content.\n'
    const tempDir = path.join(os.tmpdir(), `specpress-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const specDir = path.join(tempDir, 'spec')
    fs.mkdirSync(specDir, { recursive: true })
    try {
      const processor = new Md2Html({ specRootPath: specDir })
      const fpData = { SPEC_NUMBER: '38.999', VERSION: '1.0.0', DATE: '2025-01-01', TITLE: 'Test Spec' }
      const html = processor.renderMarkdownForExport(md, specDir, fpData)
      assert.ok(html.includes('38.999'), 'should contain spec number from front page')
      assert.ok(html.includes('Scope'), 'should still contain body content')
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }) }
  })

  test('CR cover page takes precedence over front page', () => {
    const { Md2Html } = require('../../../lib/md2html/md2html')
    const md = '# Scope\n\nSome content.\n'
    const tempDir = path.join(os.tmpdir(), `specpress-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const specDir = path.join(tempDir, 'spec')
    fs.mkdirSync(specDir, { recursive: true })
    try {
      const processor = new Md2Html({ specRootPath: specDir })
      const fpData = { SPEC_NUMBER: '38.999', VERSION: '1.0.0' }
      const crData = {
        TDoc: 'R2-1234567', CR: 42, Rev: 1, 'Current version': '17.5.0',
        Specification: '38.331', Title: 'Test CR Title', 'Source to WG': ['Ericsson'],
        Category: 'F', Reason: 'Correction', Summary: 'A test summary',
        Clauses: '5.3.1', Affected: {}
      }
      const html = processor.renderMarkdownForExport(md, specDir, fpData, crData)
      assert.ok(html.includes('CHANGE REQUEST') || html.includes('Test CR Title'), 'should contain CR cover page')
      assert.ok(!html.includes('38.999'), 'front page should NOT appear when CR is present')
      assert.ok(html.includes('Scope'), 'should still contain body content')
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }) }
  })

  test('no front page when frontPageData is null', () => {
    const { Md2Html } = require('../../../lib/md2html/md2html')
    const md = '# Scope\n\nContent.\n'
    const tempDir = path.join(os.tmpdir(), `specpress-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const specDir = path.join(tempDir, 'spec')
    fs.mkdirSync(specDir, { recursive: true })
    try {
      const processor = new Md2Html({ specRootPath: specDir })
      const html = processor.renderMarkdownForExport(md, specDir, null)
      assert.ok(!html.includes('front-page'), 'should NOT contain front page')
      assert.ok(html.includes('Content'), 'should contain body content')
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }) }
  })

  test('CR cover page with minimal metadata does not crash', () => {
    const { Md2Html } = require('../../../lib/md2html/md2html')
    const md = '# Scope\n\nContent.\n'
    const tempDir = path.join(os.tmpdir(), `specpress-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const specDir = path.join(tempDir, 'spec')
    fs.mkdirSync(specDir, { recursive: true })
    try {
      const processor = new Md2Html({ specRootPath: specDir })
      const crData = { CR: 1, Specification: '38.331', Title: 'Minimal' }
      const html = processor.renderMarkdownForExport(md, specDir, null, crData)
      assert.ok(html.includes('Content'), 'should still produce output with incomplete CR data')
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }) }
  })

})
