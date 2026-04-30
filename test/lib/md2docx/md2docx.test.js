const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const JSZip = require('jszip')
const { MarkdownToDocxConverter } = require('../../../lib/md2docx/md2docx')

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

/**
 * Converts markdown to DOCX and returns the parsed document.xml content.
 */
async function mdToDocXml(md) {
  const converter = new MarkdownToDocxConverter(null, '')
  const tmp = os.tmpdir()
  const ts = Date.now() + '_' + Math.random().toString(36).slice(2)
  const mdPath = path.join(tmp, `.~docx_test_${ts}.md`)
  const docxPath = path.join(tmp, `.~docx_test_${ts}.docx`)
  fs.writeFileSync(mdPath, md)
  try {
    await converter.convert(mdPath, docxPath, tmp)
    const buf = fs.readFileSync(docxPath)
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml').async('string')
    return { xml, zip, converter }
  } finally {
    if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath)
    if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath)
  }
}

/** Returns all paragraph style IDs found in the document XML. */
function findStyles(xml) {
  const re = /w:pStyle w:val="([^"]+)"/g
  const styles = []
  let m
  while ((m = re.exec(xml)) !== null) styles.push(m[1])
  return styles
}

/** Returns all text content from w:t elements. */
function findTexts(xml) {
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g
  const texts = []
  let m
  while ((m = re.exec(xml)) !== null) texts.push(m[1])
  return texts
}

