/**
 * Shared caching infrastructure for diagram handlers (mermaid, MSC-Gen).
 *
 * Provides the common patterns: cache directory resolution, cache key
 * computation, executable discovery, SVG dimension extraction, and the
 * generic cached-render pipeline.
 */
const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')

const SVG_CACHE_DIR = 'cached'

// ---------------------------------------------------------------------------
// Cache directory
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the diagram cache directory.
 * The cache is placed as a sibling of the spec root folder.
 *
 * e.g. specRoot = "/repo/spec" → "/repo/cached"
 *
 * @param {string} specRoot - Absolute path to the specification root.
 * @returns {string} Absolute path to the cache directory.
 */
function svgCacheDir(specRoot) {
  return path.join(path.dirname(specRoot), SVG_CACHE_DIR)
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

/**
 * Computes a SHA-256 cache key for a diagram source + config combination.
 *
 * @param {string} code - Diagram source code.
 * @param {string} config - Configuration string (included in hash).
 * @returns {string} 64-char hex hash string.
 */
function cacheKey(code, config) {
  return createHash('sha256').update(code + '\0' + (config || '')).digest('hex')
}

// ---------------------------------------------------------------------------
// Executable discovery
// ---------------------------------------------------------------------------

/**
 * Finds an executable by checking environment variables first, then a list
 * of known installation paths.
 *
 * @param {string[]} envVars - Environment variable names to check (e.g. ['CHROME_BIN']).
 * @param {string[]} paths - Known installation paths to try.
 * @returns {string|null} Absolute path to the executable, or null if not found.
 */
function findExecutable(envVars, paths) {
  for (const envVar of envVars) {
    const p = process.env[envVar]
    if (p && fs.existsSync(p)) return p
  }
  return paths.find(p => fs.existsSync(p)) || null
}

// ---------------------------------------------------------------------------
// SVG dimensions
// ---------------------------------------------------------------------------

/**
 * Extracts width and height from an SVG string.
 * Tries viewBox first, then width/height attributes.
 * Caps width at 604px (DOCX page width) and scales height proportionally.
 *
 * @param {string} svg - SVG string.
 * @returns {{width: number, height: number}} Dimensions in pixels.
 */
function getSvgDimensions(svg) {
  let width = 604, height = 400

  const vb = svg.match(/viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/)
  if (vb) {
    width = parseFloat(vb[1])
    height = parseFloat(vb[2])
  } else {
    const wm = svg.match(/\bwidth="([\d.]+)/)
    const hm = svg.match(/\bheight="([\d.]+)/)
    if (wm) width = parseFloat(wm[1])
    if (hm) height = parseFloat(hm[1])
  }

  const maxWidth = 604
  if (width > maxWidth) {
    height = height * (maxWidth / width)
    width = maxWidth
  }
  return { width: Math.round(width), height: Math.round(height) }
}

// ---------------------------------------------------------------------------
// Hash collection (for cache cleanup)
// ---------------------------------------------------------------------------

/**
 * Walks a directory tree collecting diagram hashes from markdown files.
 *
 * @param {string} specRoot - Directory to walk.
 * @param {RegExp} fenceRegex - Global regex to extract fence content (must have one capture group).
 * @param {function} codeTransformFn - Transform raw fence content. May return a string (code only)
 *   or an object { code, config } when the per-entry config differs from the base config.
 * @param {string} config - Default config string for cache key computation.
 * @returns {Set<string>} Set of hex hash strings.
 */
function collectDiagramHashes(specRoot, fenceRegex, codeTransformFn, config) {
  const hashes = new Set()
  if (!specRoot || !fs.existsSync(specRoot)) return hashes
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item)
      if (fs.statSync(full).isDirectory()) {
        if (item === 'node_modules' || item === '.git' || item === SVG_CACHE_DIR) continue
        walk(full)
      } else if (/\.md$/i.test(item)) {
        const content = fs.readFileSync(full, 'utf8')
        let m
        fenceRegex.lastIndex = 0
        while ((m = fenceRegex.exec(content)) !== null) {
          const result = codeTransformFn(m[1].replace(/\r\n/g, '\n').trim())
          if (result && typeof result === 'object') {
            hashes.add(cacheKey(result.code, result.config))
          } else {
            hashes.add(cacheKey(result, config))
          }
        }
      }
    }
  }
  walk(specRoot)
  return hashes
}

// ---------------------------------------------------------------------------
// Cache cleanup
// ---------------------------------------------------------------------------

/**
 * Removes cached diagram files whose hashes are NOT in the provided live set.
 * Only deletes a file if its hash is a valid 64-char hex string (i.e., it looks
 * like a diagram cache file) and is not in the live set. Files with unrecognized
 * names are left untouched.
 *
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {string} prefix - File prefix filter (e.g. '' for all diagram types).
 * @param {string[]} extensions - File extensions to consider (e.g. ['.svg', '.png']).
 * @param {Set<string>} liveHashes - Combined set of ALL live hashes (all diagram types).
 */
