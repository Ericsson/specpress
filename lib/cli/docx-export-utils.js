/**
 * CLI-specific utilities for DOCX export scripts (export-docx.js, export-docx-diff.js).
 *
 * Contains functions that interact with the console (warnings, errors) and
 * may call process.exit() on failure. Pure library logic lives in:
 * - lib/common/mermaidConfig.js       — mermaid config resolution
 * - lib/md2docx/convertToDocx.js      — core conversion pipeline
 * - lib/common/specProcessor.js       — file collection & concatenation
 */
const fs = require('fs')
const path = require('path')

// Re-export library functions that CLI scripts commonly need together
const { loadMermaidConfig } = require('../common/mermaidConfig')
const { convertToDocx, createTempDir } = require('../md2docx/convertToDocx')

// ---------------------------------------------------------------------------
// Browser detection (CLI-specific: prints warnings to console)
// ---------------------------------------------------------------------------

/**
 * Checks for a Chromium-based browser and prints a warning if none is found.
 * Mermaid diagrams require Chrome/Edge for rendering.
 *
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

// ---------------------------------------------------------------------------
// Cover page / front page loading (CLI-specific: console.error + process.exit)
// ---------------------------------------------------------------------------

/**
 * Loads CR cover page data from a JSON file.
 *
 * @param {string} crCoverPageDataFile - Path to the CR JSON file.
 * @param {object} [opts] - Options.
 * @param {boolean} [opts.strict=true] - If true, exit on validation failure. If false, log warnings and return null.
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
    if (strict) {
      console.error(`Failed to load CR cover page data: ${e.message}`)
      process.exit(1)
    }
    return null
  }
}

/**
 * Loads front page data from a JSON file.
 *
 * @param {string} frontPageDataFile - Path to front page JSON file.
 * @param {object} [opts] - Options.
 * @param {boolean} [opts.strict=true] - If true, exit on error. If false, return null.
 * @returns {object|null} Front page JSON data object, or null on failure.
 */
function loadFrontPage(frontPageDataFile, opts = {}) {
  const strict = opts.strict !== false
  if (!frontPageDataFile || !fs.existsSync(frontPageDataFile)) return null

  try {
    return JSON.parse(fs.readFileSync(frontPageDataFile, 'utf8'))
  } catch (e) {
    if (strict) {
      console.error(`Failed to load front page data: ${e.message}`)
      process.exit(1)
    }
    return null
  }
}

module.exports = {
  // Re-exported from library modules
  loadMermaidConfig,
  convertToDocx,
  createTempDir,
  // CLI-specific
  checkBrowser,
  loadCrCoverPage,
  loadFrontPage
}
