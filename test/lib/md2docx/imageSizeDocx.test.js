const { test, describe } = require('node:test')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const JSZip = require('jszip')
const { Md2Docx } = require('../../../lib/md2docx/md2docx')

// Minimal 1x1 red PNG (native size 1x1, so scaled dimensions are driven
// entirely by the explicit {width=/height=} block).
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
)

// docx embeds picture extents in EMU; 1 pixel = 9525 EMU.
const EMU_PER_PX = 9525

/** Converts markdown to DOCX (image served from an in-memory resolver) and returns the extent. */
async function firstExtent(md) {
  const fileResolver = { readFile: () => RED_PNG, exists: () => true }
  const converter = new Md2Docx({ fileResolver })
  const docxPath = path.join(os.tmpdir(), `.~imgsize_${Date.now()}_${Math.random().toString(36).slice(2)}.docx`)
  try {
    await converter.convert(md, docxPath, os.tmpdir())
    const zip = await JSZip.loadAsync(fs.readFileSync(docxPath))
    const xml = await zip.file('word/document.xml').async('string')
    const m = xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)
    return m ? { cx: parseInt(m[1], 10), cy: parseInt(m[2], 10), imageCount: converter.imageCount } : null
  } finally {
    if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath)
  }
}

describe('DOCX export — explicit image size {width=/height=}', () => {

  test('{width=300} scales the image to 300px wide', async () => {
    const ext = await firstExtent('![a](x.png){width=300}\n')
    assert.ok(ext, 'image extent should be present')
    assert.strictEqual(ext.cx, 300 * EMU_PER_PX, 'width should be 300px in EMU')
    // 1x1 native aspect ratio → height auto-calculated equal to width
    assert.strictEqual(ext.cy, 300 * EMU_PER_PX, 'height should be auto-calculated from aspect ratio')
    assert.strictEqual(ext.imageCount, 1)
  })

  test('{width=300 height=150} applies explicit width and height', async () => {
    const ext = await firstExtent('![a](x.png){width=300 height=150}\n')
    assert.ok(ext, 'image extent should be present')
    assert.strictEqual(ext.cx, 300 * EMU_PER_PX)
    assert.strictEqual(ext.cy, 150 * EMU_PER_PX)
  })

  test('{width=50%} scales relative to the max body width (600px)', async () => {
    const ext = await firstExtent('![a](x.png){width=50%}\n')
    assert.ok(ext, 'image extent should be present')
    // MAX_IMAGE_WIDTH (600) * 50% = 300px
    assert.strictEqual(ext.cx, 300 * EMU_PER_PX, '50% should resolve to 300px')
  })

  test('{width=300px} strips the px unit', async () => {
    const ext = await firstExtent('![a](x.png){width=300px}\n')
    assert.ok(ext, 'image extent should be present')
    assert.strictEqual(ext.cx, 300 * EMU_PER_PX)
  })
})
