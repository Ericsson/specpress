const fs = require('fs')
const path = require('path')

/**
 * Default path to the built-in MSC-Gen configuration file.
 */
const DEFAULT_MSCGEN_CONFIG_PATH = path.join(__dirname, '../css/mscgen-config.json')

/**
 * Loads MSC-Gen configuration from a user-specified file or falls back
 * to the built-in default (lib/css/mscgen-config.json).
 *
 * The config file contains a "preamble" array: style definition lines
 * (hscale, defstyle) that are prepended to each mscgen diagram before
 * rendering — unless the diagram already contains those definitions.
 *
 * @param {string|null} mscgenConfigPath - User-supplied config path, or null.
 * @returns {string|null} Config JSON string, or null if unavailable.
 */
function loadMscgenConfig(mscgenConfigPath) {
  if (mscgenConfigPath && fs.existsSync(mscgenConfigPath)) {
    return fs.readFileSync(path.resolve(mscgenConfigPath), 'utf8')
  }
  if (fs.existsSync(DEFAULT_MSCGEN_CONFIG_PATH)) {
    return fs.readFileSync(DEFAULT_MSCGEN_CONFIG_PATH, 'utf8')
  }
  return null
}

/**
 * Parses the MSC-Gen config JSON and returns the preamble lines.
 *
 * @param {string|null} configJson - JSON string from loadMscgenConfig.
 * @returns {string[]} Array of preamble lines (e.g. hscale, defstyle).
 */
function parseMscgenPreamble(configJson) {
  if (!configJson) return []
  try {
    const config = JSON.parse(configJson)
    if (Array.isArray(config.preamble)) return config.preamble
    return []
  } catch (e) {
    return []
  }
}

/**
 * Prepends preamble lines to MSC-Gen source code if the source does not
 * already contain its own style definitions (hscale or defstyle).
 *
 * @param {string} code - Raw MSC-Gen source code from the code fence.
 * @param {string[]} preamble - Preamble lines from config.
 * @returns {string} MSC-Gen source with preamble prepended (if needed).
 */
function applyMscgenPreamble(code, preamble) {
  if (!preamble || preamble.length === 0) return code
  // If the code already starts with style definitions, don't prepend
  const trimmed = code.trimStart()
  if (/^(hscale|defstyle)\b/.test(trimmed)) return code
  return preamble.join('\n') + '\n' + code
}

module.exports = { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble, DEFAULT_MSCGEN_CONFIG_PATH }
