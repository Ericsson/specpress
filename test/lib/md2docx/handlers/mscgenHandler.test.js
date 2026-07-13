const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')

const { parseMscgenPreamble, applyMscgenPreamble, loadMscgenConfig } = require('../../../../lib/common/mscgenConfig')
const {
  findMscgen,
  renderMscgenBatch,
  renderMscgenWithCache,
  getSvgDimensions,
  mscgenCacheKey,
  svgCacheDir
} = require('../../../../lib/md2docx/handlers/mscgenHandler')

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

async function run() {
  console.log('parseMscgenPreamble')

  await test('returns preamble array from valid JSON', () => {
    const config = JSON.stringify({ preamble: ['hscale="auto";', 'defstyle ac [text.italic=yes];'] })
    const result = parseMscgenPreamble(config)
    assert.deepStrictEqual(result, ['hscale="auto";', 'defstyle ac [text.italic=yes];'])
  })

  await test('returns empty array for null', () => {
    assert.deepStrictEqual(parseMscgenPreamble(null), [])
  })

  await test('returns empty array for empty string', () => {
    assert.deepStrictEqual(parseMscgenPreamble(''), [])
  })

  await test('returns empty array for invalid JSON', () => {
    assert.deepStrictEqual(parseMscgenPreamble('not json'), [])
  })

  await test('returns empty array when preamble is not an array', () => {
    assert.deepStrictEqual(parseMscgenPreamble('{"preamble": "string"}'), [])
  })

  await test('returns empty array when preamble key is missing', () => {
    assert.deepStrictEqual(parseMscgenPreamble('{"other": []}'), [])
  })

  console.log('\napplyMscgenPreamble')

  const preamble = ['hscale="auto";', 'defstyle ac [text.italic=yes];']

  await test('prepends preamble to code without style definitions', () => {
    const code = 'u: UE;\nn: Network;\nu->n: msg [ac];'
    const result = applyMscgenPreamble(code, preamble)
    assert.ok(result.startsWith('hscale="auto";\ndefstyle ac'))
    assert.ok(result.endsWith(code))
  })

  await test('does not prepend when code starts with hscale', () => {
    const code = 'hscale="auto";\nu: UE;\nn: Network;'
    const result = applyMscgenPreamble(code, preamble)
    assert.strictEqual(result, code)
  })

  await test('does not prepend when code starts with defstyle', () => {
    const code = 'defstyle entity [text.bold=yes];\nu: UE;'
    const result = applyMscgenPreamble(code, preamble)
    assert.strictEqual(result, code)
  })

  await test('returns code unchanged for empty preamble', () => {
    const code = 'u: UE;\nn: Network;'
    assert.strictEqual(applyMscgenPreamble(code, []), code)
  })

  await test('returns code unchanged for null preamble', () => {
    const code = 'u: UE;\nn: Network;'
    assert.strictEqual(applyMscgenPreamble(code, null), code)
  })

  console.log('\nloadMscgenConfig')

  await test('loads the built-in default config', () => {
    const config = loadMscgenConfig(null)
    assert.ok(config !== null)
    const parsed = JSON.parse(config)
    assert.ok(Array.isArray(parsed.preamble))
    assert.ok(parsed.preamble.length > 0)
  })

  await test('loads a custom config file', () => {
    const tempFile = path.join(os.tmpdir(), `mscgen-test-config-${Date.now()}.json`)
    fs.writeFileSync(tempFile, JSON.stringify({ preamble: ['custom;'] }))
    try {
      const config = loadMscgenConfig(tempFile)
      const parsed = JSON.parse(config)
      assert.deepStrictEqual(parsed.preamble, ['custom;'])
    } finally {
      fs.unlinkSync(tempFile)
    }
  })

  await test('falls back to default when custom file does not exist', () => {
    const config = loadMscgenConfig('/nonexistent/path.json')
    assert.ok(config !== null)
    const parsed = JSON.parse(config)
    assert.ok(Array.isArray(parsed.preamble))
  })

  console.log('\nmscgenCacheKey')

  await test('returns a 64-char hex string', () => {
    const key = mscgenCacheKey('u: UE;', '{}')
    assert.ok(/^[a-f0-9]{64}$/.test(key))
  })

  await test('same input produces same key', () => {
    const key1 = mscgenCacheKey('u: UE;', '{}')
    const key2 = mscgenCacheKey('u: UE;', '{}')
    assert.strictEqual(key1, key2)
  })

  await test('different code produces different key', () => {
    const key1 = mscgenCacheKey('u: UE;', '{}')
    const key2 = mscgenCacheKey('u: Network;', '{}')
    assert.notStrictEqual(key1, key2)
  })

  await test('different config produces different key', () => {
    const key1 = mscgenCacheKey('u: UE;', '{"a":1}')
    const key2 = mscgenCacheKey('u: UE;', '{"a":2}')
    assert.notStrictEqual(key1, key2)
  })

  console.log('\ngetSvgDimensions')

  await test('extracts dimensions from viewBox', () => {
    const svg = '<svg viewBox="0 0 400 200"></svg>'
    const { width, height } = getSvgDimensions(svg)
    assert.strictEqual(width, 400)
    assert.strictEqual(height, 200)
  })

  await test('caps width at 604 and scales height proportionally', () => {
    const svg = '<svg viewBox="0 0 1208 600"></svg>'
    const { width, height } = getSvgDimensions(svg)
    assert.strictEqual(width, 604)
    assert.strictEqual(height, 300)
  })

  await test('extracts from width/height attributes when no viewBox', () => {
    const svg = '<svg width="300" height="150"></svg>'
    const { width, height } = getSvgDimensions(svg)
    assert.strictEqual(width, 300)
    assert.strictEqual(height, 150)
  })

  await test('returns defaults when no dimensions found', () => {
    const svg = '<svg></svg>'
    const { width, height } = getSvgDimensions(svg)
    assert.strictEqual(width, 604)
    assert.strictEqual(height, 400)
  })

  console.log('\nsvgCacheDir')

  await test('returns cached/ as sibling of specRoot', () => {
    const result = svgCacheDir(path.join('/repo', 'spec'))
    assert.strictEqual(result, path.join('/repo', 'cached'))
  })

  console.log('\nfindMscgen')

  await test('returns a string path or null', () => {
    const result = findMscgen()
    assert.ok(result === null || typeof result === 'string')
  })

  console.log('\nrenderMscgenBatch')

  await test('returns empty array for empty input', () => {
    assert.deepStrictEqual(renderMscgenBatch([]), [])
  })

  await test('returns empty array for null input', () => {
    assert.deepStrictEqual(renderMscgenBatch(null), [])
  })

  if (findMscgen()) {
    await test('renders SVG and PNG when msc-gen is available', () => {
      const code = 'u: UE;\nn: Network;\n|||;\nu->n: RRCSetupRequest;\n|||;'
      const results = renderMscgenBatch([code])
      assert.strictEqual(results.length, 1)
      assert.ok(results[0].svg !== null, 'SVG should be rendered')
      assert.ok(results[0].svg.includes('<svg'), 'SVG should contain <svg tag')
      assert.ok(results[0].png !== null, 'PNG should be rendered')
      assert.ok(Buffer.isBuffer(results[0].png), 'PNG should be a Buffer')
    })

    await test('renders multiple diagrams', () => {
      const codes = [
        'u: UE;\nn: Network;\nu->n: msg1;',
        'a: A;\nb: B;\na->b: hello;'
      ]
      const results = renderMscgenBatch(codes)
      assert.strictEqual(results.length, 2)
      assert.ok(results[0].svg !== null)
      assert.ok(results[1].svg !== null)
    })
  } else {
    console.log('  (skipped: msc-gen not installed)')
  }

  console.log('\nrenderMscgenWithCache')

  await test('calls renderFn for uncached diagrams', async () => {
    const tempDir = path.join(os.tmpdir(), `mscgen-cache-test-${Date.now()}`)
    fs.mkdirSync(path.join(tempDir, 'spec'), { recursive: true })
    try {
      const specRoot = path.join(tempDir, 'spec')
      let renderCalled = false
      const mockRender = (codes) => {
        renderCalled = true
        return codes.map(() => ({ svg: '<svg>mock</svg>', png: Buffer.from('PNG') }))
      }
      const results = await renderMscgenWithCache(['u: UE;'], '{}', specRoot, mockRender)
      assert.ok(renderCalled)
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].svg, '<svg>mock</svg>')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  await test('serves cached SVG without calling renderFn', async () => {
    const tempDir = path.join(os.tmpdir(), `mscgen-cache-test-${Date.now()}`)
    fs.mkdirSync(path.join(tempDir, 'spec'), { recursive: true })
    const cacheDir = path.join(tempDir, 'cached')
    fs.mkdirSync(cacheDir, { recursive: true })
    try {
      const specRoot = path.join(tempDir, 'spec')
      const code = 'u: UE;'
      const key = mscgenCacheKey(code, '{}')
      fs.writeFileSync(path.join(cacheDir, `${key}.svg`), '<svg>cached</svg>')

      let renderCalled = false
      const mockRender = () => { renderCalled = true; return [] }
      const results = await renderMscgenWithCache([code], '{}', specRoot, mockRender)
      assert.ok(!renderCalled)
      assert.strictEqual(results[0].svg, '<svg>cached</svg>')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  await test('writes rendered SVG and PNG to cache', async () => {
    const tempDir = path.join(os.tmpdir(), `mscgen-cache-test-${Date.now()}`)
    fs.mkdirSync(path.join(tempDir, 'spec'), { recursive: true })
    try {
      const specRoot = path.join(tempDir, 'spec')
      const cacheDir = path.join(tempDir, 'cached')
      const code = 'a: A;'
      // Write an md file referencing this code so cleanup won't remove the cache
      fs.writeFileSync(path.join(tempDir, 'spec', 'test.md'), '```mscgen\na: A;\n```\n')
      const mockRender = () => [{ svg: '<svg>new</svg>', png: Buffer.from('PNGDATA') }]
      await renderMscgenWithCache([code], '{}', specRoot, mockRender)

      const key = mscgenCacheKey(code, '{}')
      assert.ok(fs.existsSync(path.join(cacheDir, `${key}.svg`)))
      assert.ok(fs.existsSync(path.join(cacheDir, `${key}.png`)))
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  await test('different config produces different cache key', async () => {
    const key1 = mscgenCacheKey('u: UE;', '{"a":1}')
    const key2 = mscgenCacheKey('u: UE;', '{"a":2}')
    assert.notStrictEqual(key1, key2, 'different configs should produce different cache keys')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run()
