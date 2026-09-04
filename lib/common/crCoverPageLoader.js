const fs = require('fs')
const path = require('path')
const Ajv = require('ajv')
const addFormats = require('ajv-formats')

// Load schema once and compile validator
const schemaPath = path.join(__dirname, '../templates/crCoverPageSchema.json')
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schema)

/**
 * Validates CR cover page data against crCoverPageSchema.json.
 * The schema is the single source of truth for field names, types, and constraints.
 *
 * @param {object} data - CR data object to validate
 * @param {string} crFilePath - Path to CR file (for error messages)
 * @param {object} [opts]
 * @param {string} [opts.tdocPattern] - Override regex pattern for TDoc Number validation.
 *   When provided, replaces the pattern defined in the schema for that field only.
 * @returns {object} - { valid: boolean, errors: string[] }
 */
function validateCRCoverPageData(data, crFilePath, opts = {}) {
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['CR file does not contain a valid JSON object'] }
  }

  const valid = validate(data)
  const errors = valid ? [] : validate.errors.map(err => {
    if (err.keyword === 'required') return `Missing required field: ${err.params.missingProperty}`
    const field = err.instancePath ? err.instancePath.replace(/^\//,'').replace(/\//g, '.') : '(root)'
    return `${field}: ${err.message}`
  })

  // CR and TDoc Number are optional in the schema (to allow rendering incomplete drafts)
  // but are required for a complete CR submission — warn explicitly when absent.
  if (!data['CR']) errors.push('Missing required field: CR')
  if (!data['TDoc Number']) errors.push('Missing required field: TDoc Number')

  // If a custom tdocPattern is provided, it fully replaces the schema pattern check.
  // The TDoc Number must match the custom pattern; matching the default schema pattern is not sufficient.
  if (opts.tdocPattern && data['TDoc Number']) {
    const tdocErrIdx = errors.findIndex(e => e.startsWith('TDoc Number:'))
    const matchesCustom = new RegExp(opts.tdocPattern).test(data['TDoc Number'])
    if (matchesCustom) {
      if (tdocErrIdx !== -1) errors.splice(tdocErrIdx, 1)
    } else {
      const customErr = `TDoc Number: must match pattern "${opts.tdocPattern}"`
      if (tdocErrIdx !== -1) errors[tdocErrIdx] = customErr
      else errors.push(customErr)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Loads and parses CR cover page data from a JSON file.
 *
 * @param {string} crFilePath - Absolute path to CR JSON file
 * @param {object} [opts]
 * @param {string} [opts.tdocPattern] - Override regex pattern for TDoc Number validation.
 * @returns {object} - { data: object|null, valid: boolean, errors: string[] }
 */
function loadCRCoverPageData(crFilePath, opts = {}) {
  if (!crFilePath || !fs.existsSync(crFilePath)) {
    return { data: null, valid: false, errors: ['CR file not found'] }
  }

  // Security: Validate that the file path doesn't contain path traversal
  const normalized = path.normalize(crFilePath)
  if (normalized !== crFilePath) {
    return { data: null, valid: false, errors: ['Invalid file path: path traversal detected'] }
  }

  // Security: Ensure file is a .json file
  if (!crFilePath.toLowerCase().endsWith('.json')) {
    return { data: null, valid: false, errors: ['Invalid file type: must be a .json file'] }
  }

  try {
    const content = fs.readFileSync(crFilePath, 'utf8')
    const data = JSON.parse(content)
    const validation = validateCRCoverPageData(data, crFilePath, opts)
    return {
      data,
      valid: validation.valid,
      errors: validation.errors
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { data: null, valid: false, errors: [`Invalid JSON syntax: ${e.message}`] }
    }
    return { data: null, valid: false, errors: [`Failed to read file: ${e.message}`] }
  }
}

/**
 * Formats a CR number as a 4-digit string with leading zeros.
 * Returns "-" if CR number is not set (null, undefined, or 0).
 *
 * @param {number|string} crNumber - CR number (0-9999)
 * @returns {string} - Formatted CR number (e.g., "0123") or "-"
 */
function formatCRNumber(crNumber) {
  if (crNumber === null || crNumber === undefined || crNumber === 0) return '-'

  const num = typeof crNumber === 'string' ? parseInt(crNumber, 10) : crNumber

  if (isNaN(num) || num < 0 || num > 9999) return '-'

  return num.toString().padStart(4, '0')
}

/**
 * Formats a revision number for display.
 * Returns "-" for 0 or undefined, otherwise the number as string.
 *
 * @param {number|string} revNumber - Revision number (0-99)
 * @returns {string} - Formatted revision ("-" or "1", "2", etc.)
 */
function formatRevNumber(revNumber) {
  if (revNumber === null || revNumber === undefined || revNumber === 0) {
    return '-'
  }

  return revNumber.toString()
}

/**
 * Extracts the release number from a version string.
 * E.g., "17.5.0" → "Rel-17"
 *
 * @param {string} version - Version string (e.g., "17.5.0")
 * @returns {string} - Release string (e.g., "Rel-17")
 */
function extractRelease(version) {
  if (!version || typeof version !== 'string') return ''

  const match = version.match(/^(\d+)\./)
  if (match) {
    return `Rel-${match[1]}`
  }

  return ''
}

/**
 * Formats an array of strings as a comma-separated list.
 *
 * @param {string[]} items - Array of strings
 * @returns {string} - Comma-separated string
 */
function formatList(items) {
  if (!Array.isArray(items)) return ''
  return items.filter(item => item && typeof item === 'string').join(', ')
}

/**
 * Formats an array of strings as newline-separated lines.
 * Used for "Other specs affected" sub-fields where each entry should be on its own line.
 *
 * @param {string[]} items - Array of strings
 * @returns {string[]} - Filtered non-empty strings (caller decides join character)
 */
function formatLines(items) {
  if (!Array.isArray(items)) return []
  return items.filter(item => item && typeof item === 'string')
}

/**
 * Gets a boolean value from CR data, defaulting to false.
 *
 * @param {any} value - Value to check
 * @returns {boolean} - Boolean value
 */
function getBoolean(value) {
  return value === true
}

module.exports = {
  loadCRCoverPageData,
  validateCRCoverPageData,
  formatCRNumber,
  formatRevNumber,
  extractRelease,
  formatList,
  formatLines,
  getBoolean
}