async function run() {
  // ── Headings ──────────────────────────────────────────────────

  console.log('headings')

  await test('h1 gets Heading1 style', async () => {
    const { xml } = await mdToDocXml('# Top Level Heading\n')
    assert.ok(findStyles(xml).includes('Heading1'))
    assert.ok(findTexts(xml).some(t => t.includes('Top Level Heading')), 'unnumbered heading text should not be split')
  })

  await test('h2 gets Heading2 style', async () => {
    const { xml } = await mdToDocXml('## Second Level\n')
    assert.ok(findStyles(xml).includes('Heading2'))
  })

  await test('h3 gets Heading3 style', async () => {
    const { xml } = await mdToDocXml('### Third Level\n')
    assert.ok(findStyles(xml).includes('Heading3'))
  })

  await test('h4-h6 get corresponding heading styles', async () => {
    const { xml } = await mdToDocXml('#### H4\n\n##### H5\n\n###### H6\n')
    const styles = findStyles(xml)
    assert.ok(styles.includes('Heading4'))
    assert.ok(styles.includes('Heading5'))
    assert.ok(styles.includes('Heading6'))
  })

  await test('numbered heading inserts tab between number and name', async () => {
    const { xml } = await mdToDocXml('## 1.1 Introduction\n')
    assert.ok(findTexts(xml).some(t => t.includes('1.1\tIntroduction')), 'should have tab between number and name')
  })

  await test('unnumbered heading does not get tab inserted', async () => {
    const { xml } = await mdToDocXml('## Introduction\n')
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('Introduction')))
    assert.ok(!texts.some(t => t.includes('\t')), 'no tab in unnumbered heading')
  })

  await test('Annex heading gets Heading8 style', async () => {
    const { xml } = await mdToDocXml('# Annex A: Supplementary info\n')
    assert.ok(findStyles(xml).includes('Heading8'))
    assert.ok(findTexts(xml).some(t => t.includes('Annex A:')))
  })

  // ── Paragraphs ────────────────────────────────────────────────

  console.log('\nparagraphs')

  await test('regular paragraph has no explicit style (Normal default)', async () => {
    const { xml } = await mdToDocXml('Just a regular paragraph.\n')
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('Just a regular paragraph')))
  })

  await test('NOTE paragraph gets NO style with colon-tab', async () => {
    const { xml } = await mdToDocXml('NOTE: This is important.\n')
    assert.ok(findStyles(xml).includes('NO'))
    assert.ok(findTexts(xml).some(t => t.includes('NOTE:\t')), 'should replace ": " with ":\\t"')
  })

  await test('NOTE 2: numbered note gets NO style', async () => {
    const { xml } = await mdToDocXml('NOTE 2: Second note.\n')
    assert.ok(findStyles(xml).includes('NO'))
  })

  await test('Editor\'s Note gets EN style in red', async () => {
    const { xml } = await mdToDocXml("Editor's Note: Fix this later.\n")
    assert.ok(findStyles(xml).includes('EN'))
    assert.ok(xml.includes('FF0000'), 'should have red color')
  })

  await test('EXAMPLE gets EX style with colon-tab', async () => {
    const { xml } = await mdToDocXml('EXAMPLE: A sample.\n')
    assert.ok(findStyles(xml).includes('EX'))
    assert.ok(findTexts(xml).some(t => t.includes('EXAMPLE:\t')))
  })

  // ── Bullet lists ──────────────────────────────────────────────

  console.log('\nbullet lists')

  await test('unordered list item gets B1 style', async () => {
    const { xml } = await mdToDocXml('- 1> First item\n')
    assert.ok(findStyles(xml).includes('B1'))
    assert.ok(findTexts(xml).some(t => t.includes('1&gt;\t')), 'bullet should be followed by tab')
  })

  await test('nested bullet gets B2 style', async () => {
    const { xml } = await mdToDocXml('- 1> Outer\n  - 2> Inner\n')
    const styles = findStyles(xml)
    assert.ok(styles.includes('B1'))
    assert.ok(styles.includes('B2'))
  })

  await test('default dash bullet is preserved', async () => {
    const { xml } = await mdToDocXml('- Plain dash item\n')
    assert.ok(findStyles(xml).includes('B1'))
    assert.ok(findTexts(xml).some(t => t.includes('-\t')))
  })

  // ── Code blocks ───────────────────────────────────────────────

  console.log('\ncode blocks')

  await test('fenced code block gets PL style', async () => {
    const { xml } = await mdToDocXml('```\nsome code\n```\n')
    assert.ok(findStyles(xml).includes('PL'))
    assert.ok(findTexts(xml).some(t => t.includes('some code')))
  })

  await test('fenced code block with language gets PL style', async () => {
    const { xml } = await mdToDocXml('```powershell\ngit status\ngit log\n```\n')
    const styles = findStyles(xml)
    const plCount = styles.filter(s => s === 'PL').length
    assert.ok(plCount >= 2, 'each line should be a PL paragraph')
    assert.ok(findTexts(xml).some(t => t.includes('git status')))
    assert.ok(findTexts(xml).some(t => t.includes('git log')))
  })

  await test('ASN.1 code block gets PL style with syntax coloring', async () => {
    const { xml } = await mdToDocXml('```asn\nMyModule DEFINITIONS ::= BEGIN\n  IMPORTS\n  ;\nEND\n```\n')
    assert.ok(findStyles(xml).includes('PL'))
    assert.ok(findTexts(xml).some(t => t.includes('MyModule')))
  })

  // ── Tables ────────────────────────────────────────────────────

  console.log('\ntables')

  await test('table header cells get TAH style', async () => {
    const { xml } = await mdToDocXml('| Col A | Col B |\n|---|---|\n| val1 | val2 |\n')
    assert.ok(findStyles(xml).includes('TAH'))
  })

  await test('table body cells get TAL style by default', async () => {
    const { xml } = await mdToDocXml('| A |\n|---|\n| value |\n')
    assert.ok(findStyles(xml).includes('TAL'))
  })

  await test('right-aligned column gets TAR style', async () => {
    const { xml } = await mdToDocXml('| A |\n|---:|\n| 42 |\n')
    assert.ok(findStyles(xml).includes('TAR'))
  })

  await test('center-aligned column gets TAC style', async () => {
    const { xml } = await mdToDocXml('| A |\n|:---:|\n| mid |\n')
    assert.ok(findStyles(xml).includes('TAC'))
  })

  await test('NOTE inside table cell gets TAN style', async () => {
    const { xml } = await mdToDocXml('| A | B |\n|---|---|\n| NOTE 1: A table note | val |\n')
    assert.ok(findStyles(xml).includes('TAN'))
    assert.ok(findTexts(xml).some(t => t.includes('NOTE 1:\t')), 'should replace ": " with ":\\t"')
  })

  await test('NOTE: (without number) inside table gets TAN style', async () => {
    const { xml } = await mdToDocXml('| A |\n|---|\n| NOTE: Simple note |\n')
    assert.ok(findStyles(xml).includes('TAN'))
  })

  // ── Captions ──────────────────────────────────────────────────

  console.log('\ncaptions')

  await test('table caption gets TH style', async () => {
    const { xml } = await mdToDocXml('Table 1-1: My table\n\n| A |\n|---|\n| v |\n')
    assert.ok(findStyles(xml).includes('TH'))
    assert.ok(findTexts(xml).some(t => t.includes('Table 1-1:')))
  })

  await test('figure caption after fence gets TF style', async () => {
    const { xml } = await mdToDocXml('```\ndiagram\n```\n\nFigure 1-1: My figure\n')
    assert.ok(findStyles(xml).includes('TF'))
    assert.ok(findTexts(xml).some(t => t.includes('Figure 1-1:')))
  })

  // ── Display math ──────────────────────────────────────────────

  console.log('\ndisplay math')

  await test('display math gets EQ style', async () => {
    const { xml } = await mdToDocXml('$$E = mc^2$$\n')
    assert.ok(findStyles(xml).includes('EQ'))
  })

  // ── Multiple elements ─────────────────────────────────────────

  console.log('\ncombined document')

  await test('full document with mixed elements produces correct styles', async () => {
    const md = [
      '# 1 Introduction',
      '',
      'A paragraph of text.',
      '',
      'NOTE: An informative note.',
      '',
      'EXAMPLE: A practical example.',
      '',
      '- 1> First bullet',
      '  - 2> Nested bullet',
      '',
      '```',
      'code line 1',
      'code line 2',
      '```',
      '',
      'Table 1-1: Sample',
      '',
      '| Header |',
      '|--------|',
      '| NOTE: In-table note |',
      '',
      '$$x^2 + y^2 = z^2$$',
      '',
      '# Annex A: Extra',
      '',
    ].join('\n')
    const { xml } = await mdToDocXml(md)
    const styles = findStyles(xml)
    const unique = [...new Set(styles)]
    assert.ok(unique.includes('Heading1'), 'should have Heading1')
    assert.ok(unique.includes('Heading8'), 'should have Heading8 for Annex')
    assert.ok(unique.includes('NO'), 'should have NO for NOTE')
    assert.ok(unique.includes('EX'), 'should have EX for EXAMPLE')
    assert.ok(unique.includes('B1'), 'should have B1')
    assert.ok(unique.includes('B2'), 'should have B2')
    assert.ok(unique.includes('PL'), 'should have PL for code')
    assert.ok(unique.includes('TH'), 'should have TH for table caption')
    assert.ok(unique.includes('TAH'), 'should have TAH for table header')
    assert.ok(unique.includes('TAN'), 'should have TAN for table note')
    assert.ok(unique.includes('EQ'), 'should have EQ for equation')
  })

  // ── Italic/bold text interactions ─────────────────────────────

  console.log('\nitalic and bold text interactions')

  await test('NOTE with italic content gets NO style', async () => {
    const { xml } = await mdToDocXml('NOTE: *italic* content\n')
    assert.ok(findStyles(xml).includes('NO'))
  })

  await test('NOTE with italic content has colon-tab', async () => {
    const { xml } = await mdToDocXml('NOTE: *italic* content\n')
    assert.ok(xml.includes('NOTE:\t'), 'colon-tab should be applied before italic content')
  })

  await test('NOTE with italic at end gets NO style', async () => {
    const { xml } = await mdToDocXml('NOTE: text ending in *italic*\n')
    assert.ok(findStyles(xml).includes('NO'))
    assert.ok(xml.includes('NOTE:\t'))
  })

  await test('EXAMPLE with italic content gets EX style', async () => {
    const { xml } = await mdToDocXml('EXAMPLE: *italic* example\n')
    assert.ok(findStyles(xml).includes('EX'))
    assert.ok(xml.includes('EXAMPLE:\t'))
  })

  await test('bullet with italic content after prefix gets B1 style', async () => {
    const { xml } = await mdToDocXml('- 1> *italic* rest\n')
    assert.ok(findStyles(xml).includes('B1'))
    assert.ok(xml.includes('1&gt;\t'), 'bullet prefix should be followed by tab')
  })

  await test('bullet starting with italic falls back to default bullet', async () => {
    const { xml } = await mdToDocXml('- *italic* start\n')
    assert.ok(findStyles(xml).includes('B1'))
    assert.ok(xml.includes('-\t'), 'should use default bullet with tab')
  })

  await test('heading with italic content gets correct style', async () => {
    const { xml } = await mdToDocXml('## *Italic* Heading\n')
    assert.ok(findStyles(xml).includes('Heading2'))
    assert.ok(findTexts(xml).some(t => t.includes('Italic')))
  })

  await test('numbered heading with italic name gets tab after number', async () => {
    const { xml } = await mdToDocXml('## 1.1 *Italic* Name\n')
    assert.ok(findStyles(xml).includes('Heading2'))
    assert.ok(xml.includes('1.1\t'), 'tab should follow section number')
  })

  await test('NOTE inside table with italic content gets TAN style', async () => {
    const { xml } = await mdToDocXml('| A |\n|---|\n| NOTE: *italic* cell |\n')
    assert.ok(findStyles(xml).includes('TAN'))
    assert.ok(xml.includes('NOTE:\t'))
  })

  // ── Hyperlinks ────────────────────────────────────────────────

  console.log('\nhyperlinks')

  await test('external link produces w:hyperlink element', async () => {
    const { xml } = await mdToDocXml('See [example](https://example.com) here.\n')
    assert.ok(xml.includes('w:hyperlink'), 'should contain hyperlink element')
  })

  await test('link URL appears in relationships file', async () => {
    const { zip } = await mdToDocXml('Visit [site](https://example.com).\n')
    const rels = await zip.file('word/_rels/document.xml.rels').async('string')
    assert.ok(rels.includes('example.com'), 'rels should contain the URL')
  })

  await test('link text is preserved in document', async () => {
    const { xml } = await mdToDocXml('Click [here](https://example.com) now.\n')
    assert.ok(findTexts(xml).some(t => t.includes('here')), 'link text should be in document')
  })

  await test('link run has Hyperlink character style', async () => {
    const { xml } = await mdToDocXml('[link](https://example.com)\n')
    assert.ok(xml.includes('Hyperlink'), 'run should reference Hyperlink style')
  })

  await test('Hyperlink style is defined in styles.xml', async () => {
    const { zip } = await mdToDocXml('[link](https://example.com)\n')
    const stylesXml = await zip.file('word/styles.xml').async('string')
    assert.ok(stylesXml.includes('Hyperlink'), 'styles.xml should define Hyperlink style')
    assert.ok(stylesXml.includes('0563C1'), 'Hyperlink style should have blue color')
  })

  await test('link with bold text inside', async () => {
    const { xml } = await mdToDocXml('See [**bold link**](https://example.com).\n')
    assert.ok(xml.includes('w:hyperlink'))
    assert.ok(findTexts(xml).some(t => t.includes('bold link')))
  })

  await test('link with italic text inside', async () => {
    const { xml } = await mdToDocXml('See [*italic link*](https://example.com).\n')
    assert.ok(xml.includes('w:hyperlink'))
    assert.ok(findTexts(xml).some(t => t.includes('italic link')))
  })

  await test('multiple links in one paragraph', async () => {
    const { xml, zip } = await mdToDocXml('See [one](https://one.com) and [two](https://two.com).\n')
    const rels = await zip.file('word/_rels/document.xml.rels').async('string')
    assert.ok(rels.includes('one.com'))
    assert.ok(rels.includes('two.com'))
  })

  // ── ASN.1 comment bold/italic ───────────────────────────────

  console.log('\nASN.1 comment formatting')

  await test('ASN comment with *italic* renders italic in DOCX', async () => {
    const { xml } = await mdToDocXml('```asn\n-- This is *italic* text\n```\n')
    assert.ok(xml.includes('italic'), 'should contain italic text')
    assert.ok(xml.includes('w:i/') || xml.includes('w:i '), 'should have italic run property')
  })

  await test('ASN comment with **bold** renders bold in DOCX', async () => {
    const { xml } = await mdToDocXml('```asn\n-- This is **bold** text\n```\n')
    assert.ok(xml.includes('bold'), 'should contain bold text')
    assert.ok(xml.includes('w:b/') || xml.includes('w:b '), 'should have bold run property')
  })

  await test('ASN comment with nested *italic **bold*** renders correctly', async () => {
    const { xml } = await mdToDocXml('```asn\n-- *italic **nested*** end\n```\n')
    assert.ok(xml.includes('italic'), 'should contain italic text')
    assert.ok(xml.includes('nested'), 'should contain nested text')
  })

  await test('ASN comment preserves green color for formatted text', async () => {
    const { xml } = await mdToDocXml('```asn\n-- *italic* text\n```\n')
    assert.ok(xml.includes('81B16B'), 'should have green comment color')
  })

  await test('ASN comment with no formatting renders plain', async () => {
    const { xml } = await mdToDocXml('```asn\n-- plain comment\n```\n')
    assert.ok(xml.includes('plain comment'), 'should contain plain text')
    assert.ok(xml.includes('81B16B'), 'should have green color')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()

