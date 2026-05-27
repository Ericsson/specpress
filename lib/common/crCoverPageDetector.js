const fs = require('fs')
const path = require('path')

/**
 * Detects if a draft CR cover page JSON file exists in the history folder.
 * Looks for files matching pattern: CRxxxx.json (four x's, indicating draft)
 * 
 * @param {string} specRoot - Path to specification root folder
 * @returns {string|null} - Absolute path to draft CR JSON file, or null if not found
 */
function detectCRCoverPage(specRoot) {
  if (!specRoot) return null
  
  const historyDir = path.join(specRoot, 'history')
  
  // Check if history directory exists
  if (!fs.existsSync(historyDir)) return null
  
  try {
    const files = fs.readdirSync(historyDir)
    
    // Look for CRxxxx.json (draft CR with four x's)
    // Pattern: CR followed by exactly 4 x's (case insensitive), then .json
    const crFile = files.find(f => /^CRxxxx\.json$/i.test(f))
    
    if (crFile) {
      return path.join(historyDir, crFile)
    }
  } catch (e) {
    // Directory read error - return null
    return null
  }
  
  return null
}

/**
 * Collects all approved CR files from the history folder.
 * Looks for files matching pattern: CR[0-9]{4}.json (four digits)
 * 
 * @param {string} specRoot - Path to specification root folder
 * @returns {string[]} - Array of absolute paths to approved CR JSON files
 */
function collectApprovedCRs(specRoot) {
  if (!specRoot) return []
  
  const historyDir = path.join(specRoot, 'history')
  
  // Check if history directory exists
  if (!fs.existsSync(historyDir)) return []
  
  try {
    const files = fs.readdirSync(historyDir)
    
    // Look for CR####.json (approved CRs with four digits)
    // Pattern: CR followed by exactly 4 digits, then .json
    const crFiles = files.filter(f => /^CR[0-9]{4}\.json$/i.test(f))
    
    return crFiles.map(f => path.join(historyDir, f))
  } catch (e) {
    // Directory read error - return empty array
    return []
  }
}

/**
 * Checks if a CR cover page exists for the given spec root.
 * 
 * @param {string} specRoot - Path to specification root folder
 * @returns {boolean} - True if CR cover page exists
 */
function hasCRCoverPage(specRoot) {
  return detectCRCoverPage(specRoot) !== null
}

module.exports = {
  detectCRCoverPage,
  hasCRCoverPage,
  collectApprovedCRs
}
