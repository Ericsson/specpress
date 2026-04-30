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

const ROOT = 'c:/spec'

function headings(html) {
  const re = /<h(\d)[^>]*>(.*?)<\/h\1>/g
  const results = []
  let m
  while ((m = re.exec(html)) !== null) {
    results.push({ level: parseInt(m[1]), text: m[2] })
  }
  return results
}

function captions(html, cssClass) {
  const re = new RegExp(`<p class="${cssClass}">(.*?)</p>`, 'g')
  const results = []
  let m
  while ((m = re.exec(html)) !== null) {
    results.push(m[1])
  }
  return results
}

// ── extractSectionNumber (already tested implicitly, but verify derivedSectionHeading concept) ──

console.log('derivation from file path')

test('derivedSectionNumber from nested path', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x Test', false, null, 'c:/spec/05_Architecture/01_Overview.md')
  assert.ok(html.includes('5.1'), `Expected 5.1 in: ${html}`)
})

test('derivedSectionNumber with zero-prefixed folder skipped', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('# x Test', false, null, 'c:/spec/06_Procedures/00_intro.md')
  assert.ok(html.includes('6'), `Expected 6 in: ${html}`)
})

test('derivedSectionNumber three levels deep', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('### x.x.x Test', false, null, 'c:/spec/05_Architecture/03_Interfaces/01_API.md')
  assert.ok(html.includes('5.3.1'), `Expected 5.3.1 in: ${html}`)
})

// ── Placeholder replacement: exact level match ──

console.log('\nplaceholder replacement at derived level')

test('replaces x.x placeholder at matching level', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x Overview', false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const h1 = headings(html)[0]
  assert.strictEqual(h1.text, '5.1 Overview')
})

test('appends derivedSectionHeading when actualHeadingName is empty', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x', false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const h1 = headings(html)[0]
  assert.strictEqual(h1.text, '5.1 Overview')
})

test('single x placeholder at level 1', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('# x', false, null, 'c:/spec/06_Procedures/00_intro.md')
  const h1 = headings(html)[0]
  assert.strictEqual(h1.text, '6 intro')
})

test('single x placeholder with name keeps name', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('# x Procedures', false, null, 'c:/spec/06_Procedures/00_intro.md')
  const h1 = headings(html)[0]
  assert.strictEqual(h1.text, '6 Procedures')
})

// ── Placeholder replacement: deeper levels ──

console.log('\nplaceholder replacement at deeper levels')

test('replaces x.x.N placeholder at deeper level', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x Overview\n### x.x.1 Details\n### x.x.2 More', false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const hs = headings(html)
  assert.strictEqual(hs[1].text, '5.1.1 Details')
  assert.strictEqual(hs[2].text, '5.1.2 More')
})

test('replaces x.x.N.M placeholder two levels deeper', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x Title\n### x.x.1 Sub\n#### x.x.1.1 Deep', false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const hs = headings(html)
  assert.strictEqual(hs[2].text, '5.1.1.1 Deep')
})

test('three-level derived with deeper placeholder', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('### x.x.x API\n#### x.x.x.1 Endpoints', false, null, 'c:/spec/05_Architecture/03_Interfaces/01_API.md')
  const hs = headings(html)
  assert.strictEqual(hs[0].text, '5.3.1 API')
  assert.strictEqual(hs[1].text, '5.3.1.1 Endpoints')
})

// ── ERROR cases ──

console.log('\nE.R.R.O.R injection')

test('no placeholder found → heading unchanged', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('### Just a heading', false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const h1 = headings(html)[0]
  assert.strictEqual(h1.text, 'Just a heading')
})

test('manual section number without placeholder → E.R.R.O.R', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## 2.3 My heading', false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const h1 = headings(html)[0]
  assert.ok(h1.text.includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${h1.text}`)
})

test('manual single-level number without placeholder → E.R.R.O.R', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('# 2 My heading', false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const h1 = headings(html)[0]
  assert.ok(h1.text.includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${h1.text}`)
})

