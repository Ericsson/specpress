/**
 * Mermaid handler — re-exports from common/mermaidRenderer.
 *
 * renderMermaidViaWebview has moved to SpecPressExt (src/vscode/mermaidWebviewRenderer.js)
 * since it depends on the VS Code API.
 */
const {
  findBrowser,
  buildMermaidPageScript,
  renderMermaidBatch,
  renderMermaidToSvg,
  ensureMermaidBundle,
  DEFAULT_MERMAID_CONFIG_PATH,
} = require('../../common/mermaidRenderer')
const { renderMermaidCached } = require('../../common/diagramRenderers')
const { getSvgDimensions } = require('../../common/diagramCache')

module.exports = {
  findBrowser,
  buildMermaidPageScript,
  renderMermaidBatch,
  renderMermaidToSvg,
  renderMermaidCached,
  ensureMermaidBundle,
  getSvgDimensions,
  DEFAULT_MERMAID_CONFIG_PATH,
}
