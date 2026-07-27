const MAX_IMAGE_WIDTH = 600
const MIN_IMAGE_DPI = 125
const DOCX_PPI = 96

/**
 * Reads image dimensions from a buffer by parsing file headers.
 * Supports PNG, JPEG, GIF, and BMP.
 *
 * @param {Buffer} buf - Image file buffer.
 * @param {string} ext - File extension (without dot).
 * @returns {{ width: number, height: number }}
 */
function getImageDimensions(buf, ext) {
  try {
    if (ext === 'png' && buf.length > 24 && buf.readUInt32BE(0) === 0x89504E47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
    if ((ext === 'jpg' || ext === 'jpeg') && buf[0] === 0xFF && buf[1] === 0xD8) {
      let i = 2
      while (i < buf.length - 1) {
        if (buf[i] !== 0xFF) break
        const marker = buf[i + 1]
        if (marker === 0xC0 || marker === 0xC2) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
        }
        const len = buf.readUInt16BE(i + 2)
        i += 2 + len
      }
    }
    if (ext === 'gif' && buf.length > 10) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    }
    if (ext === 'bmp' && buf.length > 26) {
      return { width: buf.readUInt32LE(18), height: Math.abs(buf.readInt32LE(22)) }
    }
  } catch (e) { /* fall through */ }
  return { width: MAX_IMAGE_WIDTH, height: 400 }
}

/**
 * Scales image dimensions for DOCX embedding.
 * Caps at MAX_IMAGE_WIDTH but never scales down below MIN_IMAGE_DPI.
 *
 * @param {number} width - Native pixel width.
 * @param {number} height - Native pixel height.
 * @returns {{ width: number, height: number }}
 */
function scaleToFit(width, height) {
  const maxByDpi = Math.round(width * DOCX_PPI / MIN_IMAGE_DPI)
  const targetWidth = Math.min(MAX_IMAGE_WIDTH, maxByDpi)
  if (width <= targetWidth) return { width, height }
  return { width: targetWidth, height: Math.round(height * (targetWidth / width)) }
}

module.exports = { getImageDimensions, scaleToFit, MAX_IMAGE_WIDTH }