function cleanupCacheFiles(specRoot, prefix, extensions, liveHashes) {
  const cacheDir = svgCacheDir(specRoot)
  if (!fs.existsSync(cacheDir)) return
  for (const file of fs.readdirSync(cacheDir)) {
    if (!extensions.some(ext => file.endsWith(ext))) continue
    if (prefix && !file.startsWith(prefix)) continue
    const hash = file.slice(prefix.length).replace(/\.[^.]+$/, '')
    // Only delete files that look like diagram cache files (64-char hex hash)
    if (!/^[a-f0-9]{64}$/.test(hash)) continue
    if (!liveHashes.has(hash)) {
      try { fs.unlinkSync(path.join(cacheDir, file)) } catch (e) {}
    }
  }
}

// ---------------------------------------------------------------------------
// Cached render pipeline
// ---------------------------------------------------------------------------

/**
 * Synchronous cached rendering pipeline. renderFn must be synchronous.
 * Used by the HTML fence handlers which are called synchronously by markdown-it.
 *
 * Always caches and returns both SVG and PNG. A cache entry is only considered
 * valid when both files exist; if either is missing the diagram is re-rendered.
 *
 * @param {object} opts
 * @param {string[]} opts.codes
 * @param {string} opts.config
 * @param {string} opts.specRoot
 * @param {string} opts.prefix
 * @param {function} opts.renderFn - Sync function `(codes) => {svg, png}[]`.
 * @returns {{svg: string|null, png: Buffer|null}[]}
 */
function renderCached(opts) {
  const { codes, config, specRoot, prefix, renderFn } = opts
  if (!codes || codes.length === 0) return []
  if (!specRoot) return renderFn(codes)

  const cacheDir = svgCacheDir(specRoot)
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

  const results = new Array(codes.length)
  const uncached = []

  for (let i = 0; i < codes.length; i++) {
    const key = cacheKey(codes[i], config)
    const svgPath = path.join(cacheDir, `${prefix}${key}.svg`)
    const pngPath = path.join(cacheDir, `${prefix}${key}.png`)
    if (fs.existsSync(svgPath) && fs.existsSync(pngPath)) {
      results[i] = { svg: fs.readFileSync(svgPath, 'utf8'), png: fs.readFileSync(pngPath) }
    } else {
      uncached.push({ idx: i, code: codes[i], key })
    }
  }

  if (uncached.length > 0) {
    const rendered = renderFn(uncached.map(u => u.code))
    for (let j = 0; j < uncached.length; j++) {
      const { idx, key } = uncached[j]
      const { svg, png } = rendered[j] || { svg: null, png: null }
      results[idx] = { svg, png }
      if (svg) fs.writeFileSync(path.join(cacheDir, `${prefix}${key}.svg`), svg)
      if (png) fs.writeFileSync(path.join(cacheDir, `${prefix}${key}.png`), png)
    }
  }

  return results
}

/**
 * Async cached rendering pipeline. renderFn may be sync or async.
 *
 * Always caches and returns both SVG and PNG. A cache entry is only considered
 * valid when both files exist; if either is missing the diagram is re-rendered.
 *
 * Supports per-entry configs via opts.configs (string[]). When provided, each
 * entry uses configs[i] for its cache key instead of the shared opts.config.
 * This is required when batching diagrams of mixed types (e.g. mscgen signalling
 * vs block vs graph) where each entry has its own cacheConfig.
 *
 * @param {object} opts
 * @param {string[]} opts.codes - Array of diagram source codes.
 * @param {string} [opts.config] - Shared config string (for cache key). Used when opts.configs is absent.
 * @param {string[]} [opts.configs] - Per-entry config strings. Takes precedence over opts.config.
 * @param {string} opts.specRoot - Absolute path to the spec root.
 * @param {string} opts.prefix - Cache file prefix (e.g. '').
 * @param {function} opts.renderFn - Sync or async function `(codes) => {svg, png}[]`.
 * @returns {Promise<{svg: string|null, png: Buffer|null}[]>}
 */
