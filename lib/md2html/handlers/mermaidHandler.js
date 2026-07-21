/**
 * Mermaid fence handler for HTML rendering.
 *
 * Renders mermaid code fences as cached SVG images (relative paths) or
 * falls back to raw code blocks. Uses the sync renderCached pipeline since
 * markdown-it fence renderers are called synchronously.
 */
const { renderCached, cacheKey: diagramCacheKey, SVG_CACHE_DIR, getSvgDimensions } = require('../../common/diagramCache')
const { renderMermaidBatch } = require('../../common/mermaidRenderer')
const { loadMermaidConfig } = require('../../common/mermaidConfig')

/**
 * Renders a mermaid fence token to HTML.
 *
 * @param {Object} token - markdown-it fence token with info === 'mermaid'.
 * @param {string} attrs - Pre-rendered HTML attributes string.
 * @param {Object} env - markdown-it environment object.
 * @returns {string} HTML string.
 */
function renderMermaidFence(token, attrs, env) {
  const code = token.content.trim()
  const mermaidConfig = env._mermaidConfig || loadMermaidConfig(null)
  const specRoot = env._specRootPath || ''
  const [result] = renderCached({
    codes: [code], config: mermaidConfig, specRoot, prefix: '', cachePng: false,
    renderFn: (c) => renderMermaidBatch(c, mermaidConfig)
  })
  if (result && result.svg && specRoot) {
    const key = diagramCacheKey(code, mermaidConfig)
    const svgRelPath = `${SVG_CACHE_DIR}/${key}.svg`
    const { width, height } = getSvgDimensions(result.svg)
    return `<div class="mermaid-figure"${attrs}><img src="${svgRelPath}" width="${width}" height="${height}"></div>`
  }
  return `<pre class="mermaid"${attrs}>${token.content}</pre>`
}

module.exports = { renderMermaidFence }
