const fs = require('fs')
const path = require('path')
const {
  formatCRNumber,
  formatRevNumber,
  extractRelease,
  formatList,
  formatLines,
  getBoolean
} = require('../common/crCoverPageLoader')

/**
 * Renders CR cover page data to HTML using the template.
 * 
 * @param {object} crData - CR cover page data from JSON file
 * @returns {string} - HTML string for CR cover page
 */
function renderCRCoverPageHTML(crData) {
  try {
    // Try multiple possible template locations
    let templatePath = path.join(__dirname, '../templates/cr_cover_template.htm')
    
    if (!fs.existsSync(templatePath)) {
      // Try alternative path (when running from node_modules)
      templatePath = path.join(__dirname, '../../templates/cr_cover_template.htm')
    }
    
    if (!fs.existsSync(templatePath)) {
      console.error('CR cover page template not found. Tried:', templatePath)
      console.error('__dirname:', __dirname)
      return ''
    }
    
    let html = fs.readFileSync(templatePath, 'utf8')
    
    // Helper to get "Other specs affected" checkbox values
    const otherSpecs = crData['Other specs affected'] || {}
    const otherCoreLines = formatLines(otherSpecs['Other core specifications'])
    const testSpecsLines = formatLines(otherSpecs['Test specifications'])
    const oamSpecsLines = formatLines(otherSpecs['O&M Specifications'])
    const hasOtherCore = otherCoreLines.length > 0 ? 'X' : ''
    const hasTestSpecs = testSpecsLines.length > 0 ? 'X' : ''
    const hasOamSpecs = oamSpecsLines.length > 0 ? 'X' : ''
    
    // Determine Y/N for "Other specs affected" header
    const hasAnyOtherSpecs = hasOtherCore || hasTestSpecs || hasOamSpecs
    
    // Helper for affected checkboxes
    const affected = crData.Affected || {}
    
    // Replace all placeholders
    const replacements = {
      '{{TDOC_NUMBER}}': crData['TDoc Number'] || '',
      '{{SPEC_NUMBER}}': crData.Specification || '',
      '{{CR_NUMBER}}': formatCRNumber(crData.CR),
      '{{REV_NUMBER}}': formatRevNumber(crData.rev),
      '{{VERSION}}': crData['Current version'] || '',
      '{{TITLE}}': escapeHtml(crData.Title || ''),
      '{{SOURCE_WG}}': escapeHtml(formatList(crData['Source to WG'])),
      '{{SOURCE_TSG}}': escapeHtml(formatList(crData['Source to TSG'])),
      '{{WORK_ITEM}}': escapeHtml(formatList(crData['Work item code'])),
      '{{DATE}}': crData.Date || '',
      '{{CATEGORY}}': crData.Category || '',
      '{{RELEASE}}': crData.Release || extractRelease(crData['Current version']),
      '{{REASON}}': escapeHtml(crData['Reason for change'] || ''),
      '{{SUMMARY}}': buildSummaryHtml(crData),
      '{{CONSEQUENCES}}': escapeHtml(crData['Consequences if not approved'] || ''),
      '{{CLAUSES}}': escapeHtml(formatList(crData['Clauses affected'])),
      '{{OTHER_COMMENTS}}': escapeHtml(crData['Other comments'] || ''),
      '{{FORGE_ATTACHMENTS}}': escapeHtml(crData['Forge related attachments'] || ''),
      '{{AFFECTED_UICC}}': getBoolean(affected.UICC) ? 'X' : '',
      '{{AFFECTED_ME}}': getBoolean(affected.ME) ? 'X' : '',
      '{{AFFECTED_RAN}}': (getBoolean(affected.RAN) || getBoolean(affected['Radio Access Network'])) ? 'X' : '',
      '{{AFFECTED_CN}}': (getBoolean(affected.CN) || getBoolean(affected['Core Network'])) ? 'X' : '',
      '{{OTHER_SPECS_YES}}': hasAnyOtherSpecs ? 'X' : '',
      '{{OTHER_SPECS_NO}}': hasAnyOtherSpecs ? '' : 'X',
      '{{OTHER_CORE}}': otherCoreLines.length ? otherCoreLines.map(escapeHtml).join('<br>') : escapeHtml('TS/TR ... CR ...'),
      '{{TEST_SPECS_YES}}': hasTestSpecs ? 'X' : '',
      '{{TEST_SPECS_NO}}': hasTestSpecs ? '' : 'X',
      '{{TEST_SPECS}}': testSpecsLines.length ? testSpecsLines.map(escapeHtml).join('<br>') : escapeHtml('TS/TR ... CR ...'),
      '{{OAM_SPECS_YES}}': hasOamSpecs ? 'X' : '',
      '{{OAM_SPECS_NO}}': hasOamSpecs ? '' : 'X',
      '{{OAM_SPECS}}': oamSpecsLines.length ? oamSpecsLines.map(escapeHtml).join('<br>') : escapeHtml('TS/TR ... CR ...')
    }
    
    // Apply all replacements
    for (const [placeholder, value] of Object.entries(replacements)) {
      html = html.replace(new RegExp(escapeRegex(placeholder), 'g'), value)
    }
    
    return html
  } catch (e) {
    console.error('Error rendering CR cover page:', e)
    return ''
  }
}

/**
 * Builds the summary HTML with impact analysis appended (bold field names).
 */
function buildSummaryHtml(crData) {
  let html = escapeHtml(crData['Summary of change'] || '')
  const impact = crData['Impact analysis']
  if (!impact || typeof impact !== 'object') return html

  const entries = Object.entries(impact).filter(([, v]) => v)
  if (entries.length === 0) return html

  html += '<br><br><b>Impact analysis:</b>'
  for (const [key, value] of entries) {
    html += `<br><b>${escapeHtml(key)}:</b> ${escapeHtml(value)}`
  }
  return html
}

/**
 * Escapes HTML special characters.
 * 
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  if (!text) return ''
  // Convert to string if it's not already
  const str = typeof text === 'string' ? text : String(text)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Escapes special regex characters in a string.
 * 
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = {
  renderCRCoverPageHTML
}
