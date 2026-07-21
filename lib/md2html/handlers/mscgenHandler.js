/**
 * MSC-Gen fence handler for HTML rendering.
 *
 * Renders mscgen code fences as cached SVG images (relative paths) or
 * falls back to raw code blocks. Uses the sync renderCached pipeline since
 * markdown-it fence renderers are called synchronously.
 */
const { renderCached, cacheKey: diagramCacheKey, SVG_CACHE_DIR, getSvgDimensions } = require('../../common/diagramCache')
const { renderMscgenBatch } = require('../../common/mscgenRenderer')
const { parseMscgenPreamble, applyMscgenPreamble, loadMscgenConfig } = require('../../common/mscgenConfig')

/**
 * Renders an mscgen fence token to HTML.
 *
 * @param {Object} token - markdown-it fence token with info === 'mscgen'.
 * @param {string} attrs - Pre-rendered HTML attributes string.
 * @param {Object} env - markdown-it environment object.
 * @returns {string} HTML string.
 */
function renderMscgenFence(token, attrs, env) {
  const rawCode = token.content.trim()
  const configJson = env._mscgenConfig || loadMscgenConfig(null)
  const preamble = parseMscgenPreamble(configJson)
  const code = applyMscgenPreamble(rawCode, preamble)
  const specRoot = env._specRootPath || ''
  const [result] = renderCached({
    codes: [code], config: configJson, specRoot, prefix: '', cachePng: false,
    renderFn: (c) => renderMscgenBatch(c)
  })
  if (result && result.svg && specRoot) {
    const key = diagramCacheKey(code, configJson)
    const svgRelPath = `${SVG_CACHE_DIR}/${key}.svg`
    const { width, height } = getSvgDimensions(result.svg)
    return `<div class="mscgen-figure"${attrs}><img src="${svgRelPath}" width="${width}" height="${height}"></div>`
  }
  return `<pre class="mscgen"${attrs}><code>${token.content}</code></pre>`
}

module.exports = { renderMscgenFence }