test('styleHeadingLevel < derivedHeadingLevel → E.R.R.O.R', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('# x Big heading', false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const h1 = headings(html)[0]
  assert.ok(h1.text.includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${h1.text}`)
})

test('styleHeadingLevel != actualHeadingLevel → E.R.R.O.R', () => {
  // x.x.x.1 has actualHeadingLevel=4 but ### is styleLevel=3
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('### x.x.x.1 Wrong', false, null, 'c:/spec/05_Architecture/03_Interfaces/01_API.md')
  const h1 = headings(html)[0]
  assert.ok(h1.text.includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${h1.text}`)
})

test('second heading at derivedHeadingLevel → E.R.R.O.R', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x First\n## x.x Second', false, null, 'c:/spec/05_Architecture/02_Components.md')
  const hs = headings(html)
  assert.strictEqual(hs[0].text, '5.2 First')
  assert.ok(hs[1].text.includes('E.R.R.O.R'), `Expected E.R.R.O.R in second heading: ${hs[1].text}`)
})

test('file outside root → placeholder headings get E.R.R.O.R, plain headings unchanged', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x Title\n### Plain heading', false, null, 'c:/other/file.md')
  const hs = headings(html)
  assert.ok(hs[0].text.includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${hs[0].text}`)
  assert.strictEqual(hs[1].text, 'Plain heading')
})

test('empty derivedSectionNumber → placeholder heading gets E.R.R.O.R', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x Title', false, null, 'c:/spec/annex/notes.md')
  const h1 = headings(html)[0]
  assert.ok(h1.text.includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${h1.text}`)
})

