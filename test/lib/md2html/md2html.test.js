const assert = require('assert')
const { Md2Html } = require('../../../lib/md2html/md2html')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

// --- constructor ---

console.log('constructor')

test('uses defaults when no options provided', () => {
  const p = new Md2Html()
  assert.strictEqual(p.css, '')
  assert.strictEqual(p.mermaidConfig, '{}')
  assert.deepStrictEqual(p.customRenderers, {})
  assert.strictEqual(p.resolveImageUri, null)
  assert.strictEqual(p.extraHeadContent, '')
  assert.strictEqual(p.md, null)
})

test('accepts all options', () => {
  const resolve = (p) => p
  const p = new Md2Html({
    css: 'body{}',
    mermaidConfig: '{"theme":"dark"}',
    customRenderers: { fence: '() => "x"' },
    resolveImageUri: resolve,
    extraHeadContent: '<script></script>'
  })
  assert.strictEqual(p.css, 'body{}')
  assert.strictEqual(p.mermaidConfig, '{"theme":"dark"}')
  assert.strictEqual(p.resolveImageUri, resolve)
  assert.strictEqual(p.extraHeadContent, '<script></script>')
})

// --- initMarkdown ---

console.log('\ninitMarkdown')

test('initializes md instance', () => {
  const p = new Md2Html()
  assert.strictEqual(p.md, null)
  p.initMarkdown()
  assert.ok(p.md !== null)
})

test('lazy init via renderBody', () => {
  const p = new Md2Html()
  p.renderBody('hello', false)
  assert.ok(p.md !== null)
})

console.log('\nrenderBody')

test('renders basic markdown', () => {
  const p = new Md2Html()
  const result = p.renderBody('**bold**', false)
  assert.ok(result.includes('<strong>bold</strong>'))
})

test('renders headings', () => {
  const p = new Md2Html()
  const result = p.renderBody('# Title', false)
  assert.ok(result.includes('>Title</h1>'))
})

test('adds data-source-line when forPreview is true', () => {
  const p = new Md2Html()
  const result = p.renderBody('# Title\n\nParagraph', true)
  assert.ok(result.includes('data-source-line'))
})

test('omits data-source-line when forPreview is false', () => {
  const p = new Md2Html()
  const result = p.renderBody('# Title\n\nParagraph', false)
  assert.ok(!result.includes('data-source-line'))
})

test('renders mermaid fenced block', () => {
  const p = new Md2Html()
  const result = p.renderBody('```mermaid\ngraph TD\n```', false)
  assert.ok(result.includes('<pre class="mermaid">'))
  assert.ok(result.includes('graph TD'))
})

test('renders asn fenced block with highlighting', () => {
  const p = new Md2Html()
  const result = p.renderBody('```asn\nDEFINITIONS\n```', false)
  assert.ok(result.includes('<pre class="asn">'))
  assert.ok(result.includes('asn-keyword'))
})

test('renders task lists', () => {
  const p = new Md2Html()
  const result = p.renderBody('- [ ] unchecked\n- [x] checked', false)
  assert.ok(result.includes('type="checkbox"'))
})

test('renders emoji', () => {
  const p = new Md2Html()
  const result = p.renderBody(':smile:', false)
  assert.ok(result.includes('\u{1F604}'))
})

// --- paragraph classes ---

console.log('\nparagraph classes')

test('adds note class for NOTE: paragraph', () => {
  const p = new Md2Html()
  const result = p.renderBody('NOTE: important info', false)
  assert.ok(result.includes('class="note"'))
})

test('adds note class for **NOTE**: paragraph', () => {
  const p = new Md2Html()
  const result = p.renderBody('**NOTE**: important info', false)
  assert.ok(result.includes('class="note"'))
})

test('adds editors-note class', () => {
  const p = new Md2Html()
  const result = p.renderBody("Editor's Note: something", false)
  assert.ok(result.includes('class="editors-note"'))
})

test('adds editors-note class for bold variant', () => {
  const p = new Md2Html()
  const result = p.renderBody("**Editor's Note**: something", false)
  assert.ok(result.includes('class="editors-note"'))
})

test('adds table-caption class before table', () => {
  const p = new Md2Html()
  const result = p.renderBody('Table 1: My table\n\n| A | B |\n|---|---|\n| 1 | 2 |', false)
  assert.ok(result.includes('class="table-caption"'))
})

test('does not add table-caption when no table follows', () => {
  const p = new Md2Html()
  const result = p.renderBody('Table 1: No table here\n\nJust text', false)
  assert.ok(!result.includes('class="table-caption"'))
})

test('adds figure-caption class after fence', () => {
  const p = new Md2Html()
  const result = p.renderBody('```mermaid\ngraph TD\n```\n\nFigure 1: My diagram', false)
  assert.ok(result.includes('class="figure-caption"'))
})

// --- bullet list styles ---

console.log('\nbullet list styles')

test('extracts bullet symbol from unordered list', () => {
  const p = new Md2Html()
  const result = p.renderBody('- 1> First item', false)
  assert.ok(result.includes('data-bullet="1&gt;"'))
  assert.ok(result.includes('list-style-type'))
})

test('does not modify ordered list items', () => {
  const p = new Md2Html()
  const result = p.renderBody('1. First item', false)
  assert.ok(!result.includes('data-bullet'))
})

// --- custom renderers ---

console.log('\ncustom renderers')

test('applies custom renderer', () => {
  const p = new Md2Html({
    customRenderers: {
      heading_open: '(tokens, idx) => "<h1 class=\\"custom\\">"'
    }
  })
  const result = p.renderBody('# Hello', false)
  assert.ok(result.includes('class="custom"'))
})

