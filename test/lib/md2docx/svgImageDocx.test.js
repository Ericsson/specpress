const { test, describe } = require('node:test')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const JSZip = require('jszip')
const { Md2Docx } = require('../../../lib/md2docx/md2docx')

// Minimal inline SVG (not a cached/rendered diagram — a plain markdown image link).
const RED_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>'
)

/** Converts markdown to DOCX (image served from an in-memory resolver) and inspects document.xml. */
async function convertAndInspect(md, fileBuffer) {
  const fileResolver = { readFile: () => fileBuffer, exists: () => true }
  const converter = new Md2Docx({ fileResolver })
  const docxPath = path.join(os.tmpdir(), `.~svgimg_${Date.now()}_${Math.random().toString(36).slice(2)}.docx`)
  try {
    await converter.convert(md, docxPath, os.tmpdir())
    const zip = await JSZip.loadAsync(fs.readFileSync(docxPath))
    const xml = await zip.file('word/document.xml').async('string')
    return { xml, imageCount: converter.imageCount }
  } finally {
    if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath)
  }
}

describe('DOCX export — plain markdown image links', () => {

  test('an SVG image link is embedded as a drawing, not a fallback placeholder', async () => {
    const { xml, imageCount } = await convertAndInspect('![a](x.svg)\n', RED_SVG)
    assert.strictEqual(imageCount, 1, 'image should be counted as embedded')
    assert.ok(xml.includes('<w:drawing>'), 'document should contain a drawing element')
    assert.ok(!xml.includes('[Image: a]'), 'should not fall back to placeholder text')
  })

  test('an SVG image link produces dimensions derived from its own viewBox/width/height', async () => {
    const { xml } = await convertAndInspect('![a](x.svg)\n', RED_SVG)
    const m = xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)
    assert.ok(m, 'extent should be present')
    // 200x100 at 2:1 aspect ratio should be preserved regardless of scaling.
    const cx = parseInt(m[1], 10)
    const cy = parseInt(m[2], 10)
    assert.strictEqual(Math.round(cx / cy), 2, 'aspect ratio should be preserved (2:1)')
  })
})