test('placeholder has more x components than derivedHeadingLevel → E.R.R.O.R', () => {
  // derived: 2, derivedLevel: 1, but x.x has 2 x-components
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x Specification', false, null, 'c:/spec/02_Specification_Modernization/00_Heading.md')
  const h1 = headings(html)[0]
  assert.ok(h1.text.includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${h1.text}`)
})

// ── derivedSectionHeading appended when name is empty ──

console.log('\nderivedSectionHeading auto-append')

test('empty name after x.x → appends file-derived heading', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x', false, null, 'c:/spec/05_Architecture/02_Components.md')
  const h1 = headings(html)[0]
  assert.strictEqual(h1.text, '5.2 Components')
})

test('empty name after x.x.x → appends file-derived heading', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('### x.x.x', false, null, 'c:/spec/05_Architecture/03_Interfaces/01_API.md')
  const h1 = headings(html)[0]
  assert.strictEqual(h1.text, '5.3.1 API')
})

test('non-empty name after x.x → keeps original name', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x My Title', false, null, 'c:/spec/05_Architecture/02_Components.md')
  const h1 = headings(html)[0]
  assert.strictEqual(h1.text, '5.2 My Title')
})

test('italic heading name after x.x → no file-derived append', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x *Italic Title*', false, null, 'c:/spec/05_Architecture/02_Components.md')
  const h1 = headings(html)[0]
  assert.ok(!h1.text.includes('Components'), `Should not append file name, got: ${h1.text}`)
  assert.ok(h1.text.includes('Italic Title'), `Should keep italic title, got: ${h1.text}`)
})

test('bold heading name after x.x → no file-derived append', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const html = h.renderBody('## x.x **Bold Title**', false, null, 'c:/spec/05_Architecture/02_Components.md')
  const h1 = headings(html)[0]
  assert.ok(!h1.text.includes('Components'), `Should not append file name, got: ${h1.text}`)
  assert.ok(h1.text.includes('Bold Title'), `Should keep bold title, got: ${h1.text}`)
})

// ── Multi-file mode ──

console.log('\nmulti-file mode')

test('injects section numbers per file in multi-file content', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const content = [
    '<!-- FILE: c:/spec/05_Architecture/01_Overview.md -->',
    '## x.x Overview',
    '### x.x.1 Details',
    '',
    '<!-- FILE: c:/spec/05_Architecture/02_Components.md -->',
    '## x.x Components',
    '### x.x.1 First',
  ].join('\n')
  const html = h.renderBody(content, false)
  const hs = headings(html)
  assert.strictEqual(hs[0].text, '5.1 Overview')
  assert.strictEqual(hs[1].text, '5.1.1 Details')
  assert.strictEqual(hs[2].text, '5.2 Components')
  assert.strictEqual(hs[3].text, '5.2.1 First')
})

test('multi-file resets duplicate-at-derived-level counter per file', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const content = [
    '<!-- FILE: c:/spec/05_Architecture/01_Overview.md -->',
    '## x.x Overview',
    '',
    '<!-- FILE: c:/spec/05_Architecture/02_Components.md -->',
    '## x.x Components',
  ].join('\n')
  const html = h.renderBody(content, false)
  const hs = headings(html)
  // Both should succeed — each file gets one heading at derived level
  assert.strictEqual(hs[0].text, '5.1 Overview')
  assert.strictEqual(hs[1].text, '5.2 Components')
})

// ── Feature disabled ──

console.log('\nfeature disabled')

test('no specRootPath → headings unchanged', () => {
  const h = new Md2Html({})
  const html = h.renderBody('## x.x Title', false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const h1 = headings(html)[0]
  assert.strictEqual(h1.text, 'x.x Title')
})

// ── ASN files ──

console.log('\nASN files via asnToMarkdown')

test('asnToMarkdown generates correct x-placeholder for level 2', () => {
  const { asnToMarkdown } = require('../../../lib/md2html/handlers/asnHandler')
  const md = asnToMarkdown('MyModule DEFINITIONS ::= BEGIN\nEND', ROOT, 'c:/spec/05_Architecture/01_Module.asn')
  assert.ok(md.startsWith('## x.x'), `Expected ## x.x prefix, got: ${md.split('\n')[0]}`)
})

test('asnToMarkdown generates correct x-placeholder for level 3', () => {
  const { asnToMarkdown } = require('../../../lib/md2html/handlers/asnHandler')
  const md = asnToMarkdown('MyModule DEFINITIONS ::= BEGIN\nEND', ROOT, 'c:/spec/05_Architecture/03_Interfaces/01_Module.asn')
  assert.ok(md.startsWith('### x.x.x'), `Expected ### x.x.x prefix, got: ${md.split('\n')[0]}`)
})

test('asnToMarkdown falls back to #### when no specRootPath', () => {
  const { asnToMarkdown } = require('../../../lib/md2html/handlers/asnHandler')
  const md = asnToMarkdown('MyModule DEFINITIONS ::= BEGIN\nEND')
  assert.ok(md.startsWith('#### '), `Expected #### prefix, got: ${md.split('\n')[0]}`)
})

test('ASN heading gets section number in multi-file render', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const { concatenateFiles } = require('../../../lib/common/specProcessor')
  const content = concatenateFiles(
    ['c:/spec/05_Architecture/01_Module.asn'],
    () => 'MyModule DEFINITIONS ::= BEGIN\nEND',
    ROOT
  )
  const html = h.renderBody(content, false)
  const hs = headings(html)
  assert.ok(hs.length >= 2, 'Expected at least two headings (folder + ASN)')
  assert.deepStrictEqual(hs[0], { level: 1, text: '5 Architecture' })
  assert.ok(hs[1].text.includes('5.1'), `Expected 5.1 in ASN heading: ${hs[1].text}`)
})

// ── Figure captions ──

console.log('\nfigure caption placeholder replacement')

test('figure caption: replaces placeholder at matching section level', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const md = '## x.x Overview\n\n```mermaid\ngraph TD\n```\n\nFigure x.x-1: My diagram'
  const html = h.renderBody(md, false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const caps = captions(html, 'figure-caption')
  assert.strictEqual(caps[0], 'Figure 5.1-1: My diagram')
})

