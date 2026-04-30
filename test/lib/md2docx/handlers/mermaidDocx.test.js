const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const JSZip = require('jszip')
const { MarkdownToDocxConverter } = require('../../../../lib/md2docx/md2docx')
const { renderWithCache, getSvgDimensions } = require('../../../../lib/md2docx/handlers/mermaidHandler')

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

const MOCK_SVG = '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg"><text>mock</text></svg>'

const MERMAID_MD = `# Heading

\`\`\`mermaid
sequenceDiagram
    Network ->>UE: SecurityModeCommand
    UE->>Network: SecurityModeComplete
\`\`\`
`

async function convertAndRead(md, renderer) {
  const converter = new MarkdownToDocxConverter(null, '', renderer)
  const tmpDir = os.tmpdir()
  const ts = Date.now() + '_' + Math.random().toString(36).slice(2)
  const mdPath = path.join(tmpDir, `.~mermaid_test_${ts}.md`)
  const docxPath = path.join(tmpDir, `.~mermaid_test_${ts}.docx`)
  fs.writeFileSync(mdPath, md)
  try {
    await converter.convert(mdPath, docxPath, tmpDir)
    const buf = fs.readFileSync(docxPath)
    const zip = await JSZip.loadAsync(buf)
    return { zip, converter }
  } finally {
    if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath)
    if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath)
  }
}