test('falls back on custom renderer error', () => {
  const p = new Md2Html({
    customRenderers: {
      heading_open: 'this is not valid javascript'
    }
  })
  const result = p.renderBody('# Hello', false)
  assert.ok(result.includes('<h1'))
  assert.ok(result.includes('>Hello</h1>'))
})

// --- wrapHtml ---

console.log('\nwrapHtml')

test('produces complete HTML document', () => {
  const p = new Md2Html({ css: 'body{color:red}' })
  const result = p.wrapHtml('<p>hello</p>')
  assert.ok(result.startsWith('<!DOCTYPE html>'))
  assert.ok(result.includes('<body><p>hello</p></body>'))
  assert.ok(result.includes('body{color:red}'))
})

test('includes mermaid initialization', () => {
  const p = new Md2Html({ mermaidConfig: '{"theme":"forest"}' })
  const result = p.wrapHtml('<p>test</p>')
  assert.ok(result.includes('mermaid.initialize({"theme":"forest"})'))
})

test('includes KaTeX CSS', () => {
  const p = new Md2Html()
  const result = p.wrapHtml('<p>test</p>')
  assert.ok(result.includes('.katex'))
})

test('includes extra head content', () => {
  const p = new Md2Html()
  const result = p.wrapHtml('<p>test</p>', '<script>alert(1)</script>')
  assert.ok(result.includes('<script>alert(1)</script>'))
})

// --- renderMarkdown ---

console.log('\nrenderMarkdown')

test('returns complete HTML with data-source-line', () => {
  const p = new Md2Html()
  const result = p.renderMarkdown('# Hello')
  assert.ok(result.startsWith('<!DOCTYPE html>'))
  assert.ok(result.includes('data-source-line'))
  assert.ok(result.includes('<h1'))
})

test('includes extraHeadContent', () => {
  const p = new Md2Html({ extraHeadContent: '<!-- sync -->' })
  const result = p.renderMarkdown('hello')
  assert.ok(result.includes('<!-- sync -->'))
})

// --- renderMarkdownForExport ---

console.log('\nrenderMarkdownForExport')

test('returns complete HTML without data-source-line', () => {
  const p = new Md2Html()
  const result = p.renderMarkdownForExport('# Hello')
  assert.ok(result.startsWith('<!DOCTYPE html>'))
  assert.ok(!result.includes('data-source-line'))
  assert.ok(result.includes('<h1'))
})

test('does not include extraHeadContent', () => {
  const p = new Md2Html({ extraHeadContent: '<!-- sync -->' })
  const result = p.renderMarkdownForExport('hello')
  assert.ok(!result.includes('<!-- sync -->'))
})

test('embeds CSS in export', () => {
  const p = new Md2Html({ css: '.test{margin:0}' })
  const result = p.renderMarkdownForExport('hello')
  assert.ok(result.includes('.test{margin:0}'))
})

// --- image resolution ---

console.log('\nimage resolution')

test('does not resolve images when no resolveImageUri', () => {
  const p = new Md2Html()
  const result = p.renderBody('![alt](img.png)', true, '/some/dir')
  assert.ok(result.includes('src="img.png"'))
})

test('does not resolve images when forPreview is false', () => {
  const p = new Md2Html({ resolveImageUri: () => 'resolved' })
  const result = p.renderBody('![alt](img.png)', false, '/some/dir')
  assert.ok(result.includes('src="img.png"'))
})

test('skips http URLs', () => {
  const p = new Md2Html({ resolveImageUri: () => 'resolved' })
  const result = p.renderBody('![alt](http://example.com/img.png)', true, '/some/dir')
  assert.ok(result.includes('src="http://example.com/img.png"'))
})

test('skips https URLs', () => {
  const p = new Md2Html({ resolveImageUri: () => 'resolved' })
  const result = p.renderBody('![alt](https://example.com/img.png)', true, '/some/dir')
  assert.ok(result.includes('src="https://example.com/img.png"'))
})

test('skips data URIs', () => {
  const p = new Md2Html({ resolveImageUri: () => 'resolved' })
  const result = p.renderBody('![alt](data:image/png;base64,abc)', true, '/some/dir')
  assert.ok(result.includes('src="data:image/png;base64,abc"'))
})

// ── Italic/bold text interactions ─────────────────────────────

console.log('\nitalic/bold text interactions')

test('NOTE with italic content gets note class', () => {
  const p = new Md2Html({})
  const result = p.renderBody('NOTE: *italic* content\n', false)
  assert.ok(result.includes('class="note"'))
})

test('**NOTE**: bold keyword gets note class', () => {
  const p = new Md2Html({})
  const result = p.renderBody('**NOTE**: bold note\n', false)
  assert.ok(result.includes('class="note"'))
})

test('*Editor*\'s Note gets editors-note class', () => {
  const p = new Md2Html({})
  const result = p.renderBody("*Editor*\u2019s Note: fix this\n", false)
  assert.ok(result.includes('class="editors-note"'))
})

test('EXAMPLE with italic content gets example class', () => {
  const p = new Md2Html({})
  const result = p.renderBody('EXAMPLE: *italic* example\n', false)
  assert.ok(result.includes('class="example"'))
})

test('NOTE inside table cell with italic gets table-note class', () => {
  const p = new Md2Html({})
  const result = p.renderBody('| A |\n|---|\n| NOTE: *italic* cell |\n', false)
  assert.ok(result.includes('class="table-note"'))
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
