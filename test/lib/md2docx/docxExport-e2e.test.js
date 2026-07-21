/**
 * End-to-end test for DOCX export (export-docx pipeline).
 *
 * Verifies that all components end up correctly in the generated DOCX:
 * - PNG images embedded in word/media/
 * - Mermaid SVG diagrams with PNG fallback
 * - MSC-Gen SVG diagrams with PNG fallback
 * - Front page and CR cover page
 * - Figure captions (TF style)
 * - Fallback for render failures (PL style raw code)
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const JSZip = require('jszip')
const { Md2Docx } = require('../../../lib/md2docx/md2docx')

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

// Minimal 1x1 red PNG for test images
const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')

/**
 * Creates a temp spec directory with markdown and assets, converts to DOCX,
 * and returns the parsed ZIP for inspection.
 */
async function exportToDocx(md, opts = {}) {
  const tempDir = path.join(os.tmpdir(), `specpress-docx-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const specDir = path.join(tempDir, 'spec')
  const cacheDir = path.join(tempDir, 'cached')
  fs.mkdirSync(specDir, { recursive: true })

  // Write markdown
  fs.writeFileSync(path.join(specDir, '01 Test.md'), md)

  // Write PNG image if requested
  if (opts.withPng) {
    const assetsDir = path.join(specDir, 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    fs.writeFileSync(path.join(assetsDir, 'test.png'), TEST_PNG)
  }

  // Pre-populate SVG cache if requested
  if (opts.cachedSvgs) {
    fs.mkdirSync(cacheDir, { recursive: true })
    for (const [filename, content] of Object.entries(opts.cachedSvgs)) {
      fs.writeFileSync(path.join(cacheDir, filename), content)
    }
  }
  if (opts.cachedPngs) {
    fs.mkdirSync(cacheDir, { recursive: true })
    for (const [filename, content] of Object.entries(opts.cachedPngs)) {
      fs.writeFileSync(path.join(cacheDir, filename), content)
    }
  }

  const mdPath = path.join(specDir, '01 Test.md')
  const docxPath = path.join(tempDir, 'output.docx')

  const converter = new Md2Docx({
    mermaidConfig: opts.mermaidConfig || null,
    specRootPath: specDir,
    mermaidRenderer: opts.mermaidRenderer || null,
    updateFields: false,
    mscgenConfig: opts.mscgenConfig || null
  })

  const mdContent = fs.readFileSync(mdPath, 'utf8')
  await converter.convert(mdContent, docxPath, specDir, opts.frontPageData || null, {
    crCoverPageData: opts.crCoverPageData || null
  })

  const buf = fs.readFileSync(docxPath)
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml').async('string')
  const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('word/media/'))

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true })

  return { xml, zip, mediaFiles, converter }
}

/** Returns all text content from w:t elements. */
function findTexts(xml) {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, ''))
}

/** Returns all paragraph style IDs. */
function findStyles(xml) {
  return (xml.match(/w:pStyle w:val="([^"]+)"/g) || []).map(m => m.match(/"([^"]+)"/)[1])
}

async function run() {
  console.log('DOCX export — PNG images')

  await test('PNG image is embedded in word/media/', async () => {
    const md = '# Test\n\n![alt](assets/test.png)\n'
    const { mediaFiles } = await exportToDocx(md, { withPng: true })
    assert.ok(mediaFiles.some(f => f.endsWith('.png')), 'should have PNG in word/media/')
  })

  console.log('\nDOCX export — mermaid diagrams')

  await test('mermaid SVG is embedded with PNG fallback', async () => {
    const mockSvg = '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><text>test</text></svg>'
    const mockPng = TEST_PNG
    const renderer = async (codes) => codes.map(() => ({ svg: mockSvg, png: mockPng }))

    const md = '# Test\n\n```mermaid\ngraph TD; A-->B\n```\n'
    const { mediaFiles, xml, converter } = await exportToDocx(md, { mermaidRenderer: renderer })
    assert.ok(mediaFiles.some(f => f.endsWith('.svg')), 'should have SVG in word/media/')
    assert.ok(mediaFiles.some(f => f.endsWith('.png')), 'should have PNG fallback in word/media/')
    assert.strictEqual(converter.imageCount, 1, 'imageCount should be 1')
  })

  await test('mermaid render failure produces raw code in PL style', async () => {
    const renderer = async (codes) => codes.map(() => ({ svg: null, png: null }))
    const md = '# Test\n\n```mermaid\ngraph TD; BROKEN\n```\n'
    const { xml, converter } = await exportToDocx(md, { mermaidRenderer: renderer })
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('graph TD')), 'should contain raw mermaid source')
    assert.ok(findStyles(xml).includes('PL'), 'should use PL style for code fallback')
    assert.strictEqual(converter.imageCount, 0, 'imageCount should be 0')
  })

  console.log('\nDOCX export — mscgen diagrams')

  await test('mscgen SVG is embedded from cache with PNG fallback', async () => {
    const { cacheKey } = require('../../../lib/common/diagramCache')
    const { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble } = require('../../../lib/common/mscgenConfig')
    const configJson = loadMscgenConfig(null)
    const preamble = parseMscgenPreamble(configJson)
    const rawCode = 'a: A;\nb: B;\na->b: hello;'
    const code = applyMscgenPreamble(rawCode, preamble)
    const key = cacheKey(code, configJson)

    const svgContent = '<svg viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>'

    const md = '# Test\n\n```mscgen\n' + rawCode + '\n```\n'
    const { mediaFiles, converter } = await exportToDocx(md, {
      mscgenConfig: configJson,
      cachedSvgs: { [`${key}.svg`]: svgContent },
      cachedPngs: { [`${key}.png`]: TEST_PNG }
    })
    assert.ok(mediaFiles.some(f => f.endsWith('.svg')), 'should have SVG in word/media/')
    assert.ok(mediaFiles.some(f => f.endsWith('.png')), 'should have PNG fallback')
    assert.strictEqual(converter.imageCount, 1, 'imageCount should be 1')
  })

  await test('mscgen renders fresh if msc-gen is available', async () => {
    const { findMscgen } = require('../../../lib/md2docx/handlers/mscgenHandler')
    if (!findMscgen()) {
      console.log('    (skipped: msc-gen not installed)')
      passed++
      return
    }
    const md = '# Test\n\n```mscgen\nx: X;\ny: Y;\nx->y: msg;\n```\n'
    const { mediaFiles, converter } = await exportToDocx(md)
    assert.ok(mediaFiles.some(f => f.endsWith('.svg')), 'should have rendered SVG')
    assert.ok(mediaFiles.some(f => f.endsWith('.png')), 'should have rendered PNG fallback')
    assert.strictEqual(converter.imageCount, 1)
  })

  console.log('\nDOCX export — figure captions')

  await test('paragraph after diagram fence gets TF style', async () => {
    const renderer = async (codes) => codes.map(() => ({
      svg: '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><text>x</text></svg>',
      png: TEST_PNG
    }))
    const md = '# Test\n\n```mermaid\ngraph TD; A-->B\n```\n\nFigure 1: My caption\n'
    const { xml } = await exportToDocx(md, { mermaidRenderer: renderer })
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('My caption')), 'caption text should be present')
    assert.ok(findStyles(xml).includes('TF'), 'should have TF style for figure caption')
  })

  console.log('\nDOCX export — standard front page')

  await test('front page is included when frontPageData is provided', async () => {
    const md = '# Scope\n\nContent.\n'
    const frontPageData = { SPEC_NUMBER: '38.999', VERSION: '1.0.0', DATE: '2025-01-01', TITLE: 'Test Spec' }
    const { xml } = await exportToDocx(md, { frontPageData })
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('38.999')), 'should contain spec number from front page')
    assert.ok(texts.some(t => t.includes('Content')), 'should contain body content')
  })

  await test('no front page when frontPageData is null', async () => {
    const md = '# Scope\n\nContent.\n'
    const { xml } = await exportToDocx(md)
    const texts = findTexts(xml)
    assert.ok(!texts.some(t => t.includes('38.999')), 'should NOT contain spec number')
    assert.ok(texts.some(t => t.includes('Content')), 'should contain body content')
  })

  console.log('\nDOCX export — CR cover page')

  await test('CR cover page is included when crCoverPageData is provided', async () => {
    const md = '# Scope\n\nContent.\n'
    const crData = {
      TDoc: 'R2-1234567', CR: 42, Rev: 1, 'Current version': '17.5.0',
      Specification: '38.331', Title: 'Test CR', 'Source to WG': ['Ericsson'],
      Category: 'F', Reason: 'Fix', Summary: 'Summary', Clauses: '5.3.1', Affected: {}
    }
    const { xml } = await exportToDocx(md, { crCoverPageData: crData })
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('CHANGE REQUEST')), 'should contain CHANGE REQUEST')
    assert.ok(texts.some(t => t.includes('Test CR')), 'should contain CR title')
  })

  await test('CR cover page takes precedence over front page', async () => {
    const md = '# Scope\n\nContent.\n'
    const frontPageData = { SPEC_NUMBER: '38.999', VERSION: '1.0.0' }
    const crData = {
      TDoc: 'R2-001', CR: 1, Rev: 0, 'Current version': '1.0.0',
      Specification: '38.331', Title: 'CR Title', 'Source to WG': ['Test'],
      Category: 'F', Reason: 'R', Summary: 'S', Clauses: '1', Affected: {}
    }
    const { xml } = await exportToDocx(md, { frontPageData, crCoverPageData: crData })
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('CHANGE REQUEST')), 'CR cover page present')
    assert.ok(!texts.some(t => t.includes('38.999')), 'front page should NOT be present')
  })

  console.log('\nDOCX export — mixed content')

  await test('full document with PNG, mermaid, caption, and front page', async () => {
    const renderer = async (codes) => codes.map(() => ({
      svg: '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><text>diagram</text></svg>',
      png: TEST_PNG
    }))
    const md = [
      '# Scope',
      '',
      '![photo](assets/test.png)',
      '',
      '```mermaid',
      'graph TD; A-->B',
      '```',
      '',
      'Figure 1: Diagram caption',
      '',
      'Some paragraph text.',
      ''
    ].join('\n')
    const frontPageData = { SPEC_NUMBER: '38.100', VERSION: '2.0.0', TITLE: 'Mixed Test' }
    const { xml, mediaFiles, converter } = await exportToDocx(md, {
      withPng: true,
      mermaidRenderer: renderer,
      frontPageData
    })
    const texts = findTexts(xml)
    const styles = findStyles(xml)

    // Front page
    assert.ok(texts.some(t => t.includes('38.100')), 'front page spec number present')

    // PNG image
    assert.ok(mediaFiles.filter(f => f.endsWith('.png')).length >= 2, 'should have at least 2 PNGs (photo + mermaid fallback)')

    // Mermaid SVG
    assert.ok(mediaFiles.some(f => f.endsWith('.svg')), 'mermaid SVG present')

    // Figure caption
    assert.ok(texts.some(t => t.includes('Diagram caption')), 'caption text present')
    assert.ok(styles.includes('TF'), 'TF style present')

    // Body text
    assert.ok(texts.some(t => t.includes('Some paragraph text')), 'body paragraph present')

    // Image count
    assert.strictEqual(converter.imageCount, 2, 'should count photo + diagram = 2 images')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run()
