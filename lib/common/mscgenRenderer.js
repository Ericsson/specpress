/**
 * MSC-Gen batch renderer — CLI-based rendering.
 *
 * This module is VS Code-free and runs in plain Node.js (CLI, CI, tests).
 */
const { execFileSync } = require('child_process')
const { writeFileSync, readFileSync, unlinkSync, existsSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { createHash } = require('crypto')
const { findExecutable } = require('./diagramCache')

const MSCGEN_PATHS = [
  'C:\\Program Files (x86)\\Msc-generator\\msc-gen.exe',
  'C:\\Program Files\\Msc-generator\\msc-gen.exe',
  '/usr/local/bin/msc-gen',
  '/usr/bin/msc-gen',
]

let mscgenPathCached = null

/**
 * Finds the msc-gen executable.
 * @returns {string|null}
 */
function findMscgen() {
  if (mscgenPathCached !== null) return mscgenPathCached
  mscgenPathCached = findExecutable(['MSCGEN_BIN'], MSCGEN_PATHS)
  return mscgenPathCached
}

function renderMscgenSingle(code, type, mscgenBin) {
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 16)
  const tempInput = join(tmpdir(), `specpress_mscgen_${hash}.${type}`)
  const tempSvg = join(tmpdir(), `specpress_mscgen_${hash}.svg`)
  const tempPng = join(tmpdir(), `specpress_mscgen_${hash}.png`)

  writeFileSync(tempInput, code, 'utf8')

  let svg = null
  let png = null

  try {
    execFileSync(mscgenBin, [
      '-T', 'svg', '-S', type, '-Pno', '-q', '--nocopyright', '-o', tempSvg, tempInput
    ], { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] })
    if (existsSync(tempSvg)) svg = readFileSync(tempSvg, 'utf8')
  } catch (e) {}

  try {
    execFileSync(mscgenBin, [
      '-T', 'png', '-S', type, '-Pno', '-q', '--nocopyright', '-s=2', '-o', tempPng, tempInput
    ], { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] })
    if (existsSync(tempPng)) png = readFileSync(tempPng)
  } catch (e) {}

  try { unlinkSync(tempInput) } catch (e) {}
  try { unlinkSync(tempSvg) } catch (e) {}
  try { unlinkSync(tempPng) } catch (e) {}

  return { svg, png }
}

/**
 * Renders multiple MSC-Gen diagrams sequentially via the CLI.
 *
 * @param {{ code: string, type: string }[]} entries - Array of objects with
 *   the processed source code (preamble applied, @type stripped) and the
 *   diagram type ('signalling', 'block', or 'graph').
 * @returns {{svg: string|null, png: Buffer|null}[]}
 */
function renderMscgenBatch(entries) {
  if (!entries || entries.length === 0) return []
  const bin = findMscgen()
  if (!bin) return entries.map(() => ({ svg: null, png: null }))
  return entries.map(({ code, type }) => renderMscgenSingle(code, type, bin))
}

module.exports = { findMscgen, renderMscgenBatch }
