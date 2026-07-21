/**
 * MSC-Gen handler — re-exports from common/mscgenRenderer.
 */
const { findMscgen, renderMscgenBatch } = require('../../common/mscgenRenderer')
const { renderMscgenCached } = require('../../common/diagramRenderers')
const { getSvgDimensions, svgCacheDir, cacheKey } = require('../../common/diagramCache')

module.exports = {
  findMscgen,
  renderMscgenBatch,
  renderMscgenCached,
  getSvgDimensions,
  svgCacheDir,
  mscgenCacheKey: cacheKey,
}
