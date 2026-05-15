const fs = require('fs')
const path = require('path')

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates')

/**
 * Builds the 3GPP front page HTML with placeholder substitution.
 *
 * Loads the built-in template from lib/templates/cover_template.htm, substitutes
 * {{PLACEHOLDER}} values from the data object, and resolves logo image
 * paths to absolute file paths in the templates directory.
 *
 * @param {Object} data - Placeholder values (SPEC_NUMBER, VERSION, DATE, DOC_TYPE, TSG, TITLE, RELEASE, KEYWORDS).
 * @returns {string} Rendered front page HTML, or empty string if template not found.
 */
function buildFrontPageHtml(data) {
  if (!data) return ''
  const templatePath = path.join(TEMPLATES_DIR, 'cover_template.htm')
  if (!fs.existsSync(templatePath)) return ''

  let html = fs.readFileSync(templatePath, 'utf8')

  // Derive YEAR from DATE if not provided
  const d = Object.assign({}, data)
  if (!d.YEAR && d.DATE) d.YEAR = d.DATE.split('-')[0] || ''

  // Substitute placeholders
  html = html.replace(/\{\{(\w+)\}\}/g, (match, key) => d[key] !== undefined ? d[key] : match)

  // Embed images as base64 data URIs for portability (webviews, export, diff)
  html = html.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (match, before, src, after) => {
    if (src.startsWith('http') || src.startsWith('data:')) return match
    const imgPath = path.isAbsolute(src) ? src : path.join(TEMPLATES_DIR, src)
    if (!fs.existsSync(imgPath)) return match
    const ext = path.extname(imgPath).toLowerCase().slice(1)
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    const b64 = fs.readFileSync(imgPath).toString('base64')
    return `<img${before}src="data:${mime};base64,${b64}"${after}>`
  })

  return html
}

module.exports = { buildFrontPageHtml }
