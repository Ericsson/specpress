const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const JSZip = require('jszip')
const { Md2Docx } = require('../../../../lib/md2docx/md2docx')
const { FileResolver } = require('../../../../lib/common/fileResolver')

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  \u2713 ${name}`)
    passed++
  } catch (e) {
    console.log(`  \u2717 ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

// Minimal 1x1 red PNG for testing
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
)

/**
 * Creates a FileResolver-like object backed by a custom read function,
 * for testing purposes.
 */
function makeTestResolver(readFn) {
  return {
    readFile: (filePath) => readFn(filePath),
    exists: (filePath) => { try { readFn(filePath); return true } catch(e) { return false } }
  }
}

/**
 * Converts markdown to DOCX with a custom fileResolver and returns parsed content.
 */
async function mdToDocXmlWithResolver(md, fileResolver, baseDir) {
  const converter = new Md2Docx({ fileResolver })
  const tmp = os.tmpdir()
  const ts = Date.now() + '_' + Math.random().toString(36).slice(2)
  const docxPath = path.join(tmp, `.~resolver_test_${ts}.docx`)
  try {
    await converter.convert(md, docxPath, baseDir || tmp)
    const buf = fs.readFileSync(docxPath)
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml').async('string')
    return { xml, zip, converter }
  } finally {
    if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath)
  }
}

async function run() {
  console.log('fileResolver \u2014 images')

  await test('image is read via fileResolver instead of filesystem', async () => {
    let resolvedPath = null
    const fileResolver = makeTestResolver((filePath) => {
      resolvedPath = filePath
      return RED_PNG
    })
    const md = '![test image](fake-image-from-resolver.png)\n'
    const { converter } = await mdToDocXmlWithResolver(md, fileResolver)
    assert.ok(resolvedPath, 'fileResolver should have been called')
    assert.ok(resolvedPath.includes('fake-image-from-resolver.png'), `should resolve the image path, got: ${resolvedPath}`)
    assert.strictEqual(converter.imageCount, 1, 'image should be embedded')
  })

  await test('image from fileResolver is embedded in DOCX media', async () => {
    const fileResolver = makeTestResolver(() => RED_PNG)
    const md = '![alt](resolved-image.png)\n'
    const { zip } = await mdToDocXmlWithResolver(md, fileResolver)
    const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('word/media/'))
    assert.ok(mediaFiles.length >= 1, 'should have at least one media file')
  })

  await test('without fileResolver, missing image produces fallback text', async () => {
    const converter = new Md2Docx()
    const tmp = os.tmpdir()
    const ts = Date.now() + '_' + Math.random().toString(36).slice(2)
    const docxPath = path.join(tmp, `.~noresolver_${ts}.docx`)
    try {
      await converter.convert('![alt](nonexistent-file.png)\n', docxPath, tmp)
      const buf = fs.readFileSync(docxPath)
      const zip = await JSZip.loadAsync(buf)
      const xml = await zip.file('word/document.xml').async('string')
      assert.ok(xml.includes('[Image: alt]'), 'should have fallback text for missing image')
      assert.strictEqual(converter.imageCount, 0, 'no image should be embedded')
    } finally {
      if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath)
    }
  })

  console.log('\nfileResolver \u2014 linked JsonTable')

  await test('linked JsonTable is read via fileResolver', async () => {
    let resolvedPath = null
    const jsonData = JSON.stringify({
      columns: [{ key: 'a', name: 'Col A' }],
      rows: [{ a: 'from resolver' }]
    })
    const fileResolver = makeTestResolver((filePath) => {
      if (filePath.endsWith('.json')) {
        resolvedPath = filePath
        return Buffer.from(jsonData, 'utf8')
      }
      return RED_PNG
    })
    const md = '[JsonTable](fake-table.json)\n'
    const { xml } = await mdToDocXmlWithResolver(md, fileResolver)
    assert.ok(resolvedPath, 'fileResolver should have been called for JSON')
    assert.ok(resolvedPath.includes('fake-table.json'), `should resolve the JSON path, got: ${resolvedPath}`)
    assert.ok(xml.includes('from resolver'), 'table content from resolver should appear in DOCX')
  })

  await test('linked JsonTable from fileResolver renders correct cell content', async () => {
    const jsonData = JSON.stringify({
      columns: [{ key: 'x', name: 'Header' }, { key: 'y', name: 'Value' }],
      rows: [{ x: 'key1', y: 'val1' }, { x: 'key2', y: 'val2' }]
    })
    const fileResolver = makeTestResolver((filePath) => {
      if (filePath.endsWith('.json')) return Buffer.from(jsonData, 'utf8')
      return RED_PNG
    })
    const md = '[JsonTable](data.json)\n'
    const { xml } = await mdToDocXmlWithResolver(md, fileResolver)
    assert.ok(xml.includes('key1'), 'should contain first row data')
    assert.ok(xml.includes('val2'), 'should contain second row data')
    assert.ok(xml.includes('Header'), 'should contain column header')
  })

  await test('without fileResolver, missing JsonTable produces error text', async () => {
    const converter = new Md2Docx()
    const tmp = os.tmpdir()
    const ts = Date.now() + '_' + Math.random().toString(36).slice(2)
    const docxPath = path.join(tmp, `.~nojson_${ts}.docx`)
    try {
      await converter.convert('[JsonTable](nonexistent.json)\n', docxPath, tmp)
      const buf = fs.readFileSync(docxPath)
      const zip = await JSZip.loadAsync(buf)
      const xml = await zip.file('word/document.xml').async('string')
      assert.ok(xml.includes('JsonTable error'), 'should have error text for missing JSON')
    } finally {
      if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath)
    }
  })

  console.log('\nfileResolver \u2014 combined scenario')

  await test('document with both image and JsonTable uses fileResolver for both', async () => {
    const resolvedPaths = []
    const jsonData = JSON.stringify({
      columns: [{ key: 'c', name: 'Column' }],
      rows: [{ c: 'table-value' }]
    })
    const fileResolver = makeTestResolver((filePath) => {
      resolvedPaths.push(filePath)
      if (filePath.endsWith('.json')) return Buffer.from(jsonData, 'utf8')
      return RED_PNG
    })
    const md = '![img](picture.png)\n\n[JsonTable](table.json)\n'
    const { xml, converter } = await mdToDocXmlWithResolver(md, fileResolver)
    assert.ok(resolvedPaths.some(p => p.includes('picture.png')), 'should resolve image')
    assert.ok(resolvedPaths.some(p => p.includes('table.json')), 'should resolve JSON')
    assert.strictEqual(converter.imageCount, 1, 'image should be embedded')
    assert.ok(xml.includes('table-value'), 'table content should appear')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
