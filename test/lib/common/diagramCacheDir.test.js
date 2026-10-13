const { test, describe } = require('node:test')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')

const { renderCached, renderCachedAsync } = require('../../../lib/common/diagramCache')

/**
 * Regression coverage for resolver-aware diagram caching.
 *
 * Bug: renderCached/renderCachedAsync always derived the cache directory from
 * `specRoot` via svgCacheDir() (i.e. always `<specRoot's parent>/cached`, the real
 * local filesystem path) — even when the diagram source being rendered actually came
 * from a FileResolver backed by a git commit (unpacked to a temp directory). This made
 * diagram renders of historical/baseline content (e.g. the old side of a change-tracking
 * diff) write their cached SVG/PNG into the real local `cached/` folder instead of the
 * resolver's own isolated directory, which git then reported as spurious untracked files.
 *
 * Fix: both functions now accept an explicit `opts.cacheDir` which, when provided, is
 * used verbatim instead of deriving one from `specRoot`.
 */
describe('renderCached / renderCachedAsync — cacheDir override', () => {

  function makeTempDirs() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'specpress-cachedir-test-'))
    const specRoot = path.join(root, 'spec')
    const localCacheDir = path.join(root, 'cached') // what svgCacheDir(specRoot) would derive
    const resolverCacheDir = path.join(root, 'resolver-tmp', 'cached') // explicit override target
    fs.mkdirSync(specRoot, { recursive: true })
    return { root, specRoot, localCacheDir, resolverCacheDir }
  }

  test('renderCached writes into opts.cacheDir, not the specRoot-derived local cached/ folder', () => {
    const { root, specRoot, localCacheDir, resolverCacheDir } = makeTempDirs()
    try {
      const [result] = renderCached({
        codes: ['graph TD; A-->B'],
        config: '{}',
        specRoot,
        cacheDir: resolverCacheDir,
        prefix: '',
        renderFn: (codes) => codes.map(() => ({ svg: '<svg>mock</svg>', png: Buffer.from('png') }))
      })
      assert.ok(result.svg.includes('mock'), 'should return the rendered SVG')
      assert.ok(fs.existsSync(resolverCacheDir), 'cacheDir override directory should have been created')
      const cachedFiles = fs.readdirSync(resolverCacheDir)
      assert.strictEqual(cachedFiles.filter(f => f.endsWith('.svg')).length, 1, 'SVG should be cached in the override directory')
      assert.ok(!fs.existsSync(localCacheDir), 'the real local cached/ folder (derived from specRoot) must NOT be created')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('renderCachedAsync writes into opts.cacheDir, not the specRoot-derived local cached/ folder', async () => {
    const { root, specRoot, localCacheDir, resolverCacheDir } = makeTempDirs()
    try {
      const [result] = await renderCachedAsync({
        codes: ['graph TD; X-->Y'],
        config: '{}',
        specRoot,
        cacheDir: resolverCacheDir,
        prefix: '',
        renderFn: async (codes) => codes.map(() => ({ svg: '<svg>mock-async</svg>', png: Buffer.from('png') }))
      })
      assert.ok(result.svg.includes('mock-async'), 'should return the rendered SVG')
      assert.ok(fs.existsSync(resolverCacheDir), 'cacheDir override directory should have been created')
      assert.ok(!fs.existsSync(localCacheDir), 'the real local cached/ folder (derived from specRoot) must NOT be created')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('renderCached falls back to svgCacheDir(specRoot) when cacheDir is not provided (back-compat)', () => {
    const { root, specRoot, localCacheDir } = makeTempDirs()
    try {
      renderCached({
        codes: ['graph TD; Legacy-->Behavior'],
        config: '{}',
        specRoot,
        prefix: '',
        renderFn: (codes) => codes.map(() => ({ svg: '<svg>legacy</svg>', png: Buffer.from('png') }))
      })
      assert.ok(fs.existsSync(localCacheDir), 'without a cacheDir override, the specRoot-derived local cached/ folder should still be used')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('a subsequent render with the same cacheDir serves from cache without calling renderFn again', () => {
    const { root, specRoot, resolverCacheDir } = makeTempDirs()
    try {
      const code = 'graph TD; Cache-->Hit'
      renderCached({
        codes: [code], config: '{}', specRoot, cacheDir: resolverCacheDir, prefix: '',
        renderFn: (codes) => codes.map(() => ({ svg: '<svg>first</svg>', png: Buffer.from('png') }))
      })
      let calledAgain = false
      const [result] = renderCached({
        codes: [code], config: '{}', specRoot, cacheDir: resolverCacheDir, prefix: '',
        renderFn: (codes) => { calledAgain = true; return codes.map(() => ({ svg: '<svg>second</svg>', png: Buffer.from('png') })) }
      })
      assert.ok(!calledAgain, 'renderFn should not be called again — should be served from the override cache dir')
      assert.ok(result.svg.includes('first'), 'should return the originally cached SVG')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

})