test('figure caption: replaces placeholder at deeper section level', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const md = '## x.x Overview\n### x.x.1 Details\n\n```mermaid\ngraph TD\n```\n\nFigure x.x.x-1: Detail diagram'
  const html = h.renderBody(md, false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const caps = captions(html, 'figure-caption')
  assert.strictEqual(caps[0], 'Figure 5.1.1-1: Detail diagram')
})

test('figure caption: placeholder level too low → E.R.R.O.R', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const md = '## x.x Overview\n### x.x.1 Details\n\n```mermaid\ngraph TD\n```\n\nFigure x.x-1: Wrong level'
  const html = h.renderBody(md, false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const caps = captions(html, 'figure-caption')
  assert.ok(caps[0].includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${caps[0]}`)
})

test('figure caption: placeholder level too high → E.R.R.O.R', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const md = '## x.x Overview\n\n```mermaid\ngraph TD\n```\n\nFigure x.x.x-1: Wrong level'
  const html = h.renderBody(md, false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const caps = captions(html, 'figure-caption')
  assert.ok(caps[0].includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${caps[0]}`)
})

test('figure caption: before any heading → E.R.R.O.R', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const md = '```mermaid\ngraph TD\n```\n\nFigure x.x-1: No heading yet'
  const html = h.renderBody(md, false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const caps = captions(html, 'figure-caption')
  assert.ok(caps[0].includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${caps[0]}`)
})

test('figure caption: no placeholder (starts with digit) → unchanged', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const md = '## x.x Overview\n\n```mermaid\ngraph TD\n```\n\nFigure 23: Some text'
  const html = h.renderBody(md, false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const caps = captions(html, 'figure-caption')
  assert.strictEqual(caps[0], 'Figure 23: Some text')
})

test('figure caption: feature disabled → unchanged', () => {
  const h = new Md2Html({})
  const md = '## x.x Overview\n\n```mermaid\ngraph TD\n```\n\nFigure x.x-1: My diagram'
  const html = h.renderBody(md, false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const caps = captions(html, 'figure-caption')
  assert.strictEqual(caps[0], 'Figure x.x-1: My diagram')
})

// ── Table captions ──

console.log('\ntable caption placeholder replacement')

test('table caption: replaces placeholder at matching section level', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const md = '## x.x Overview\n\nTable x.x-1: My table\n\n| A | B |\n|---|---|\n| 1 | 2 |'
  const html = h.renderBody(md, false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const caps = captions(html, 'table-caption')
  assert.strictEqual(caps[0], 'Table 5.1-1: My table')
})

test('table caption: no placeholder → unchanged', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const md = '## x.x Overview\n\nTable 7: My table\n\n| A | B |\n|---|---|\n| 1 | 2 |'
  const html = h.renderBody(md, false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const caps = captions(html, 'table-caption')
  assert.strictEqual(caps[0], 'Table 7: My table')
})

test('table caption: placeholder level mismatch → E.R.R.O.R', () => {
  const h = new Md2Html({ specRootPath: ROOT })
  const md = '## x.x Overview\n### x.x.1 Details\n\nTable x.x-1: Wrong\n\n| A | B |\n|---|---|\n| 1 | 2 |'
  const html = h.renderBody(md, false, null, 'c:/spec/05_Architecture/01_Overview.md')
  const caps = captions(html, 'table-caption')
  assert.ok(caps[0].includes('E.R.R.O.R'), `Expected E.R.R.O.R in: ${caps[0]}`)
})

// ── Auto-generated folder headings ──

console.log('\nauto-generated folder headings')

test('generates intermediate folder headings when no 00 file exists', () => {
  const { concatenateFiles } = require('../../../lib/common/specProcessor')
  const h = new Md2Html({ specRootPath: ROOT })
  const files = [
    'c:/spec/01_Top/06_Lower/01_Child.md',
  ]
  const content = concatenateFiles(files, () => '### x.x.x My content', ROOT)
  const html = h.renderBody(content, false)
  const hs = headings(html)
  assert.strictEqual(hs.length, 3)
  assert.deepStrictEqual(hs[0], { level: 1, text: '1 Top' })
  assert.deepStrictEqual(hs[1], { level: 2, text: '1.6 Lower' })
  assert.strictEqual(hs[2].text, '1.6.1 My content')
})

test('does not duplicate folder heading when 00 file provides it', () => {
  const { concatenateFiles } = require('../../../lib/common/specProcessor')
  const h = new Md2Html({ specRootPath: ROOT })
  const files = [
    'c:/spec/01_Top/06_Lower/00_Heading.md',
    'c:/spec/01_Top/06_Lower/01_Child.md',
  ]
  const readFile = (f) => {
    if (f.includes('00_Heading')) return '## x.x'
    return '### x.x.x'
  }
  const content = concatenateFiles(files, readFile, ROOT)
  const html = h.renderBody(content, false)
  const hs = headings(html)
  // 01_Top folder heading auto-generated, 06_Lower NOT (covered by 00_Heading)
  assert.deepStrictEqual(hs[0], { level: 1, text: '1 Top' })
  assert.strictEqual(hs[1].text, '1.6 Heading')
  assert.strictEqual(hs[2].text, '1.6.1 Child')
})

test('folder headings emitted only once across multiple files in same folder', () => {
  const { concatenateFiles } = require('../../../lib/common/specProcessor')
  const h = new Md2Html({ specRootPath: ROOT })
  const files = [
    'c:/spec/05_Arch/01_Overview.md',
    'c:/spec/05_Arch/02_Components.md',
  ]
  const readFile = (f) => {
    if (f.includes('01_')) return '## x.x Overview'
    return '## x.x Components'
  }
  const content = concatenateFiles(files, readFile, ROOT)
  const html = h.renderBody(content, false)
  const hs = headings(html)
  // Folder heading for 05_Arch emitted once before first file
  assert.deepStrictEqual(hs[0], { level: 1, text: '5 Arch' })
  assert.strictEqual(hs[1].text, '5.1 Overview')
  assert.strictEqual(hs[2].text, '5.2 Components')
})

test('folder headings for multiple top-level folders', () => {
  const { concatenateFiles } = require('../../../lib/common/specProcessor')
  const h = new Md2Html({ specRootPath: ROOT })
  const files = [
    'c:/spec/01_Intro/01_Scope.md',
    'c:/spec/05_Arch/01_Overview.md',
  ]
  const readFile = () => '## x.x'
  const content = concatenateFiles(files, readFile, ROOT)
  const html = h.renderBody(content, false)
  const hs = headings(html)
  assert.deepStrictEqual(hs[0], { level: 1, text: '1 Intro' })
  assert.strictEqual(hs[1].text, '1.1 Scope')
  assert.deepStrictEqual(hs[2], { level: 1, text: '5 Arch' })
  assert.strictEqual(hs[3].text, '5.1 Overview')
})

test('no folder headings when specRootPath is empty', () => {
  const { concatenateFiles } = require('../../../lib/common/specProcessor')
  const h = new Md2Html({})
  const files = [
    'c:/spec/01_Top/06_Lower/01_Child.md',
  ]
  const content = concatenateFiles(files, () => '### x.x.x My content', '')
  const html = h.renderBody(content, false)
  const hs = headings(html)
  assert.strictEqual(hs.length, 1)
  assert.strictEqual(hs[0].text, 'x.x.x My content')
})

test('no folder heading for root-level files (derivedLevel 1)', () => {
  const { concatenateFiles } = require('../../../lib/common/specProcessor')
  const h = new Md2Html({ specRootPath: ROOT })
  const files = [
    'c:/spec/01_Introduction.md',
  ]
  const content = concatenateFiles(files, () => '# x', ROOT)
  const html = h.renderBody(content, false)
  const hs = headings(html)
  // File is directly in spec root — no intermediate folders to generate headings for
  assert.strictEqual(hs.length, 1)
  assert.strictEqual(hs[0].text, '1 Introduction')
})

// ── Summary ──

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