async function renderCachedAsync(opts) {
  const { codes, config, configs, specRoot, prefix, renderFn } = opts
  if (!codes || codes.length === 0) return []
  if (!specRoot) {
    const result = renderFn(codes)
    return result instanceof Promise ? await result : result
  }

  const cacheDir = svgCacheDir(specRoot)
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

  const results = new Array(codes.length)
  const uncached = []

  for (let i = 0; i < codes.length; i++) {
    const entryConfig = configs ? configs[i] : config
    const key = cacheKey(codes[i], entryConfig)
    const svgPath = path.join(cacheDir, `${prefix}${key}.svg`)
    const pngPath = path.join(cacheDir, `${prefix}${key}.png`)
    if (fs.existsSync(svgPath) && fs.existsSync(pngPath)) {
      results[i] = { svg: fs.readFileSync(svgPath, 'utf8'), png: fs.readFileSync(pngPath) }
    } else {
      uncached.push({ idx: i, code: codes[i], key })
    }
  }

  if (uncached.length > 0) {
    const rendered = renderFn(uncached.map(u => u.code), uncached.map(u => u.idx))
    const renderedResults = rendered instanceof Promise ? await rendered : rendered
    for (let j = 0; j < uncached.length; j++) {
      const { idx, key } = uncached[j]
      const { svg, png } = renderedResults[j] || { svg: null, png: null }
      results[idx] = { svg, png }
      if (svg) fs.writeFileSync(path.join(cacheDir, `${prefix}${key}.svg`), svg)
      if (png) fs.writeFileSync(path.join(cacheDir, `${prefix}${key}.png`), png)
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Unified diagram cache cleanup
// ---------------------------------------------------------------------------

/**
 * Removes orphan diagram cache files that are no longer referenced by any
 * markdown file in the spec root.
 *
 * Call this after a local export to keep the cache directory clean. Do NOT
 * call this when exporting from a git commit — the commit's diagrams may
 * differ from the local working copy.
 *
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {object} [opts] - Options.
 * @param {string|null} [opts.mermaidConfig] - Mermaid config string (null = load default).
 * @param {string|null} [opts.mscgenConfig] - MSC-Gen config JSON string (null = load default).
 */
function cleanupDiagramCache(specRoot, opts = {}) {
  if (!specRoot) return
  const { loadMermaidConfig } = require('./mermaidConfig')
  const { loadMscgenConfig } = require('./mscgenConfig')
  const MERMAID_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/g
  const MSCGEN_FENCE_RE = /```mscgen\s*\n([\s\S]*?)```/g

  const mermaidConfig = opts.mermaidConfig || loadMermaidConfig(null)
  const mscgenConfigJson = opts.mscgenConfig || loadMscgenConfig(null)

  const allLiveHashes = new Set()
  for (const h of collectDiagramHashes(specRoot, MERMAID_FENCE_RE, (raw) => raw, mermaidConfig)) {
    allLiveHashes.add(h)
  }
  for (const h of collectDiagramHashes(specRoot, MSCGEN_FENCE_RE, (raw) => {
    const { prepareMscgenCode } = require('./mscgenConfig')
    const { code, cacheConfig } = prepareMscgenCode(raw, mscgenConfigJson)
    return { code, config: cacheConfig }
  }, mscgenConfigJson)) {
    allLiveHashes.add(h)
  }
  cleanupCacheFiles(specRoot, '', ['.svg', '.png'], allLiveHashes)
}

module.exports = {
  SVG_CACHE_DIR,
  svgCacheDir,
  cacheKey,
  findExecutable,
  getSvgDimensions,
  collectDiagramHashes,
  cleanupCacheFiles,
  cleanupDiagramCache,
  renderCached,
  renderCachedAsync,
  scopeSvgIds
}

/**
 * Prefixes all IDs in an SVG with a unique scope to prevent collisions
 * when multiple SVGs are embedded in the same HTML page.
 *
 * Handles: id="...", xlink:href="#...", href="#...", url(#...), clip-path="url(#...)"
 *
 * @param {string} svg - SVG string.
 * @param {string} prefix - Unique prefix for this SVG instance.
 * @returns {string} SVG with scoped IDs.
 */
function scopeSvgIds(svg, prefix) {
  if (!svg || !prefix) return svg
  // Collect all id values
  const ids = []
  svg.replace(/\bid="([^"]+)"/g, (_, id) => { ids.push(id) })
  if (ids.length === 0) return svg

  // Deduplicate and sort longest-first to avoid substring replacement issues
  const uniqueIds = [...new Set(ids)].sort((a, b) => b.length - a.length)

  let result = svg
  for (const id of uniqueIds) {
    const scopedId = `${prefix}${id}`
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Replace id definition
    result = result.replace(new RegExp(`\\bid="${escaped}"`, 'g'), `id="${scopedId}"`)
    // Replace xlink:href references
    result = result.replace(new RegExp(`xlink:href="#${escaped}"`, 'g'), `xlink:href="#${scopedId}"`)
    // Replace href references
    result = result.replace(new RegExp(`\\bhref="#${escaped}"`, 'g'), `href="#${scopedId}"`)
    // Replace url(#...) references (e.g. in clip-path, fill)
    result = result.replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${scopedId})`)
    // Replace CSS #id selectors (e.g. #diagram-0 .class {...})
    result = result.replace(new RegExp(`#${escaped}([\\s{,.])`, 'g'), `#${scopedId}$1`)
  }
  return result
}
