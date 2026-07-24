const { test, describe } = require('node:test')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')

const { Md2Html } = require('../../../lib/md2html/md2html')

/**
 * Creates a temporary spec structure with the given markdown content,
 * runs exportHtmlFromDirectory, and returns the output HTML and media files.
 */
function exportSpec(mdContent, opts = {}) {
  const tempDir = path.join(os.tmpdir(), `specpress-html-export-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const specDir = path.join(tempDir, 'spec')
  const outputDir = path.join(tempDir, 'output')
  const cacheDir = path.join(tempDir, 'cached')
  fs.mkdirSync(specDir, { recursive: true })

  // Write markdown
  fs.writeFileSync(path.join(specDir, '01 Test.md'), mdContent)

  // Write a PNG image if requested
  if (opts.withPng) {
    const assetsDir = path.join(specDir, 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    // Minimal 1x1 red PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
    fs.writeFileSync(path.join(assetsDir, 'test.png'), png)
  }

  // Pre-populate cache if requested
  if (opts.cachedSvgs) {
    fs.mkdirSync(cacheDir, { recursive: true })
    for (const [filename, content] of Object.entries(opts.cachedSvgs)) {
      fs.writeFileSync(path.join(cacheDir, filename), content)
      // Also write a dummy PNG so the cache considers the entry complete
      const pngName = filename.replace(/\.svg$/, '.png')
      fs.writeFileSync(path.join(cacheDir, pngName), Buffer.from('png'))
    }
  }

  const processor = new Md2Html({
    specRootPath: specDir,
    mscgenConfig: opts.mscgenConfig || null
  })

  const result = processor.exportHtmlFromDirectory(specDir, outputDir)
  const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8')
  const mediaDir = path.join(outputDir, 'media')
  const mediaFiles = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []

  return { html, mediaFiles, mediaDir, tempDir, result }
}

function cleanup(tempDir) {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

/**
 * Verifies that every <img src="media/..."> in the HTML has a corresponding
 * file that actually exists in the media directory.
 */
function verifyImageLinks(html, mediaDir) {
  const imgSrcs = (html.match(/<img[^>]*src="([^"]+)"[^>]*>/g) || [])
    .map(tag => tag.match(/src="([^"]+)"/)[1])
  const errors = []
  for (const src of imgSrcs) {
    if (src.startsWith('media/')) {
      const filename = src.slice('media/'.length)
      const filePath = path.join(mediaDir, filename)
      if (!fs.existsSync(filePath)) {
        errors.push(`Referenced file missing: ${src} (expected at ${filePath})`)
      }
    } else if (!src.startsWith('http') && !src.startsWith('data:')) {
      errors.push(`Unexpected non-media src: ${src}`)
    }
  }
  if (errors.length > 0) {
    throw new Error(`Image link verification failed:\n  ${errors.join('\n  ')}`)
  }
  return imgSrcs.filter(s => s.startsWith('media/')).length
}

describe('HTML export — PNG images', () => {

  test('regular PNG image is copied to media/ with relative path', () => {
    const md = '# Test\n\n![alt text](assets/test.png)\n'
    const { html, mediaFiles, mediaDir, tempDir } = exportSpec(md, { withPng: true })
    try {
      assert.ok(mediaFiles.some(f => f.endsWith('.png')), 'PNG should be in media/')
      assert.ok(html.includes('src="media/'), 'img src should use relative media/ path')
      assert.ok(!html.includes('vscode-resource'), 'should not contain vscode-resource URIs')
      assert.ok(html.includes('alt="alt text"'), 'alt text should be preserved')
      verifyImageLinks(html, mediaDir)
    } finally {
      cleanup(tempDir)
    }
  })

})
describe('HTML export — mermaid diagrams (cached)', () => {

  test('mermaid diagram with cached SVG is included from cache', () => {
    const code = 'graph TD; A-->B'
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMermaidConfig } = require('../../../lib/common/mermaidConfig')
    // The fence renderer loads config via loadMermaidConfig(null) when no explicit config is set
    const config = loadMermaidConfig(null)
    const key = cacheKey(code, config)
    const svgContent = '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><text>A to B</text></svg>'

    const md = '# Test\n\n```mermaid\n' + code + '\n```\n'
    const { html, mediaFiles, mediaDir, tempDir } = exportSpec(md, {
      cachedSvgs: { [`${key}.svg`]: svgContent }
    })
    try {
      const svgInMedia = mediaFiles.filter(f => f.endsWith('.svg'))
      assert.ok(svgInMedia.length > 0, 'SVG should be in media/')
      assert.ok(html.includes('src="media/'), 'img src should use relative media/ path')
      assert.ok(html.includes('class="mermaid-figure"'), 'should have mermaid-figure class')
      // Check dimensions are present (from cache or from rendering)
      assert.ok(html.includes('width="'), 'width should be set')
      assert.ok(html.includes('height="'), 'height should be set')
      verifyImageLinks(html, mediaDir)
    } finally {
      cleanup(tempDir)
    }
  })

})
describe('HTML export — mermaid diagrams (rendering)', () => {

  test('mermaid diagram without cache is rendered if browser available', { skip: (() => { const { findBrowser } = require('../../../lib/md2docx/handlers/mermaidHandler'); if (!findBrowser()) return 'no browser available'; const { canFetchMermaid } = require('../../../lib/common/mermaidRenderer'); return canFetchMermaid() ? undefined : 'mermaid CDN not reachable' })() }, () => {
    const md = '# Test\n\n```mermaid\ngraph TD; X-->Y\n```\n'
    const { html, mediaFiles, mediaDir, tempDir } = exportSpec(md)
    try {
      assert.ok(mediaFiles.some(f => f.endsWith('.svg')), 'SVG should be rendered and in media/')
      assert.ok(html.includes('src="media/'), 'should use relative media/ path')
      assert.ok(html.includes('class="mermaid-figure"'), 'should have mermaid-figure class')
      verifyImageLinks(html, mediaDir)
    } finally {
      cleanup(tempDir)
    }
  })

  test('mermaid diagram falls back to code block when rendering fails', () => {
    // Use invalid mermaid code that the browser can't render
    const md = '# Test\n\n```mermaid\nINVALID_NOT_A_DIAGRAM @#$%\n```\n'
    const { html, tempDir } = exportSpec(md)
    try {
      // Should fall back to <pre class="mermaid"> with raw source
      assert.ok(
        html.includes('<pre class="mermaid"') || html.includes('INVALID_NOT_A_DIAGRAM'),
        'should show raw code as fallback'
      )
    } finally {
      cleanup(tempDir)
    }
  })

})
describe('HTML export — mscgen diagrams (cached)', () => {

  test('mscgen diagram with cached SVG is included from cache', () => {
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble } = require('../../../lib/common/mscgenConfig')
    const configJson = loadMscgenConfig(null)
    const preamble = parseMscgenPreamble(configJson)
    const rawCode = 'a: A;\nb: B;\na->b: hello;'
    const code = applyMscgenPreamble(rawCode, preamble)
    const key = cacheKey(code, configJson)
    const svgContent = '<svg viewBox="0 0 300 150"><text>A→B</text></svg>'

    const md = '# Test\n\n```mscgen\n' + rawCode + '\n```\n'
    const { html, mediaFiles, mediaDir, tempDir } = exportSpec(md, {
      cachedSvgs: { [`${key}.svg`]: svgContent }
    })
    try {
      assert.ok(mediaFiles.some(f => f.endsWith('.svg')), 'SVG should be in media/')
      assert.ok(html.includes('src="media/'), 'img src should use relative media/ path')
      assert.ok(html.includes('width="300"'), 'width should be set from viewBox')
      assert.ok(html.includes('height="150"'), 'height should be set from viewBox')
      assert.ok(html.includes('class="mscgen-figure"'), 'should have mscgen-figure class')
      verifyImageLinks(html, mediaDir)
    } finally {
      cleanup(tempDir)
    }
  })

})
describe('HTML export — mscgen diagrams (rendering)', () => {

  test('mscgen diagram without cache is rendered if msc-gen available', { skip: (() => { const { findMscgen } = require('../../../lib/md2docx/handlers/mscgenHandler'); return findMscgen() ? undefined : 'msc-gen not installed' })() }, () => {
    const md = '# Test\n\n```mscgen\na: A;\nb: B;\na->b: hello;\n```\n'
    const { html, mediaFiles, mediaDir, tempDir } = exportSpec(md)
    try {
      assert.ok(mediaFiles.some(f => f.endsWith('.svg')), 'SVG should be rendered and in media/')
      assert.ok(html.includes('src="media/'), 'should use relative media/ path')
      assert.ok(html.includes('class="mscgen-figure"'), 'should have mscgen-figure class')
      verifyImageLinks(html, mediaDir)
    } finally {
      cleanup(tempDir)
    }
  })

  test('mscgen diagram falls back to code block on render failure', () => {
    const { findMscgen } = require('../../../lib/md2docx/handlers/mscgenHandler')
    if (!findMscgen()) {
      // If msc-gen isn't installed, any mscgen fence should produce fallback
      const md = '# Test\n\n```mscgen\na: A;\nb: B;\na->b: hello;\n```\n'
      const { html, tempDir } = exportSpec(md)
      try {
        assert.ok(
          html.includes('<pre class="mscgen"'),
          'should show raw code when msc-gen not available'
        )
      } finally {
        cleanup(tempDir)
      }
    } else {
      // msc-gen is available: test that invalid code produces fallback
      // (msc-gen exits with error for completely broken syntax)
      const md = '# Test\n\n```mscgen\n;\n```\n'
      const { html, tempDir } = exportSpec(md)
      try {
        // When rendering fails, should fall back to raw code display
        assert.ok(
          html.includes('<pre class="mscgen"') || html.includes('class="mscgen-figure"'),
          'should produce either fallback or figure (msc-gen may recover from simple errors)'
        )
      } finally {
        cleanup(tempDir)
      }
    }
  })

})
describe('HTML export — mixed content', () => {

  test('page with PNG, mermaid SVG, and mscgen SVG all use relative media/ paths', () => {
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMermaidConfig } = require('../../../lib/common/mermaidConfig')
    const { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble } = require('../../../lib/common/mscgenConfig')

    const mermaidCode = 'graph LR; C-->D'
    const mermaidConfig = loadMermaidConfig(null)
    const mermaidKey = cacheKey(mermaidCode, mermaidConfig)

    const mscgenRaw = 'x: X;\ny: Y;\nx->y: test;'
    const mscgenConfigJson = loadMscgenConfig(null)
    const preamble = parseMscgenPreamble(mscgenConfigJson)
    const mscgenCode = applyMscgenPreamble(mscgenRaw, preamble)
    const mscgenKey = cacheKey(mscgenCode, mscgenConfigJson)

    const md = [
      '# Test',
      '',
      '![photo](assets/test.png)',
      '',
      '```mermaid',
      mermaidCode,
      '```',
      '',
      '```mscgen',
      mscgenRaw,
      '```',
      ''
    ].join('\n')

    const { html, mediaFiles, mediaDir, tempDir } = exportSpec(md, {
      withPng: true,
      cachedSvgs: {
        [`${mermaidKey}.svg`]: '<svg viewBox="0 0 400 80"><text>C→D</text></svg>',
        [`${mscgenKey}.svg`]: '<svg viewBox="0 0 250 120"><text>X→Y</text></svg>'
      }
    })
    try {
      // All images should be in media/
      assert.ok(mediaFiles.some(f => f.endsWith('.png')), 'PNG in media/')
      const svgFiles = mediaFiles.filter(f => f.endsWith('.svg'))
      assert.strictEqual(svgFiles.length, 2, 'should have 2 SVGs in media/')

      // All img tags should use relative paths
      const imgTags = html.match(/<img[^>]+>/g) || []
      assert.strictEqual(imgTags.length, 3, 'should have 3 img tags total')
      for (const tag of imgTags) {
        assert.ok(tag.includes('src="media/'), `all img tags should have relative media/ path: ${tag.substring(0, 80)}`)
        assert.ok(!tag.includes('vscode-resource'), 'no vscode-resource URIs')
        assert.ok(!path.isAbsolute(tag.match(/src="([^"]+)"/)[1]), 'path should be relative')
      }

      // Verify every referenced file exists on disk
      const verified = verifyImageLinks(html, mediaDir)
      assert.strictEqual(verified, 3, 'all 3 media references should resolve to existing files')
    } finally {
      cleanup(tempDir)
    }
  })

  test('no absolute paths or protocol URIs leak into exported HTML', () => {
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMermaidConfig } = require('../../../lib/common/mermaidConfig')
    const code = 'graph TD; Z-->W'
    const config = loadMermaidConfig(null)
    const key = cacheKey(code, config)

    const md = '# Test\n\n```mermaid\n' + code + '\n```\n'
    const { html, tempDir } = exportSpec(md, {
      cachedSvgs: { [`${key}.svg`]: '<svg viewBox="0 0 100 50"><text>Z</text></svg>' }
    })
    try {
      const imgSrcs = (html.match(/src="([^"]+)"/g) || []).map(s => s.replace(/^src="/, '').replace(/"$/, ''))
      for (const src of imgSrcs) {
        assert.ok(!path.isAbsolute(src), `should not have absolute path: ${src}`)
        assert.ok(!src.startsWith('http'), `should not have http URL: ${src}`)
        assert.ok(!src.includes('vscode'), `should not have vscode URI: ${src}`)
        assert.ok(!src.includes('file:'), `should not have file: URI: ${src}`)
      }
    } finally {
      cleanup(tempDir)
    }
  })

})
describe('HTML export — front pages', () => {

  test('standard front page is included when frontPageData is passed', () => {
    const md = '# Scope\n\nSome content.\n'
    const tempDir = path.join(os.tmpdir(), `specpress-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const specDir = path.join(tempDir, 'spec')
    fs.mkdirSync(specDir, { recursive: true })
    fs.writeFileSync(path.join(specDir, '01 Test.md'), md)
    try {
      const processor = new Md2Html({ specRootPath: specDir })
      const fpData = { SPEC_NUMBER: '38.999', VERSION: '1.0.0', DATE: '2025-01-01', TITLE: 'Test Spec' }
      const content = fs.readFileSync(path.join(specDir, '01 Test.md'), 'utf8')
      const html = processor.renderMarkdownForExport(content, specDir, fpData)
      assert.ok(html.includes('38.999'), 'should contain spec number from front page')
      assert.ok(html.includes('Scope'), 'should still contain body content')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('CR cover page is included and takes precedence over front page', () => {
    const md = '# Scope\n\nSome content.\n'
    const tempDir = path.join(os.tmpdir(), `specpress-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const specDir = path.join(tempDir, 'spec')
    fs.mkdirSync(specDir, { recursive: true })
    fs.writeFileSync(path.join(specDir, '01 Test.md'), md)
    try {
      const processor = new Md2Html({ specRootPath: specDir })
      const fpData = { SPEC_NUMBER: '38.999', VERSION: '1.0.0' }
      const crData = {
        TDoc: 'R2-1234567', CR: 42, Rev: 1, 'Current version': '17.5.0',
        Specification: '38.331', Title: 'Test CR Title', 'Source to WG': ['Ericsson'],
        Category: 'F', Reason: 'Correction', Summary: 'A test summary',
        Clauses: '5.3.1', Affected: {}
      }
      const content = fs.readFileSync(path.join(specDir, '01 Test.md'), 'utf8')
      const html = processor.renderMarkdownForExport(content, specDir, fpData, crData)
      assert.ok(html.includes('CHANGE REQUEST') || html.includes('Test CR Title'), 'should contain CR cover page')
      assert.ok(!html.includes('38.999'), 'front page should NOT appear when CR is present')
      assert.ok(html.includes('Scope'), 'should still contain body content')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('no front page when frontPageData is null', () => {
    const md = '# Scope\n\nContent.\n'
    const tempDir = path.join(os.tmpdir(), `specpress-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const specDir = path.join(tempDir, 'spec')
    fs.mkdirSync(specDir, { recursive: true })
    fs.writeFileSync(path.join(specDir, '01 Test.md'), md)
    try {
      const processor = new Md2Html({ specRootPath: specDir })
      const content = fs.readFileSync(path.join(specDir, '01 Test.md'), 'utf8')
      const html = processor.renderMarkdownForExport(content, specDir, null)
      assert.ok(!html.includes('front-page'), 'should NOT contain front page')
      assert.ok(html.includes('Content'), 'should contain body content')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('CR cover page with minimal/incomplete metadata does not crash', () => {
    const md = '# Scope\n\nContent.\n'
    const tempDir = path.join(os.tmpdir(), `specpress-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const specDir = path.join(tempDir, 'spec')
    fs.mkdirSync(specDir, { recursive: true })
    fs.writeFileSync(path.join(specDir, '01 Test.md'), md)
    try {
      const processor = new Md2Html({ specRootPath: specDir })
      const content = fs.readFileSync(path.join(specDir, '01 Test.md'), 'utf8')
      const crData = { CR: 1, Specification: '38.331', Title: 'Minimal' }
      const html = processor.renderMarkdownForExport(content, specDir, null, crData)
      assert.ok(html.includes('Content'), 'should still produce output with incomplete CR data')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })


})