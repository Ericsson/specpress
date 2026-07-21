/**
 * Shared cached-render wrappers for diagram types (mermaid, MSC-Gen).
 *
 * Both the HTML renderer (md2html/) and the DOCX converter (md2docx/) import
 * from this single shared location. The batch renderers live in common/ too:
 * common/mermaidRenderer.js and common/mscgenRenderer.js.
 */
const { renderCachedAsync, collectDiagramHashes, cleanupCacheFiles } = require('./diagramCache')
const { parseMscgenPreamble, applyMscgenPreamble, loadMscgenConfig } = require('./mscgenConfig')

const MERMAID_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/g
const MSCGEN_FENCE_RE = /```mscgen\s*\n([\s\S]*?)```/g

// ---------------------------------------------------------------------------
// Mermaid
// ---------------------------------------------------------------------------

/**
 * Renders mermaid diagrams with disk caching.
 *
 * @param {string[]} codes - Mermaid source strings.
 * @param {string} config - Mermaid config JSON string.
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {function|null} [renderFn] - Async or sync render function `(codes) => {svg,png}[]`.
 *   When null, falls back to renderMermaidBatch from common/mermaidRenderer.
 * @returns {Promise<{svg: string|null, png: Buffer|null}[]>}
 */
async function renderMermaidCached(codes, config, specRoot, renderFn) {
  return renderCachedAsync({
    codes,
    config,
    specRoot,
    prefix: '',
    cachePng: true,
    renderFn: renderFn || ((c) => require('./mermaidRenderer').renderMermaidBatch(c, config)),
  })
}

// ---------------------------------------------------------------------------
// MSC-Gen
// ---------------------------------------------------------------------------

/**
 * Renders MSC-Gen diagrams with disk caching.
 *
 * @param {string[]} codes - MSC-Gen source strings (with preamble already applied).
 * @param {string} configJson - MSC-Gen config JSON string.
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {function|null} [renderFn] - Async or sync render function `(codes) => {svg,png}[]`.
 *   When null, falls back to renderMscgenBatch from common/mscgenRenderer.
 * @returns {Promise<{svg: string|null, png: Buffer|null}[]>}
 */
async function renderMscgenCached(codes, configJson, specRoot, renderFn) {
  return renderCachedAsync({
    codes,
    config: configJson,
    specRoot,
    prefix: '',
    cachePng: true,
    renderFn: renderFn || ((c) => require('./mscgenRenderer').renderMscgenBatch(c)),
  })
}

module.exports = {
  renderMermaidCached,
  renderMscgenCached,
  MERMAID_FENCE_RE,
  MSCGEN_FENCE_RE,
}
