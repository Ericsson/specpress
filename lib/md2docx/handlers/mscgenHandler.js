const { execFileSync } = require('child_process')
const { writeFileSync, readFileSync, unlinkSync, existsSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { createHash } = require('crypto')
const { parseMscgenPreamble, applyMscgenPreamble } = require('../../common/mscgenConfig')
const {
  svgCacheDir, cacheKey, findExecutable, getSvgDimensions,
  collectDiagramHashes, cleanupCacheFiles, renderCached, renderCachedAsync
} = require('../../common/diagramCache')

const MSCGEN_FENCE_RE = /```mscgen\s*\n([\s\S]*?)```/g

const MSCGEN_PATHS = [
  'C:\\Program Files (x86)\\Msc-generator\\msc-gen.exe',
  'C:\\Program Files\\Msc-generator\\msc-gen.exe',
  '/usr/local/bin/msc-gen',
  '/usr/bin/msc-gen',
]

let mscgenPathCached = null

/**
 * Finds the msc-gen executable. Checks MSCGEN_BIN env var first,
 * then known installation paths.
 *
 * @returns {string|null} Path to msc-gen executable, or null if not found.
 */
function findMscgen() {
  if (mscgenPathCached !== null) return mscgenPathCached
  mscgenPathCached = findExecutable(['MSCGEN_BIN'], MSCGEN_PATHS)
  return mscgenPathCached
}

/**
 * Renders a single MSC-Gen diagram to SVG and PNG using the msc-gen CLI tool.
 *
 * @param {string} code - MSC-Gen source code (with preamble already applied).
 * @param {string} mscgenBin - Path to the msc-gen executable.
 * @returns {{svg: string|null, png: Buffer|null}} Rendered SVG string and PNG buffer.
 */
function renderMscgenSingle(code, mscgenBin) {
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 16)
  const tempInput = join(tmpdir(), `specpress_mscgen_${hash}.signalling`)
  const tempSvg = join(tmpdir(), `specpress_mscgen_${hash}.svg`)
  const tempPng = join(tmpdir(), `specpress_mscgen_${hash}.png`)

  writeFileSync(tempInput, code, 'utf8')

  let svg = null
  let png = null

  try {
    execFileSync(mscgenBin, [
      '-T', 'svg', '-S', 'signalling', '-Pno', '-q', '--nocopyright', '-o', tempSvg, tempInput
    ], { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] })
    if (existsSync(tempSvg)) {
      svg = readFileSync(tempSvg, 'utf8')
    }
  } catch (e) { /* SVG rendering failed */ }

  try {
    execFileSync(mscgenBin, [
      '-T', 'png', '-S', 'signalling', '-Pno', '-q', '--nocopyright', '-s=2', '-o', tempPng, tempInput
    ], { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] })
    if (existsSync(tempPng)) {
      png = readFileSync(tempPng)
    }
  } catch (e) { /* PNG rendering failed */ }

  try { unlinkSync(tempInput) } catch (e) {}
  try { unlinkSync(tempSvg) } catch (e) {}
  try { unlinkSync(tempPng) } catch (e) {}

  return { svg, png }
}

/**
 * Renders multiple MSC-Gen diagrams. Each is rendered sequentially via the CLI.
 *
 * @param {string[]} codes - Array of MSC-Gen source codes (with preamble applied).
 * @returns {{svg: string|null, png: Buffer|null}[]} Array of results.
 */
function renderMscgenBatch(codes) {
  if (!codes || codes.length === 0) return []
  const bin = findMscgen()
  if (!bin) return codes.map(() => ({ svg: null, png: null }))
  return codes.map(code => renderMscgenSingle(code, bin))
}

/**
 * Removes cached mscgen SVG/PNG files that are no longer referenced.
 *
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {string} configJson - MSC-Gen config JSON string.
 */
function cleanupMscgenCache(specRoot, configJson) {
  const preamble = parseMscgenPreamble(configJson)
  const liveHashes = collectDiagramHashes(
    specRoot, MSCGEN_FENCE_RE,
    (raw) => applyMscgenPreamble(raw, preamble),
    configJson
  )
  cleanupCacheFiles(specRoot, '', ['.svg', '.png'], liveHashes)
}

/**
 * Renders MSC-Gen diagrams with caching (synchronous).
 *
 * @param {string[]} codes - Array of MSC-Gen source codes (with preamble applied).
 * @param {string} configJson - MSC-Gen config JSON string.
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {function} [renderFn] - Optional custom render function (for testing).
 * @returns {{svg: string|null, png: Buffer|null}[]} Array of results.
 */
function renderMscgenCached(codes, configJson, specRoot, renderFn) {
  return renderCached({
    codes,
    config: configJson,
    specRoot,
    prefix: '',
    cachePng: true,
    renderFn: renderFn || renderMscgenBatch
  })
}

/**
 * Async version of renderMscgenCached. Supports async renderFn.
 *
 * @param {string[]} codes - Array of MSC-Gen source codes (with preamble applied).
 * @param {string} configJson - MSC-Gen config JSON string.
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {function} [renderFn] - Optional custom render function (for testing).
 * @returns {Promise<{svg: string|null, png: Buffer|null}[]>} Array of results.
 */
async function renderMscgenWithCache(codes, configJson, specRoot, renderFn) {
  return renderCachedAsync({
    codes,
    config: configJson,
    specRoot,
    prefix: '',
    cachePng: true,
    renderFn: renderFn || renderMscgenBatch
  })
}

module.exports = {
  findMscgen,
  renderMscgenBatch,
  renderMscgenCached,
  renderMscgenWithCache,
  cleanupMscgenCache,
  getSvgDimensions,
  mscgenCacheKey: cacheKey,
  svgCacheDir,
  MSCGEN_FENCE_RE
}
