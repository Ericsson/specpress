/**
 * Shared CLI utilities used by all export scripts (HTML and DOCX).
 *
 * Contains functions that interact with the console and may call
 * process.exit() on failure. Pure library logic lives in lib/md2html/
 * and lib/md2docx/.
 */
const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Browser detection
// ---------------------------------------------------------------------------

/**
 * Checks for a Chromium-based browser and prints a warning if none is found.
 * Mermaid diagrams require Chrome/Edge for rendering.
 * @returns {boolean} true if a browser was found.
 */
function checkBrowser() {
  const { findBrowser } = require('../md2docx/handlers/mermaidHandler')
  if (!findBrowser()) {
    console.warn('Warning: No Chromium-based browser found. Mermaid diagrams will not be rendered.')
    console.warn('  Install Chrome/Chromium or set the CHROME_BIN environment variable.')
    return false
  }
  return true
}

/**
 * Checks for the msc-gen executable and prints a warning if not found.
 * MSC-Gen diagrams require msc-gen to be installed.
 * @returns {boolean} true if msc-gen was found.
 */
function checkMscgen() {
  const { findMscgen } = require('../common/mscgenRenderer')
  if (!findMscgen()) {
    console.warn('Warning: msc-gen not found. MSC-Gen diagrams will not be rendered.')
    console.warn('  Install msc-gen from: https://gitlab.com/msc-generator/msc-generator/#download-and-install')
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Cover page / front page loading
// ---------------------------------------------------------------------------

/**
 * Loads CR cover page data from a JSON file.
 * @param {string} crCoverPageDataFile - Path to the CR JSON file.
 * @param {object} [opts]
 * @param {boolean} [opts.strict=true] - If true, exit on validation failure. If false, log and return null.
 * @returns {object|null} Validated CR data, or null on failure.
 */
function loadCrCoverPage(crCoverPageDataFile, opts = {}) {
  const strict = opts.strict !== false
  if (!crCoverPageDataFile || !fs.existsSync(crCoverPageDataFile)) {
    if (strict && crCoverPageDataFile) {
      console.error(`Warning: CR cover page file not found: ${crCoverPageDataFile}`)
    }
    return null
  }
  const { loadCRCoverPageData } = require('../common/crCoverPageLoader')
  try {
    const result = loadCRCoverPageData(crCoverPageDataFile)
    if (result.valid) return result.data
    if (strict) {
      console.error('CR cover page validation failed:')
      result.errors.forEach(err => console.error(`  - ${err}`))
      process.exit(1)
    } else {
      console.error(`Warning: CR cover page not loaded: ${result.errors.join(', ')}`)
      return null
    }
  } catch (e) {
    if (strict) { console.error(`Failed to load CR cover page data: ${e.message}`); process.exit(1) }
    return null
  }
}

/**
 * Loads front page data from a JSON file.
 * @param {string} frontPageDataFile - Path to front page JSON file.
 * @param {object} [opts]
 * @param {boolean} [opts.strict=true] - If true, exit on error. If false, return null.
 * @returns {object|null} Front page JSON data object, or null on failure.
 */
function loadFrontPage(frontPageDataFile, opts = {}) {
  const strict = opts.strict !== false
  if (!frontPageDataFile || !fs.existsSync(frontPageDataFile)) return null
  try {
    return JSON.parse(fs.readFileSync(frontPageDataFile, 'utf8'))
  } catch (e) {
    if (strict) { console.error(`Failed to load front page data: ${e.message}`); process.exit(1) }
    return null
  }
}

/**
 * Loads CSS from a user-specified file or falls back to the specpress default.
 * @param {string|null} cssFile
 * @returns {string}
 */
function loadCss(cssFile) {
  if (cssFile && fs.existsSync(cssFile)) return fs.readFileSync(cssFile, 'utf8')
  const defaultPath = path.join(__dirname, '../css/3gpp.css')
  return fs.existsSync(defaultPath) ? fs.readFileSync(defaultPath, 'utf8') : ''
}

module.exports = { checkBrowser, checkMscgen, loadCrCoverPage, loadFrontPage, loadCss }