async function run() {
  console.log('mermaid DOCX embedding')

  await test('mermaid fence is embedded as SVG image via mermaidRenderer', async () => {
    const mockRenderer = async (codes) => codes.map(() => MOCK_SVG)
    const { zip, converter } = await convertAndRead(MERMAID_MD, mockRenderer)
    const svgFiles = Object.keys(zip.files).filter(f => f.endsWith('.svg'))
    assert.strictEqual(svgFiles.length, 1, 'should have one SVG in media')
    const svgContent = await zip.file(svgFiles[0]).async('string')
    assert.ok(svgContent.includes('<text>mock</text>'), 'SVG should contain mock content')
    assert.strictEqual(converter.imageCount, 1, 'imageCount should be 1')
  })

  await test('mermaid renderer receives the diagram code', async () => {
    let receivedCodes = null
    const mockRenderer = async (codes) => { receivedCodes = codes; return codes.map(() => MOCK_SVG) }
    await convertAndRead(MERMAID_MD, mockRenderer)
    assert.ok(receivedCodes, 'renderer should have been called')
    assert.strictEqual(receivedCodes.length, 1, 'should receive one diagram')
    assert.ok(receivedCodes[0].includes('SecurityModeCommand'), 'code should contain the diagram text')
  })

  await test('null SVG produces failure placeholder', async () => {
    const mockRenderer = async (codes) => codes.map(() => null)
    const { zip, converter } = await convertAndRead(MERMAID_MD, mockRenderer)
    const docXml = await zip.file('word/document.xml').async('string')
    assert.ok(docXml.includes('Mermaid diagram conversion failed'), 'document.xml should contain failure message')
    assert.strictEqual(converter.imageCount, 0, 'imageCount should be 0')
  })

  await test('no mermaid fences does not call renderer', async () => {
    let called = false
    const mockRenderer = async (codes) => { called = true; return codes.map(() => MOCK_SVG) }
    await convertAndRead('# Just a heading\n\nSome text.\n', mockRenderer)
    assert.ok(!called, 'renderer should not be called when no mermaid fences')
  })

  console.log('\nmermaid SVG caching')

  function makeSpecRoot(mermaidCodes) {
    const root = path.join(os.tmpdir(), `.~mermaid_repo_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    const specRoot = path.join(root, 'spec')
    fs.mkdirSync(specRoot, { recursive: true })
    const fences = mermaidCodes.map(c => '```mermaid\n' + c + '\n```').join('\n\n')
    fs.writeFileSync(path.join(specRoot, 'test.md'), '# Test\n\n' + fences + '\n')
    return specRoot
  }

  await test('renderWithCache calls renderFn for uncached diagrams', async () => {
    const code = 'graph TD; A-->B'
    const specRoot = makeSpecRoot([code])
    let renderCalled = false
    const renderFn = async (codes) => { renderCalled = true; return codes.map(() => MOCK_SVG) }
    const results = await renderWithCache([code], '{}', specRoot, renderFn)
    assert.ok(renderCalled, 'renderFn should be called')
    assert.strictEqual(results.length, 1)
    assert.ok(results[0].includes('<text>mock</text>'), 'should return rendered SVG')
    fs.rmSync(path.dirname(specRoot), { recursive: true })
  })

  await test('renderWithCache serves cached SVG without calling renderFn', async () => {
    const code = 'graph TD; X-->Y'
    const specRoot = makeSpecRoot([code])
    const renderFn = async (codes) => codes.map(() => MOCK_SVG)
    await renderWithCache([code], '{}', specRoot, renderFn)
    let calledAgain = false
    const renderFn2 = async (codes) => { calledAgain = true; return codes.map(() => '<svg>new</svg>') }
    const results = await renderWithCache([code], '{}', specRoot, renderFn2)
    assert.ok(!calledAgain, 'renderFn should not be called for cached diagram')
    assert.ok(results[0].includes('<text>mock</text>'), 'should return original cached SVG')
    fs.rmSync(path.dirname(specRoot), { recursive: true })
  })

  await test('renderWithCache re-renders when source changes', async () => {
    const specRoot = makeSpecRoot(['graph TD; A-->C'])
    const renderFn = async (codes) => codes.map(c => `<svg>${c}</svg>`)
    await renderWithCache(['graph TD; A-->B'], '{}', specRoot, renderFn)
    const results = await renderWithCache(['graph TD; A-->C'], '{}', specRoot, renderFn)
    assert.ok(results[0].includes('A-->C'), 'should render the new diagram')
    fs.rmSync(path.dirname(specRoot), { recursive: true })
  })

  await test('cleanup removes stale cached SVGs', async () => {
    const code1 = 'graph TD; Keep-->This'
    const code2 = 'graph TD; Remove-->This'
    const specRoot = makeSpecRoot([code1, code2])
    const renderFn = async (codes) => codes.map(c => `<svg>${c}</svg>`)
    await renderWithCache([code1, code2], '{}', specRoot, renderFn)
    const cacheDir = path.join(specRoot, '..', 'cached')
    assert.strictEqual(fs.readdirSync(cacheDir).filter(f => f.endsWith('.svg')).length, 2, 'should have 2 cached SVGs')
    // Remove code2 from the MD file, re-render only code1
    fs.writeFileSync(path.join(specRoot, 'test.md'), '# Test\n\n```mermaid\n' + code1 + '\n```\n')
    await renderWithCache([code1], '{}', specRoot, renderFn)
    const remaining = fs.readdirSync(cacheDir).filter(f => f.endsWith('.svg'))
    assert.strictEqual(remaining.length, 1, 'stale SVG should be deleted')
    fs.rmSync(path.dirname(specRoot), { recursive: true })
  })

  await test('multiple mermaid fences are batched in one renderFn call', async () => {
    const codes = ['graph TD; A-->B', 'graph TD; C-->D', 'graph TD; E-->F']
    const specRoot = makeSpecRoot(codes)
    let callCount = 0
    const renderFn = async (c) => { callCount++; return c.map(x => `<svg>${x}</svg>`) }
    const results = await renderWithCache(codes, '{}', specRoot, renderFn)
    assert.strictEqual(callCount, 1, 'renderFn should be called once for all uncached')
    assert.strictEqual(results.length, 3)
    assert.ok(results[0].includes('A-->B'))
    assert.ok(results[2].includes('E-->F'))
    fs.rmSync(path.dirname(specRoot), { recursive: true })
  })

  await test('mixed cached and uncached in one batch', async () => {
    const code1 = 'graph TD; Cached-->One'
    const code2 = 'graph TD; New-->Two'
    const specRoot = makeSpecRoot([code1, code2])
    const renderFn = async (codes) => codes.map(c => `<svg>${c}</svg>`)
    // Pre-cache code1 only
    await renderWithCache([code1], '{}', specRoot, renderFn)
    let renderedCodes = null
    const renderFn2 = async (codes) => { renderedCodes = codes; return codes.map(c => `<svg>${c}</svg>`) }
    const results = await renderWithCache([code1, code2], '{}', specRoot, renderFn2)
    assert.ok(renderedCodes, 'renderFn should be called for uncached')
    assert.strictEqual(renderedCodes.length, 1, 'only uncached code should be rendered')
    assert.ok(renderedCodes[0].includes('New-->Two'), 'should render only the new diagram')
    assert.ok(results[0].includes('Cached-->One'), 'first result from cache')
    assert.ok(results[1].includes('New-->Two'), 'second result freshly rendered')
    fs.rmSync(path.dirname(specRoot), { recursive: true })
  })

  await test('different config produces different cache key', async () => {
    const code = 'graph TD; Same-->Code'
    const specRoot = makeSpecRoot([code])
    const renderFn = async (codes) => codes.map(() => '<svg>config1</svg>')
    await renderWithCache([code], '{"theme":"dark"}', specRoot, renderFn)
    let called = false
    const renderFn2 = async (codes) => { called = true; return codes.map(() => '<svg>config2</svg>') }
    await renderWithCache([code], '{"theme":"forest"}', specRoot, renderFn2)
    assert.ok(called, 'different config should miss cache and call renderFn')
    fs.rmSync(path.dirname(specRoot), { recursive: true })
  })

  await test('CRLF in source files matches LF-normalized cache keys', async () => {
    const codeLF = 'graph TD\n    A-->B'
    const specRoot = makeSpecRoot([codeLF])
    // Write the MD file with CRLF line endings
    const mdPath = path.join(specRoot, 'test.md')
    const content = fs.readFileSync(mdPath, 'utf8').replace(/\n/g, '\r\n')
    fs.writeFileSync(mdPath, content)
    const renderFn = async (codes) => codes.map(() => MOCK_SVG)
    await renderWithCache([codeLF], '{}', specRoot, renderFn)
    const cacheDir = path.join(specRoot, '..', 'cached')
    const svgCount = fs.readdirSync(cacheDir).filter(f => f.endsWith('.svg')).length
    assert.strictEqual(svgCount, 1, 'cached SVG should survive cleanup with CRLF source')
    fs.rmSync(path.dirname(specRoot), { recursive: true })
  })

  await test('cleanup scans subdirectories for mermaid fences', async () => {
    const root = path.join(os.tmpdir(), `.~mermaid_sub_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    const specRoot = path.join(root, 'spec')
    const subDir = path.join(specRoot, 'sub')
    fs.mkdirSync(subDir, { recursive: true })
    const code1 = 'graph TD; Root-->File'
    const code2 = 'graph TD; Sub-->File'
    fs.writeFileSync(path.join(specRoot, 'root.md'), '```mermaid\n' + code1 + '\n```\n')
    fs.writeFileSync(path.join(subDir, 'nested.md'), '```mermaid\n' + code2 + '\n```\n')
    const renderFn = async (codes) => codes.map(c => `<svg>${c}</svg>`)
    await renderWithCache([code1, code2], '{}', specRoot, renderFn)
    const cacheDir = path.join(root, 'cached')
    assert.strictEqual(fs.readdirSync(cacheDir).filter(f => f.endsWith('.svg')).length, 2, 'both SVGs cached')
    // Remove the subdirectory file
    fs.unlinkSync(path.join(subDir, 'nested.md'))
    await renderWithCache([code1], '{}', specRoot, renderFn)
    assert.strictEqual(fs.readdirSync(cacheDir).filter(f => f.endsWith('.svg')).length, 1, 'stale sub SVG removed')
    fs.rmSync(root, { recursive: true })
  })

  console.log('\ngetSvgDimensions')

  await test('extracts dimensions from viewBox', async () => {
    const { width, height } = getSvgDimensions('<svg viewBox="0 0 400 200"></svg>')
    assert.strictEqual(width, 400)
    assert.strictEqual(height, 200)
  })

  await test('caps width at 604 and scales height proportionally', async () => {
    const { width, height } = getSvgDimensions('<svg viewBox="0 0 1208 400"></svg>')
    assert.strictEqual(width, 604)
    assert.strictEqual(height, 200)
  })

  await test('returns defaults when no viewBox', async () => {
    const { width, height } = getSvgDimensions('<svg></svg>')
    assert.strictEqual(width, 604)
    assert.strictEqual(height, 400)
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()

