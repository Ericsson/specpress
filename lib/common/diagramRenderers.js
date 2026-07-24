/**
 * Shared cached-render wrappers for diagram types (mermaid, MSC-Gen).
 *
 * Both the HTML renderer (md2html/) and the DOCX converter (md2docx/) import
 * from this single shared location. The batch renderers live in common/ too:
 * common/mermaidRenderer.js and common/mscgenRenderer.js.
 */
const { renderCachedAsync, collectDiagramHashes, cleanupCacheFiles } = require('./diagramCache')

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
    renderFn: renderFn || ((c) => require('./mermaidRenderer').renderMermaidBatch(c, config)),
  })
}

// ---------------------------------------------------------------------------
// MSC-Gen
// ---------------------------------------------------------------------------

/**
 * Renders MSC-Gen diagrams with disk caching.
 *
 * @param {string[]} codes - MSC-Gen source strings (preamble applied, @type stripped).
 * @param {string} configJson - MSC-Gen cache-config string (may include type suffix).
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {function} renderFn - Render function `(entries) => {svg,png}[]` where each
 *   entry is `{ code, type }`. Always required — callers must supply this because
 *   the type information is only available at the call site.
 * @returns {Promise<{svg: string|null, png: Buffer|null}[]>}
 */
async function renderMscgenCached(codes, configJson, specRoot, renderFn) {
  return renderCachedAsync({
    codes,
    config: configJson,
    specRoot,
    prefix: '',
    renderFn,
  })
}

module.exports = {
  renderMermaidCached,
  renderMscgenCached,
  renderCachedAsync,
  MERMAID_FENCE_RE,
  MSCGEN_FENCE_RE,
}
