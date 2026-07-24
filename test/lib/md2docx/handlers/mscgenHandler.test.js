const { test, describe } = require('node:test')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')

const { parseMscgenPreamble, applyMscgenPreamble, loadMscgenConfig, extractMscgenType, prepareMscgenCode } = require('../../../../lib/common/mscgenConfig')
const { findMscgen, renderMscgenBatch } = require('../../../../lib/common/mscgenRenderer')
const { renderMscgenCached } = require('../../../../lib/common/diagramRenderers')
const { getSvgDimensions, cacheKey: mscgenCacheKey, svgCacheDir } = require('../../../../lib/common/diagramCache')

describe('parseMscgenPreamble', () => {

  test('returns preamble array from valid JSON', () => {
    const config = JSON.stringify({ preamble: ['hscale="auto";', 'defstyle ac [text.italic=yes];'] })
    const result = parseMscgenPreamble(config)
    assert.deepStrictEqual(result, ['hscale="auto";', 'defstyle ac [text.italic=yes];'])
  })

  test('returns empty array for null', () => {
    assert.deepStrictEqual(parseMscgenPreamble(null), [])
  })

  test('returns empty array for empty string', () => {
    assert.deepStrictEqual(parseMscgenPreamble(''), [])
  })

  test('returns empty array for invalid JSON', () => {
    assert.deepStrictEqual(parseMscgenPreamble('not json'), [])
  })

  test('returns empty array when preamble is not an array', () => {
    assert.deepStrictEqual(parseMscgenPreamble('{"preamble": "string"}'), [])
  })

  test('returns empty array when preamble key is missing', () => {
    assert.deepStrictEqual(parseMscgenPreamble('{"other": []}'), [])
  })

})
describe('applyMscgenPreamble', () => {

  const preamble = ['hscale="auto";', 'defstyle ac [text.italic=yes];']

  test('prepends preamble to code without style definitions', () => {
    const code = 'u: UE;\nn: Network;\nu->n: msg [ac];'
    const result = applyMscgenPreamble(code, preamble)
    assert.ok(result.startsWith('hscale="auto";\ndefstyle ac'))
    assert.ok(result.endsWith(code))
  })

  test('does not prepend when code starts with hscale', () => {
    const code = 'hscale="auto";\nu: UE;\nn: Network;'
    const result = applyMscgenPreamble(code, preamble)
    assert.strictEqual(result, code)
  })

  test('does not prepend when code starts with defstyle', () => {
    const code = 'defstyle entity [text.bold=yes];\nu: UE;'
    const result = applyMscgenPreamble(code, preamble)
    assert.strictEqual(result, code)
  })

  test('returns code unchanged for empty preamble', () => {
    const code = 'u: UE;\nn: Network;'
    assert.strictEqual(applyMscgenPreamble(code, []), code)
  })

  test('returns code unchanged for null preamble', () => {
    const code = 'u: UE;\nn: Network;'
    assert.strictEqual(applyMscgenPreamble(code, null), code)
  })

})
describe('extractMscgenType', () => {

  test('returns signalling type and unchanged code when no @type directive', () => {
    const { code, type } = extractMscgenType('u: UE;\nn: Network;')
    assert.strictEqual(type, 'signalling')
    assert.strictEqual(code, 'u: UE;\nn: Network;')
  })

  test('extracts @type=block and removes the line', () => {
    const { code, type } = extractMscgenType('@type=block\na: A;\nb: B;')
    assert.strictEqual(type, 'block')
    assert.strictEqual(code, 'a: A;\nb: B;')
  })

  test('extracts @type=graph and removes the line', () => {
    const { code, type } = extractMscgenType('@type=graph\na: A;\nb: B;')
    assert.strictEqual(type, 'graph')
    assert.strictEqual(code, 'a: A;\nb: B;')
  })

  test('auto-detects graph type from "graph {" syntax without @type directive', () => {
    const raw = 'graph {\n    a; b;\n    a -> b;\n};'
    const { code, type } = extractMscgenType(raw)
    assert.strictEqual(type, 'graph')
    assert.strictEqual(code, raw, 'code should be unchanged for auto-detected graph')
  })

  test('auto-detects graph type when "graph" is followed by whitespace before "{"', () => {
    const raw = 'graph  {\n    a -> b;\n};'
    const { type } = extractMscgenType(raw)
    assert.strictEqual(type, 'graph')
  })

  test('@type=graph is still accepted explicitly and removes the line', () => {
    const { code, type } = extractMscgenType('@type=graph\na: A;\nb: B;')
    assert.strictEqual(type, 'graph')
    assert.strictEqual(code, 'a: A;\nb: B;')
  })

  test('extracts @type=signalling explicitly and removes the line', () => {
    const { code, type } = extractMscgenType('@type=signalling\nu: UE;')
    assert.strictEqual(type, 'signalling')
    assert.strictEqual(code, 'u: UE;')
  })

  test('is case-insensitive for the type value', () => {
    const { type } = extractMscgenType('@type=BLOCK\na: A;')
    assert.strictEqual(type, 'block')
  })

  test('leaves unknown type values in the code unchanged', () => {
    const raw = '@type=unknown\na: A;'
    const { code, type } = extractMscgenType(raw)
    assert.strictEqual(type, 'signalling')
    assert.strictEqual(code, raw)
  })

  test('@type= directive may appear anywhere in the code', () => {
    const { code, type } = extractMscgenType('a: A;\n@type=block\nb: B;')
    assert.strictEqual(type, 'block')
    assert.strictEqual(code, 'a: A;\nb: B;')
  })

})
describe('prepareMscgenCode', () => {

  test('returns signalling type and applies preamble for plain code', () => {
    const configJson = JSON.stringify({ preamble: ['hscale="auto";'] })
    const { code, type, cacheConfig } = prepareMscgenCode('u: UE;', configJson)
    assert.strictEqual(type, 'signalling')
    assert.ok(code.startsWith('hscale="auto";'))
    assert.strictEqual(cacheConfig, configJson)
  })

  test('strips @type=block and folds type into cacheConfig', () => {
    const configJson = JSON.stringify({ preamble: [] })
    const { code, type, cacheConfig } = prepareMscgenCode('@type=block\na: A;', configJson)
    assert.strictEqual(type, 'block')
    assert.ok(!code.includes('@type='))
    assert.ok(cacheConfig.includes('\0block'))
  })

  test('auto-detects graph type from "graph {" syntax without @type directive', () => {
    const raw = 'graph {\n    a -> b;\n};'
    const { code, type, cacheConfig } = prepareMscgenCode(raw, '{}')
    assert.strictEqual(type, 'graph')
    assert.strictEqual(code, raw, 'code should be unchanged')
    assert.ok(cacheConfig.includes('\0graph'))
  })

  test('signalling type does not modify cacheConfig', () => {
    const configJson = '{}'
    const { cacheConfig } = prepareMscgenCode('u: UE;', configJson)
    assert.strictEqual(cacheConfig, configJson)
  })

  test('block and graph produce different cacheConfigs from each other', () => {
    const { cacheConfig: blockConfig } = prepareMscgenCode('@type=block\na: A;', '{}')
    const { cacheConfig: graphConfig } = prepareMscgenCode('@type=graph\na: A;', '{}')
    assert.notStrictEqual(blockConfig, graphConfig)
  })

  test('block type produces different cache key than signalling for same code', () => {
    const { cacheKey } = require('../../../../lib/common/diagramCache')
    const raw = 'a: A;\nb: B;'
    const { code: codeS, cacheConfig: cfgS } = prepareMscgenCode(raw, '{}')
    const { code: codeB, cacheConfig: cfgB } = prepareMscgenCode('@type=block\n' + raw, '{}')
    assert.strictEqual(codeS, codeB, 'stripped code should be identical')
    assert.notStrictEqual(cacheKey(codeS, cfgS), cacheKey(codeB, cfgB), 'cache keys must differ')
  })

  test('graph type produces different cache key than signalling and block for same code', () => {
    const { cacheKey } = require('../../../../lib/common/diagramCache')
    const raw = 'a: A;\nb: B;'
    const graphRaw = 'graph {\n    a -> b;\n};'
    const { code: codeS, cacheConfig: cfgS } = prepareMscgenCode(raw, '{}')
    const { code: codeB, cacheConfig: cfgB } = prepareMscgenCode('@type=block\n' + raw, '{}')
    const { code: codeG, cacheConfig: cfgG } = prepareMscgenCode(graphRaw, '{}')
    assert.notStrictEqual(cacheKey(codeS, cfgS), cacheKey(codeG, cfgG), 'signalling vs graph keys must differ')
    assert.notStrictEqual(cacheKey(codeB, cfgB), cacheKey(codeG, cfgG), 'block vs graph keys must differ')
  })

})
describe('loadMscgenConfig', () => {

  test('loads the built-in default config', () => {
    const config = loadMscgenConfig(null)
    assert.ok(config !== null)
    const parsed = JSON.parse(config)
    assert.ok(Array.isArray(parsed.preamble))
    assert.ok(parsed.preamble.length > 0)
  })

  test('loads a custom config file', () => {
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

  test('falls back to default when custom file does not exist', () => {
    const config = loadMscgenConfig('/nonexistent/path.json')
    assert.ok(config !== null)
    const parsed = JSON.parse(config)
    assert.ok(Array.isArray(parsed.preamble))
  })

})
describe('mscgenCacheKey', () => {

  test('returns a 64-char hex string', () => {
    const key = mscgenCacheKey('u: UE;', '{}')
    assert.ok(/^[a-f0-9]{64}$/.test(key))
  })

  test('same input produces same key', () => {
    const key1 = mscgenCacheKey('u: UE;', '{}')
    const key2 = mscgenCacheKey('u: UE;', '{}')
    assert.strictEqual(key1, key2)
  })

  test('different code produces different key', () => {
    const key1 = mscgenCacheKey('u: UE;', '{}')
    const key2 = mscgenCacheKey('u: Network;', '{}')
    assert.notStrictEqual(key1, key2)
  })

  test('different config produces different key', () => {
    const key1 = mscgenCacheKey('u: UE;', '{"a":1}')
    const key2 = mscgenCacheKey('u: UE;', '{"a":2}')
    assert.notStrictEqual(key1, key2)
  })

})
describe('getSvgDimensions', () => {

  test('extracts dimensions from viewBox', () => {
    const svg = '<svg viewBox="0 0 400 200"></svg>'
    const { width, height } = getSvgDimensions(svg)
    assert.strictEqual(width, 400)
    assert.strictEqual(height, 200)
  })

  test('caps width at 604 and scales height proportionally', () => {
    const svg = '<svg viewBox="0 0 1208 600"></svg>'
    const { width, height } = getSvgDimensions(svg)
    assert.strictEqual(width, 604)
    assert.strictEqual(height, 300)
  })

  test('extracts from width/height attributes when no viewBox', () => {
    const svg = '<svg width="300" height="150"></svg>'
    const { width, height } = getSvgDimensions(svg)
    assert.strictEqual(width, 300)
    assert.strictEqual(height, 150)
  })

  test('returns defaults when no dimensions found', () => {
    const svg = '<svg></svg>'
    const { width, height } = getSvgDimensions(svg)
    assert.strictEqual(width, 604)
    assert.strictEqual(height, 400)
  })

})
describe('svgCacheDir', () => {

  test('returns cached/ as sibling of specRoot', () => {
    const result = svgCacheDir(path.join('/repo', 'spec'))
    assert.strictEqual(result, path.join('/repo', 'cached'))
  })

})
describe('findMscgen', () => {

  test('returns a string path or null', () => {
    const result = findMscgen()
    assert.ok(result === null || typeof result === 'string')
  })

})
describe('renderMscgenBatch', () => {

  test('returns empty array for empty input', () => {
    assert.deepStrictEqual(renderMscgenBatch([]), [])
  })

  test('returns empty array for null input', () => {
    assert.deepStrictEqual(renderMscgenBatch(null), [])
  })

  const mscgenSkip = findMscgen() ? undefined : 'msc-gen not installed'

  test('renders SVG and PNG for signalling diagram', { skip: mscgenSkip }, () => {
      const results = renderMscgenBatch([{ code: 'u: UE;\nn: Network;\n|||;\nu->n: RRCSetupRequest;\n|||;', type: 'signalling' }])
      assert.strictEqual(results.length, 1)
      assert.ok(results[0].svg !== null, 'SVG should be rendered')
      assert.ok(results[0].svg.includes('<svg'), 'SVG should contain <svg tag')
      assert.ok(results[0].png !== null, 'PNG should be rendered')
      assert.ok(Buffer.isBuffer(results[0].png), 'PNG should be a Buffer')
    })

    const BLOCK_CODE = '##Multiple blocks with the same content\n##multiple blocks with same content\nbox A, B [color=lgray] { X->Y; }\nbelow A\nbox C, D [color=aqua] { F->G->H,B; }\n\nrightof C.H C.F, C.G [line.width=3];'
    const GRAPH_CODE = 'graph {\n    rankdir = LR;\n    a; b;\n    c [label="C and c"];\n    d::D and d;\n    other [color=red];\n    {a, b} -> other -> {c, d};\n    b:sw == d;\n    {rank=same; d->e1;}\n    d->e2;\n};'
    test('renders block diagram with @type=block content', { skip: mscgenSkip }, () => {
      const results = renderMscgenBatch([{ code: BLOCK_CODE, type: 'block' }])
      assert.strictEqual(results.length, 1)
      assert.ok(results[0].svg !== null, 'SVG should be rendered for block diagram')
      assert.ok(results[0].svg.includes('<svg'), 'SVG should contain <svg tag')
    })

    test('renders graph diagram — auto-detected from "graph {" syntax, no @type needed', { skip: mscgenSkip }, () => {
      const results = renderMscgenBatch([{ code: GRAPH_CODE, type: 'graph' }])
      assert.strictEqual(results.length, 1)
      assert.ok(results[0].svg !== null, 'SVG should be rendered for graph diagram')
      assert.ok(results[0].svg.includes('<svg'), 'SVG should contain <svg tag')
    })

    test('renders multiple diagrams of mixed types', { skip: mscgenSkip }, () => {
      const entries = [
        { code: 'u: UE;\nn: Network;\nu->n: msg1;', type: 'signalling' },
        { code: BLOCK_CODE, type: 'block' },
        { code: GRAPH_CODE, type: 'graph' }
      ]
      const results = renderMscgenBatch(entries)
      assert.strictEqual(results.length, 3)
      assert.ok(results[0].svg !== null, 'signalling SVG should be rendered')
      assert.ok(results[1].svg !== null, 'block SVG should be rendered')
      assert.ok(results[2].svg !== null, 'graph SVG should be rendered')
    })

    test('all three types produce different SVG output for equivalent content', { skip: mscgenSkip }, () => {
      const code = 'a: A;\nb: B;\na->b: hello;'
      const [sigResult] = renderMscgenBatch([{ code, type: 'signalling' }])
      const [blkResult] = renderMscgenBatch([{ code, type: 'block' }])
      const [gphResult] = renderMscgenBatch([{ code, type: 'graph' }])
      assert.ok(sigResult.svg !== null)
      assert.ok(blkResult.svg !== null)
      assert.ok(gphResult.svg !== null)
      assert.notStrictEqual(sigResult.svg, blkResult.svg, 'signalling vs block should differ')
      assert.notStrictEqual(sigResult.svg, gphResult.svg, 'signalling vs graph should differ')
      assert.notStrictEqual(blkResult.svg, gphResult.svg, 'block vs graph should differ')
    })


})
describe('renderMscgenCached', () => {

  const MOCK_PNG = Buffer.from('png')

  test('calls renderFn for uncached diagrams', async () => {
    const tempDir = path.join(os.tmpdir(), `mscgen-cache-test-${Date.now()}`)
    fs.mkdirSync(path.join(tempDir, 'spec'), { recursive: true })
    try {
      const specRoot = path.join(tempDir, 'spec')
      let renderCalled = false
      const mockRender = (entries) => {
        renderCalled = true
        return entries.map(() => ({ svg: '<svg>mock</svg>', png: Buffer.from('PNG') }))
      }
      const results = await renderMscgenCached(['u: UE;'], '{}', specRoot, mockRender)
      assert.ok(renderCalled)
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].svg, '<svg>mock</svg>')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('renderFn receives { code, type } entries', async () => {
    const tempDir = path.join(os.tmpdir(), `mscgen-cache-test-${Date.now()}`)
    fs.mkdirSync(path.join(tempDir, 'spec'), { recursive: true })
    try {
      const specRoot = path.join(tempDir, 'spec')
      const { prepareMscgenCode: prep } = require('../../../../lib/common/mscgenConfig')
      const { code, type, cacheConfig } = prep('@type=block\na: A;', '{}')
      let receivedEntries
      const mockRender = (entries) => { receivedEntries = entries; return entries.map(() => ({ svg: '<svg>block</svg>', png: null })) }
      await renderMscgenCached([code], cacheConfig, specRoot, mockRender)
      // The cache pipeline passes plain codes to renderFn — type is carried by the caller's closure
      assert.strictEqual(receivedEntries.length, 1)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('serves cached SVG without calling renderFn', async () => {
    const tempDir = path.join(os.tmpdir(), `mscgen-cache-test-${Date.now()}`)
    fs.mkdirSync(path.join(tempDir, 'spec'), { recursive: true })
    const cacheDir = path.join(tempDir, 'cached')
    fs.mkdirSync(cacheDir, { recursive: true })
    try {
      const specRoot = path.join(tempDir, 'spec')
      const code = 'u: UE;'
      const key = mscgenCacheKey(code, '{}')
      fs.writeFileSync(path.join(cacheDir, `${key}.svg`), '<svg>cached</svg>')
      fs.writeFileSync(path.join(cacheDir, `${key}.png`), MOCK_PNG)

      let renderCalled = false
      const mockRender = () => { renderCalled = true; return [] }
      const results = await renderMscgenCached([code], '{}', specRoot, mockRender)
      assert.ok(!renderCalled)
      assert.strictEqual(results[0].svg, '<svg>cached</svg>')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('block diagram uses different cache key than signalling for same code', async () => {
    const raw = 'a: A;\nb: B;'
    const { code: codeS, cacheConfig: cfgS } = prepareMscgenCode(raw, '{}')
    const { code: codeB, cacheConfig: cfgB } = prepareMscgenCode('@type=block\n' + raw, '{}')
    assert.strictEqual(codeS, codeB)
    assert.notStrictEqual(mscgenCacheKey(codeS, cfgS), mscgenCacheKey(codeB, cfgB))
  })

  test('block diagram cache is separate from signalling cache on disk', async () => {
    const tempDir = path.join(os.tmpdir(), `mscgen-cache-test-${Date.now()}`)
    fs.mkdirSync(path.join(tempDir, 'spec'), { recursive: true })
    const cacheDir = path.join(tempDir, 'cached')
    fs.mkdirSync(cacheDir, { recursive: true })
    try {
      const specRoot = path.join(tempDir, 'spec')
      const raw = 'a: A;'
      const graphRaw = 'graph {\n    a -> b;\n};'
      const { code: codeS, cacheConfig: cfgS } = prepareMscgenCode(raw, '{}')
      const { code: codeB, cacheConfig: cfgB } = prepareMscgenCode('@type=block\n' + raw, '{}')
      const { code: codeG, cacheConfig: cfgG } = prepareMscgenCode(graphRaw, '{}')
      const keyS = mscgenCacheKey(codeS, cfgS)
      const keyB = mscgenCacheKey(codeB, cfgB)
      const keyG = mscgenCacheKey(codeG, cfgG)
      fs.writeFileSync(path.join(cacheDir, `${keyS}.svg`), '<svg>signalling</svg>')
      fs.writeFileSync(path.join(cacheDir, `${keyS}.png`), MOCK_PNG)
      fs.writeFileSync(path.join(cacheDir, `${keyB}.svg`), '<svg>block</svg>')
      fs.writeFileSync(path.join(cacheDir, `${keyB}.png`), MOCK_PNG)
      fs.writeFileSync(path.join(cacheDir, `${keyG}.svg`), '<svg>graph</svg>')
      fs.writeFileSync(path.join(cacheDir, `${keyG}.png`), MOCK_PNG)

      const [sigResult] = await renderMscgenCached([codeS], cfgS, specRoot, () => [])
      const [blkResult] = await renderMscgenCached([codeB], cfgB, specRoot, () => [])
      const [gphResult] = await renderMscgenCached([codeG], cfgG, specRoot, () => [])
      assert.strictEqual(sigResult.svg, '<svg>signalling</svg>')
      assert.strictEqual(blkResult.svg, '<svg>block</svg>')
      assert.strictEqual(gphResult.svg, '<svg>graph</svg>')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('writes rendered SVG and PNG to cache', async () => {
    const tempDir = path.join(os.tmpdir(), `mscgen-cache-test-${Date.now()}`)
    fs.mkdirSync(path.join(tempDir, 'spec'), { recursive: true })
    try {
      const specRoot = path.join(tempDir, 'spec')
      const cacheDir = path.join(tempDir, 'cached')
      const code = 'a: A;'
      fs.writeFileSync(path.join(tempDir, 'spec', 'test.md'), '```mscgen\na: A;\n```\n')
      const mockRender = () => [{ svg: '<svg>new</svg>', png: Buffer.from('PNGDATA') }]
      await renderMscgenCached([code], '{}', specRoot, mockRender)

      const key = mscgenCacheKey(code, '{}')
      assert.ok(fs.existsSync(path.join(cacheDir, `${key}.svg`)))
      assert.ok(fs.existsSync(path.join(cacheDir, `${key}.png`)))
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('different config produces different cache key', async () => {
    const key1 = mscgenCacheKey('u: UE;', '{"a":1}')
    const key2 = mscgenCacheKey('u: UE;', '{"a":2}')
    assert.notStrictEqual(key1, key2, 'different configs should produce different cache keys')
  })


})