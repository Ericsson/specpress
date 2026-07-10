const fs = require('fs')
const path = require('path')

/**
 * Default path to the built-in mermaid configuration file.
 */
const DEFAULT_MERMAID_CONFIG_PATH = path.join(__dirname, '../css/mermaid-config.json')

/**
 * Loads mermaid configuration from a user-specified file or falls back
 * to the built-in default (lib/css/mermaid-config.json).
 *
 * @param {string|null} mermaidConfigPath - User-supplied config path, or null.
 * @returns {string|null} Config JSON string, or null if unavailable.
 */
function loadMermaidConfig(mermaidConfigPath) {
  if (mermaidConfigPath && fs.existsSync(mermaidConfigPath)) {
    return fs.readFileSync(path.resolve(mermaidConfigPath), 'utf8')
  }
  if (fs.existsSync(DEFAULT_MERMAID_CONFIG_PATH)) {
    return fs.readFileSync(DEFAULT_MERMAID_CONFIG_PATH, 'utf8')
  }
  return null
}

module.exports = { loadMermaidConfig, DEFAULT_MERMAID_CONFIG_PATH }
