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

const VALID_TYPES = new Set(['signalling', 'block', 'graph'])

/**
 * Extracts an optional @type= directive from an mscgen code fence, or
 * auto-detects the type from the content.
 *
 * Auto-detection: if the trimmed code starts with "graph" followed by
 * optional whitespace and "{", the type is "graph" — this is unambiguous
 * Graphviz DOT syntax that cannot appear in signalling or block diagrams.
 *
 * Otherwise a line containing only "@type=<value>" (case-insensitive, any
 * surrounding whitespace) is removed from the code. Recognised values are
 * "signalling" (default), "block", and "graph". Unknown values are ignored
 * and the line is left in the code.
 *
 * @param {string} rawCode - Raw MSC-Gen source code from the fence (already trimmed).
 * @returns {{ code: string, type: string }}
 */
function extractMscgenType(rawCode) {
  if (/^graph\s*\{/.test(rawCode)) {
    return { code: rawCode, type: 'graph' }
  }
  const lines = rawCode.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^@type=([\w-]+)$/i)
    if (m) {
      const type = m[1].toLowerCase()
      if (VALID_TYPES.has(type)) {
        const remaining = lines.filter((_, j) => j !== i).join('\n').trim()
        return { code: remaining, type }
      }
    }
  }
  return { code: rawCode, type: 'signalling' }
}

/**
 * Prepares an mscgen fence's raw content for rendering and caching.
 * Combines type extraction, preamble application, and cache-config computation
 * into a single step used by both the HTML and DOCX pipelines.
 *
 * @param {string} rawCode - Raw trimmed content from the mscgen fence.
 * @param {string|null} configJson - MSC-Gen config JSON string.
 * @returns {{ code: string, type: string, cacheConfig: string|null }}
 */
function prepareMscgenCode(rawCode, configJson) {
  const { code: typeStripped, type } = extractMscgenType(rawCode)
  const preamble = parseMscgenPreamble(configJson)
  const code = applyMscgenPreamble(typeStripped, preamble)
  const cacheConfig = type !== 'signalling' ? (configJson || '') + '\0' + type : configJson
  return { code, type, cacheConfig }
}

module.exports = { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble, extractMscgenType, prepareMscgenCode, DEFAULT_MSCGEN_CONFIG_PATH }
