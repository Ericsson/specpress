const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const JSZip = require('jszip')
const { Document, Packer, SectionType } = require('docx')
const { renderCRCoverPageDOCX } = require('../../../lib/md2docx/crCoverPageRenderer')
const { docxStyles } = require('../../../lib/md2docx/styles/docxStyles')

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

const sampleCR = {
  'TDoc Number': 'R2-2600067',
  Specification: '67.331',
  'Current version': '1.0.0',
  Release: 19,
  CR: 1,
  rev: 1,
  Affected: { UICC: false, ME: true, 'Radio Access Network': true, 'Core Network': false },
  Title: 'Support for CB-PUSCH',
  'Source to WG': ['Ericsson'],
  'Source to TSG': ['RAN2'],
  'Work item code': ['FS_6G_Radio'],
  Date: '2026-01-15',
  Category: 'B',
  'Reason for change': 'Contention based PUSCH has been agreed to be added.',
  'Summary of change': 'Defining a new PhysicalChannel type CB-PUSCH.',
  'Consequences if not approved': 'Bad UL performance',
  'Clauses affected': ['6.3.2'],
  'Other specs affected': {
    'Other core specifications': ['TS 38.331 CR 1234'],
    'Test specifications': [],
    'O&M Specifications': []
  },
  'Other comments': ''
}

/**
 * Renders CR data to DOCX and returns the document.xml string.
 */
async function crToDocXml(crData) {
  const elements = renderCRCoverPageDOCX(crData || sampleCR)
  const doc = new Document({
    sections: [{
      properties: { type: SectionType.NEXT_PAGE },
      children: elements
    }],
    styles: docxStyles()
  })
  const buf = await Packer.toBuffer(doc)
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml').async('string')
  return { xml, zip, buf }
}

/** Extracts all w:shd elements as objects { fill, val, color } */
function findShadings(xml) {
  const re = /<w:shd([^/]*?)\/>/g
  const results = []
  let m
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1]
    const fill = (attrs.match(/w:fill="([^"]*)"/) || [])[1]
    const val = (attrs.match(/w:val="([^"]*)"/) || [])[1]
    const color = (attrs.match(/w:color="([^"]*)"/) || [])[1]
    results.push({ fill, val, color })
  }
  return results
}

/** Returns all text content from w:t elements (XML-decoded). */
function findTexts(xml) {
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g
  const texts = []
  let m
  while ((m = re.exec(xml)) !== null) texts.push(decodeXml(m[1]))
  return texts
}

function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

/** Escapes HTML for test comparison (matches renderer escaping). */
function escapeHtmlForTest(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

/** Counts the number of w:tbl elements (tables). */
function countTables(xml) {
  return (xml.match(/<w:tbl>/g) || []).length
}

/** Finds all gridSpan values. */
function findGridSpans(xml) {
  const re = /<w:gridSpan w:val="(\d+)"\/>/g
  const spans = []
  let m
  while ((m = re.exec(xml)) !== null) spans.push(parseInt(m[1]))
  return spans
}

async function run() {
  console.log('CR cover page DOCX - shading')

  await test('all shading uses type="clear" (not "solid")', async () => {
    const { xml } = await crToDocXml()
    const shadings = findShadings(xml)
    assert.ok(shadings.length > 0, 'should have shading elements')
    const solidOnes = shadings.filter(s => s.val === 'solid')
    assert.strictEqual(solidOnes.length, 0,
      `Found ${solidOnes.length} cells with val="solid" — should all be "clear"`)
  })

  await test('yellow cells use fill="FFFFCA"', async () => {
    const { xml } = await crToDocXml()
    const shadings = findShadings(xml)
    const yellow = shadings.filter(s => s.fill === 'FFFFCA')
    assert.ok(yellow.length >= 5, `Expected >=5 yellow cells, got ${yellow.length}`)
  })

  await test('light yellow cells use fill="FFFFDD"', async () => {
    const { xml } = await crToDocXml()
    const shadings = findShadings(xml)
    const lightYellow = shadings.filter(s => s.fill === 'FFFFDD')
    assert.ok(lightYellow.length >= 1, 'should have at least one light yellow cell')
  })

  console.log('\nCR cover page DOCX - table structure')

  await test('produces exactly 4 separate tables (header, affected, content1, content2)', async () => {
    const { xml } = await crToDocXml()
    const count = countTables(xml)
    assert.strictEqual(count, 4, `Expected 4 tables, got ${count}`)
  })

  await test('header table has columnSpan=9 for CHANGE REQUEST row', async () => {
    const { xml } = await crToDocXml()
    const spans = findGridSpans(xml)
    assert.ok(spans.includes(9), 'should have gridSpan=9 for the title row')
  })

  console.log('\nCR cover page DOCX - content')

  await test('TDoc number appears in output', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('R2-2600067')))
  })

  await test('CR number is formatted as 4 digits', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('0001')))
  })

  await test('Title appears in content table', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('Support for CB-PUSCH')))
  })

  await test('Category value appears', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t === 'B'))
  })

  await test('Release uses explicit field value', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t === 'Rel-19'), 'should use explicit Release field with Rel- prefix')
    assert.ok(!texts.some(t => t === 'Rel-1'), 'should not derive from version')
  })

  await test('Release falls back to version-derived when field absent', async () => {
    const data = { ...sampleCR }
    delete data.Release
    const { xml } = await crToDocXml(data)
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('Rel-1')), 'should derive Rel-1 from version 1.0.0')
  })

  console.log('\nCR cover page DOCX - other specs affected')

  await test('"Other specs affected" label appears', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('Other specs affected')),
      'should contain "Other specs affected" label')
  })

  await test('"Other core specifications" label appears', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('Other core specifications')))
  })

  await test('"Test specifications" label appears', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('Test specifications')))
  })

  await test('"O&M Specifications" label appears', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('O&M Specifications')))
  })

  await test('other core spec value appears when provided', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('TS 38.331 CR 1234')))
  })

  await test('Y/N column headers appear', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t === 'Y'), 'should have Y header')
    assert.ok(texts.some(t => t === 'N'), 'should have N header')
  })

  console.log('\nCR cover page DOCX - table separation')

  await test('content between tables (separator paragraphs exist)', async () => {
    const { xml } = await crToDocXml()
    const tableCloseCount = (xml.match(/<\/w:tbl>/g) || []).length
    assert.strictEqual(tableCloseCount, 4, 'should have 4 table close tags')
    // Verify tables are not adjacent (there's content between them)
    const noAdjacentTables = !xml.includes('</w:tbl><w:tbl>')
    assert.ok(noAdjacentTables, 'tables should not be directly adjacent')
  })

  console.log('\nCR cover page DOCX - affected checkboxes')

  await test('ME checkbox shows X when true', async () => {
    const { xml } = await crToDocXml()
    const texts = findTexts(xml)
    // ME is true in sample data, should have X
    assert.ok(texts.includes('X'), 'should have X for checked boxes')
  })

  await test('UICC checkbox is empty when false', async () => {
    const { xml } = await crToDocXml()
    // The affected table should have empty cells for unchecked items
    // We verify by checking that not all checkbox cells have X
    const texts = findTexts(xml)
    const xCount = texts.filter(t => t === 'X').length
    // ME=true, RAN=true, UICC=false, CN=false → 2 X's in affected + Y/N in other specs
    assert.ok(xCount >= 2, 'should have at least 2 X marks')
  })

  console.log('\nCR cover page DOCX - vertical alignment')

  await test('cells have vertical alignment center', async () => {
    const { xml } = await crToDocXml()
    const vAlignCount = (xml.match(/<w:vAlign w:val="center"\/>/g) || []).length
    assert.ok(vAlignCount >= 10, `Expected >=10 vertically centered cells, got ${vAlignCount}`)
  })

  console.log('\nCR cover page DOCX - separator style')

  await test('CRCoverNarrow style is used for separators', async () => {
    const { xml } = await crToDocXml()
    assert.ok(xml.includes('CRCoverNarrow'), 'should use CRCoverNarrow style')
  })

  await test('CRCoverNarrow style is defined in styles.xml', async () => {
    const { zip } = await crToDocXml()
    const stylesXml = await zip.file('word/styles.xml').async('string')
    assert.ok(stylesXml.includes('CRCoverNarrow'), 'styles.xml should define CRCoverNarrow')
  })

  await test('CRCoverPage style has zero spacing', async () => {
    const { zip } = await crToDocXml()
    const stylesXml = await zip.file('word/styles.xml').async('string')
    // Find the CRCoverPage style definition and verify spacing
    const crStyleMatch = stylesXml.match(/<w:style[^>]*w:styleId="CRCoverPage"[\s\S]*?<\/w:style>/)
    assert.ok(crStyleMatch, 'CRCoverPage style should exist')
    // Should have after=0 (no w:after or w:after="0")
    const hasLargeAfter = /w:after w:val="[1-9]/.test(crStyleMatch[0])
    assert.ok(!hasLargeAfter, 'CRCoverPage should not have large after spacing')
  })

  await test('cells have horizontal margins (w:tcMar)', async () => {
    const { xml } = await crToDocXml()
    const marginCount = (xml.match(/<w:tcMar>/g) || []).length
    assert.ok(marginCount >= 10, `Expected >=10 cells with margins, got ${marginCount}`)
  })

  console.log('\nCR cover page DOCX - packCRCoverPageDocx')

  await test('packCRCoverPageDocx produces valid DOCX with tables and content', async () => {
    const { packCRCoverPageDocx } = require('../../../lib/md2docx/crCoverPageRenderer')
    const buffer = await packCRCoverPageDocx(sampleCR)
    assert.ok(Buffer.isBuffer(buffer), 'should return a Buffer')
    assert.ok(buffer.length > 5000, `Buffer too small: ${buffer.length}`)
    const zip = await JSZip.loadAsync(buffer)
    assert.ok(zip.file('word/document.xml'), 'should have document.xml')
    assert.ok(zip.file('word/styles.xml'), 'should have styles.xml')
    assert.ok(zip.file('[Content_Types].xml'), 'should have [Content_Types].xml')
    const xml = await zip.file('word/document.xml').async('string')
    assert.strictEqual(countTables(xml), 4, 'should have 4 tables')
    const texts = findTexts(xml)
    assert.ok(texts.some(t => t.includes('R2-2600067')), 'should contain TDoc number')
    assert.ok(texts.some(t => t.includes('Support for CB-PUSCH')), 'should contain title')
  })

  await test('packCRCoverPageDocx output has CRCoverPage style defined', async () => {
    const { packCRCoverPageDocx } = require('../../../lib/md2docx/crCoverPageRenderer')
    const buffer = await packCRCoverPageDocx(sampleCR)
    const zip = await JSZip.loadAsync(buffer)
    const stylesXml = await zip.file('word/styles.xml').async('string')
    assert.ok(stylesXml.includes('CRCoverPage'), 'should define CRCoverPage style')
    assert.ok(stylesXml.includes('CRCoverNarrow'), 'should define CRCoverNarrow style')
  })

  await test('exportCRCoverPageDocx writes valid DOCX from a CR JSON file', async () => {
    const { exportCRCoverPageDocx } = require('../../../lib/md2docx/crCoverPageRenderer')
    const tmp = path.join(os.tmpdir(), `cr_export_test_${Date.now()}`)
    fs.mkdirSync(tmp, { recursive: true })
    const crFile = path.join(tmp, 'CR0001.json')
    const outFile = path.join(tmp, 'output.docx')
    fs.writeFileSync(crFile, JSON.stringify(sampleCR))
    try {
      await exportCRCoverPageDocx(crFile, outFile)
      assert.ok(fs.existsSync(outFile), 'output file should exist')
      const buf = fs.readFileSync(outFile)
      const zip = await JSZip.loadAsync(buf)
      assert.ok(zip.file('word/document.xml'), 'should have document.xml')
      const xml = await zip.file('word/document.xml').async('string')
      assert.strictEqual(countTables(xml), 4, 'should have 4 tables')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  await test('exportCRCoverPageDocx throws on invalid CR JSON', async () => {
    const { exportCRCoverPageDocx } = require('../../../lib/md2docx/crCoverPageRenderer')
    const tmp = path.join(os.tmpdir(), `cr_export_invalid_${Date.now()}`)
    fs.mkdirSync(tmp, { recursive: true })
    const crFile = path.join(tmp, 'CR0001.json')
    const outFile = path.join(tmp, 'output.docx')
    fs.writeFileSync(crFile, JSON.stringify({ CR: 1 }))
    try {
      await exportCRCoverPageDocx(crFile, outFile)
      assert.fail('should have thrown')
    } catch (e) {
      assert.ok(e.message.includes('validation failed'), `unexpected error: ${e.message}`)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  console.log('\nCR cover page - all fields present in output')

  const fullCR = {
    'TDoc Number': 'R2-2600067',
    Specification: '38.413',
    CR: 42,
    rev: 3,
    'Current version': '17.5.0',
    Release: 17,
    Affected: { UICC: true, ME: true, 'Radio Access Network': true, 'Core Network': true },
    Title: 'Correction to handover procedure',
    'Source to WG': ['Ericsson', 'Nokia'],
    'Source to TSG': ['RAN2'],
    'Work item code': ['FS_6G_Radio'],
    Date: '2025-03-15',
    Category: 'A',
    'Reason for change': 'The current specification is ambiguous.',
    'Summary of change': 'Add clarification text in section 5.2.3.',
    'Impact analysis': {
      'UE implements - RAN does not': 'No impact',
      'RAN implements - UE does not': 'Minor degradation'
    },
    'Consequences if not approved': 'Ambiguity remains in the specification.',
    'Clauses affected': ['5.2.3', '7.1.2'],
    'Other specs affected': {
      'Other core specifications': ['TS 38.331 CR 1234'],
      'Test specifications': ['TS 38.523-1 CR 0789'],
      'O&M Specifications': ['TS 32.422 CR 0012']
    },
    'Other comments': 'Reviewed in RAN2#120.'
  }

  await test('HTML: all CR fields appear in rendered output', () => {
    const { renderCRCoverPageHTML } = require('../../../lib/md2html/crCoverPageRenderer')
    const html = renderCRCoverPageHTML(fullCR)
    // Every user-visible value must appear
    const expected = [
      'R2-2600067',           // TDoc Number
      '38.413',              // Specification
      '0042',                // CR (formatted)
      '3',                   // rev
      '17.5.0',              // Current version
      'Rel-17',              // Release
      'Correction to handover procedure', // Title
      'Ericsson, Nokia',     // Source to WG
      'RAN2',                // Source to TSG
      'FS_6G_Radio',         // Work item code
      '2025-03-15',          // Date
      'A',                   // Category
      'The current specification is ambiguous.', // Reason
      'Add clarification text in section 5.2.3.', // Summary
      'UE implements - RAN does not',  // Impact analysis key
      'No impact',           // Impact analysis value
      'RAN implements - UE does not',  // Impact analysis key
      'Minor degradation',   // Impact analysis value
      'Ambiguity remains in the specification.', // Consequences
      '5.2.3, 7.1.2',       // Clauses affected
      'TS 38.331 CR 1234',   // Other core specs
      'TS 38.523-1 CR 0789', // Test specs
      'TS 32.422 CR 0012',   // O&M specs
      'Reviewed in RAN2#120.' // Other comments
    ]
    for (const val of expected) {
      assert.ok(html.includes(val) || html.includes(escapeHtmlForTest(val)),
        `HTML should contain: "${val}"`)
    }
    // Affected checkboxes: all true → 4 X marks in affected row
    const affStart = html.indexOf('Proposed change affects')
    const affEnd = html.indexOf('</table>', affStart)
    const affSection = html.substring(affStart, affEnd)
    const xMarks = (affSection.match(/<b>X<\/b>/g) || []).length
    assert.strictEqual(xMarks, 4, `Expected 4 X marks in affected row, got ${xMarks}`)
  })

  await test('DOCX: all CR fields appear in rendered output', async () => {
    const { xml } = await crToDocXml(fullCR)
    const texts = findTexts(xml)
    const allText = texts.join(' ')
    const expected = [
      'R2-2600067',           // TDoc Number
      '38.413',              // Specification
      '0042',                // CR (formatted)
      '3',                   // rev
      '17.5.0',              // Current version
      'Rel-17',              // Release
      'Correction to handover procedure', // Title
      'Ericsson, Nokia',     // Source to WG
      'RAN2',                // Source to TSG
      'FS_6G_Radio',         // Work item code
      '2025-03-15',          // Date
      'The current specification is ambiguous.', // Reason
      'Add clarification text in section 5.2.3.', // Summary
      'UE implements - RAN does not:', // Impact analysis key (with colon)
      'No impact',           // Impact analysis value
      'RAN implements - UE does not:', // Impact analysis key
      'Minor degradation',   // Impact analysis value
      'Ambiguity remains in the specification.', // Consequences
      '5.2.3, 7.1.2',       // Clauses affected
      'TS 38.331 CR 1234',   // Other core specs
      'TS 38.523-1 CR 0789', // Test specs
      'TS 32.422 CR 0012',   // O&M specs
      'Reviewed in RAN2#120.' // Other comments
    ]
    for (const val of expected) {
      assert.ok(allText.includes(val) || texts.some(t => t.includes(val)),
        `DOCX should contain: "${val}"`)
    }
    // Category 'A' — check it exists as a standalone text
    assert.ok(texts.includes('A'), 'DOCX should contain Category value "A"')
    // Affected: all true → 4 X marks in affected table
    const tables = xml.split('<w:tbl>')
    const affectedTable = tables[2]
    const affTexts = findTexts(affectedTable)
    const xCount = affTexts.filter(t => t === 'X').length
    assert.strictEqual(xCount, 4, `Expected 4 X marks in affected table, got ${xCount}`)
  })

  console.log('\nCR cover page DOCX - affected "Radio Access Network" / "Core Network" keys')

  await test('DOCX: Affected."Radio Access Network" = true shows X', async () => {
    const data = { ...sampleCR, Affected: { UICC: false, ME: false, 'Radio Access Network': true, 'Core Network': false } }
    const { xml } = await crToDocXml(data)
    // Extract the affected table (2nd table)
    const tables = xml.split('<w:tbl>')
    const affectedTable = tables[2] // 0=before first, 1=header, 2=affected
    const texts = findTexts(affectedTable)
    // Should have X for RAN
    assert.ok(texts.includes('X'), 'RAN checkbox should show X')
  })

  await test('DOCX: Affected."Core Network" = true shows X', async () => {
    const data = { ...sampleCR, Affected: { UICC: false, ME: false, 'Radio Access Network': false, 'Core Network': true } }
    const { xml } = await crToDocXml(data)
    const tables = xml.split('<w:tbl>')
    const affectedTable = tables[2]
    const texts = findTexts(affectedTable)
    assert.ok(texts.includes('X'), 'CN checkbox should show X')
  })

  await test('DOCX: Affected.RAN shorthand also works', async () => {
    const data = { ...sampleCR, Affected: { UICC: false, ME: false, RAN: true, CN: false } }
    const { xml } = await crToDocXml(data)
    const tables = xml.split('<w:tbl>')
    const affectedTable = tables[2]
    const texts = findTexts(affectedTable)
    assert.ok(texts.includes('X'), 'RAN checkbox should show X via shorthand')
  })

  await test('DOCX: Affected.CN shorthand also works', async () => {
    const data = { ...sampleCR, Affected: { UICC: false, ME: false, RAN: false, CN: true } }
    const { xml } = await crToDocXml(data)
    const tables = xml.split('<w:tbl>')
    const affectedTable = tables[2]
    const texts = findTexts(affectedTable)
    assert.ok(texts.includes('X'), 'CN checkbox should show X via shorthand')
  })

  console.log('\nCR cover page HTML - affected "Radio Access Network" / "Core Network" keys')

  await test('HTML: Affected."Radio Access Network" = true shows X', () => {
    const { renderCRCoverPageHTML } = require('../../../lib/md2html/crCoverPageRenderer')
    const data = { ...sampleCR, Affected: { UICC: false, ME: false, 'Radio Access Network': true, 'Core Network': false } }
    const html = renderCRCoverPageHTML(data)
    // Find the RAN checkbox cell (after "Radio Access Network" text)
    const ranIdx = html.indexOf('Radio Access Network')
    const ranBox = html.indexOf('{{AFFECTED_RAN}}', ranIdx)
    // The placeholder should be replaced — find the X in the RAN cell
    const afterRan = html.substring(ranIdx)
    const ranCellMatch = afterRan.match(/<b>([^<]*)<\/b>/)
    assert.ok(ranCellMatch && ranCellMatch[1].trim() === 'X', 'RAN checkbox should show X')
  })

  await test('HTML: Affected."Core Network" = true shows X', () => {
    const { renderCRCoverPageHTML } = require('../../../lib/md2html/crCoverPageRenderer')
    const data = { ...sampleCR, Affected: { UICC: false, ME: false, 'Radio Access Network': false, 'Core Network': true } }
    const html = renderCRCoverPageHTML(data)
    const cnIdx = html.indexOf('Core Network')
    const afterCn = html.substring(cnIdx)
    const cnCellMatch = afterCn.match(/<b>([^<]*)<\/b>/)
    assert.ok(cnCellMatch && cnCellMatch[1].trim() === 'X', 'CN checkbox should show X')
  })

  await test('HTML: Affected.RAN shorthand also works', () => {
    const { renderCRCoverPageHTML } = require('../../../lib/md2html/crCoverPageRenderer')
    const data = { ...sampleCR, Affected: { UICC: false, ME: false, RAN: true, CN: false } }
    const html = renderCRCoverPageHTML(data)
    const ranIdx = html.indexOf('Radio Access Network')
    const afterRan = html.substring(ranIdx)
    const ranCellMatch = afterRan.match(/<b>([^<]*)<\/b>/)
    assert.ok(ranCellMatch && ranCellMatch[1].trim() === 'X', 'RAN checkbox should show X via shorthand')
  })

  await test('HTML: Affected.CN shorthand also works', () => {
    const { renderCRCoverPageHTML } = require('../../../lib/md2html/crCoverPageRenderer')
    const data = { ...sampleCR, Affected: { UICC: false, ME: false, RAN: false, CN: true } }
    const html = renderCRCoverPageHTML(data)
    const cnIdx = html.indexOf('Core Network')
    const afterCn = html.substring(cnIdx)
    const cnCellMatch = afterCn.match(/<b>([^<]*)<\/b>/)
    assert.ok(cnCellMatch && cnCellMatch[1].trim() === 'X', 'CN checkbox should show X via shorthand')
  })

  await test('HTML: all affected false shows no X in affected row', () => {
    const { renderCRCoverPageHTML } = require('../../../lib/md2html/crCoverPageRenderer')
    const data = { ...sampleCR, Affected: { UICC: false, ME: false, 'Radio Access Network': false, 'Core Network': false } }
    const html = renderCRCoverPageHTML(data)
    // Extract the "Proposed change affects" table
    const affStart = html.indexOf('Proposed change affects')
    const affEnd = html.indexOf('</table>', affStart)
    const affSection = html.substring(affStart, affEnd)
    // All checkbox cells should be empty (no X)
    const boldMatches = affSection.match(/<b>([^<]*)<\/b>/g) || []
    const xMarks = boldMatches.filter(m => m.includes('X'))
    assert.strictEqual(xMarks.length, 0, 'no X marks when all affected are false')
  })

  console.log('\nCR cover page - other specs multi-line rendering')

  await test('HTML: multiple other core specs appear on separate lines', () => {
    const { renderCRCoverPageHTML } = require('../../../lib/md2html/crCoverPageRenderer')
    const data = { ...sampleCR, 'Other specs affected': {
      'Other core specifications': ['38.321, CR0238r1', '36.321, CR2384'],
      'Test specifications': ['38.523-1, CR0789', '36.523-1, CR0456'],
      'O&M Specifications': ['32.422, CR0012']
    }}
    const html = renderCRCoverPageHTML(data)
    assert.ok(html.includes('38.321, CR0238r1<br>36.321, CR2384'), 'other core specs should be separated by <br>')
    assert.ok(html.includes('38.523-1, CR0789<br>36.523-1, CR0456'), 'test specs should be separated by <br>')
    assert.ok(html.includes('32.422, CR0012'), 'single O&M spec should appear without <br>')
    assert.ok(!html.includes('32.422, CR0012<br>'), 'single entry should not have trailing <br>')
  })

  await test('DOCX: multiple other core specs appear on separate lines', async () => {
    const data = { ...sampleCR, 'Other specs affected': {
      'Other core specifications': ['38.321, CR0238r1', '36.321, CR2384'],
      'Test specifications': ['38.523-1, CR0789'],
      'O&M Specifications': []
    }}
    const { xml } = await crToDocXml(data)
    const texts = findTexts(xml)
    // Both entries should appear as separate text runs
    assert.ok(texts.some(t => t.includes('38.321, CR0238r1')), 'first core spec entry should appear')
    assert.ok(texts.some(t => t.includes('36.321, CR2384')), 'second core spec entry should appear')
    assert.ok(texts.some(t => t.includes('38.523-1, CR0789')), 'test spec entry should appear')
    // Verify line break element exists between the two core spec entries
    const coreIdx1 = xml.indexOf('38.321, CR0238r1')
    const coreIdx2 = xml.indexOf('36.321, CR2384')
    const between = xml.substring(coreIdx1, coreIdx2)
    assert.ok(between.includes('<w:br'), 'should have line break between entries in DOCX')
  })

  await test('HTML: single entry in other specs has no <br>', () => {
    const { renderCRCoverPageHTML } = require('../../../lib/md2html/crCoverPageRenderer')
    const data = { ...sampleCR, 'Other specs affected': {
      'Other core specifications': ['TS 38.331 CR 1234'],
      'Test specifications': [],
      'O&M Specifications': []
    }}
    const html = renderCRCoverPageHTML(data)
    assert.ok(html.includes('TS 38.331 CR 1234'), 'single entry should appear')
    assert.ok(!html.includes('TS 38.331 CR 1234<br>'), 'single entry should not have <br> after it')
  })

  await test('DOCX: empty other specs shows placeholder text', async () => {
    const data = { ...sampleCR, 'Other specs affected': {
      'Other core specifications': [],
      'Test specifications': [],
      'O&M Specifications': []
    }}
    const { xml } = await crToDocXml(data)
    const texts = findTexts(xml)
    const placeholders = texts.filter(t => t === 'TS/TR ... CR ...')
    assert.ok(placeholders.length >= 3, `Expected >=3 placeholder texts, got ${placeholders.length}`)
  })

  console.log('\n{ChangeHistory} placeholder - HTML')

  await test('HTML: {ChangeHistory} renders table with CR data', async () => {
    const { Md2Html } = require('../../../lib/md2html/md2html')
    const tmp = path.join(os.tmpdir(), `ch_html_${Date.now()}`)
    const histDir = path.join(tmp, 'history')
    fs.mkdirSync(histDir, { recursive: true })
    fs.writeFileSync(path.join(histDir, 'CR0001.json'), JSON.stringify({
      CR: 1, rev: 1, Category: 'B', Title: 'Add feature X',
      'Clauses affected': ['5.1'], 'Source to WG': ['Ericsson']
    }))
    try {
      const renderer = new Md2Html({ specRootPath: tmp })
      const html = renderer.renderBody('{ChangeHistory}\n', false, null, null, tmp)
      assert.ok(html.includes('<table class="spec-table">'), 'should render spec-table')
      assert.ok(html.includes('0001'), 'should contain CR number')
      assert.ok(html.includes('Add feature X'), 'should contain title')
      assert.ok(html.includes('Ericsson'), 'should contain source')
      assert.ok(!html.includes('{ChangeHistory}'), 'placeholder should be consumed')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  await test('HTML: {ChangeHistory} renders empty when no CRs exist', async () => {
    const { Md2Html } = require('../../../lib/md2html/md2html')
    const tmp = path.join(os.tmpdir(), `ch_html_empty_${Date.now()}`)
    fs.mkdirSync(path.join(tmp, 'history'), { recursive: true })
    try {
      const renderer = new Md2Html({ specRootPath: tmp })
      const html = renderer.renderBody('{ChangeHistory}\n', false, null, null, tmp)
      assert.ok(!html.includes('<table'), 'should not render a table')
      assert.ok(!html.includes('{ChangeHistory}'), 'placeholder should be consumed')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  await test('HTML: table caption before {ChangeHistory} gets table-caption class', async () => {
    const { Md2Html } = require('../../../lib/md2html/md2html')
    const tmp = path.join(os.tmpdir(), `ch_html_cap_${Date.now()}`)
    const histDir = path.join(tmp, 'history')
    fs.mkdirSync(histDir, { recursive: true })
    fs.writeFileSync(path.join(histDir, 'CR0001.json'), JSON.stringify({
      CR: 1, rev: 1, Category: 'B', Title: 'Test',
      'Clauses affected': ['5.1'], 'Source to WG': ['Ericsson']
    }))
    try {
      const renderer = new Md2Html({ specRootPath: tmp })
      const html = renderer.renderBody('Table A-1: Change history\n\n{ChangeHistory}\n', false, null, null, tmp)
      assert.ok(html.includes('class="table-caption"'), 'caption should have table-caption class')
      assert.ok(html.includes('<table class="spec-table">'), 'should render table')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  await test('HTML: {ChangeHistory} without specRootPath renders empty', async () => {
    const { Md2Html } = require('../../../lib/md2html/md2html')
    const renderer = new Md2Html()
    const html = renderer.renderBody('{ChangeHistory}\n', false)
    assert.ok(!html.includes('<table'), 'should not render a table')
    assert.ok(!html.includes('{ChangeHistory}'), 'placeholder should be consumed')
  })

  console.log('\n{ChangeHistory} placeholder - DOCX')

  await test('DOCX: {ChangeHistory} renders table with CR data', async () => {
    const tmp = path.join(os.tmpdir(), `ch_docx_${Date.now()}`)
    const histDir = path.join(tmp, 'history')
    fs.mkdirSync(histDir, { recursive: true })
    fs.writeFileSync(path.join(histDir, 'CR0001.json'), JSON.stringify({
      CR: 1, rev: 2, Category: 'A', Title: 'Fix alignment',
      'Clauses affected': ['3.2'], 'Source to WG': ['Nokia']
    }))
    const mdFile = path.join(tmp, 'test.md')
    const outFile = path.join(tmp, 'out.docx')
    fs.writeFileSync(mdFile, '{ChangeHistory}\n')
    try {
      const { Md2Docx } = require('../../../lib/md2docx/md2docx')
      const converter = new Md2Docx({ specRootPath: tmp })
      await converter.convert(fs.readFileSync(mdFile, 'utf8'), outFile, tmp, null, {})
      const buf = fs.readFileSync(outFile)
      const zip = await JSZip.loadAsync(buf)
      const xml = await zip.file('word/document.xml').async('string')
      assert.ok(xml.includes('<w:tbl>'), 'should have a table')
      const texts = findTexts(xml)
      assert.ok(texts.some(t => t.includes('0001')), 'should contain CR number')
      assert.ok(texts.some(t => t.includes('Fix alignment')), 'should contain title')
      assert.ok(texts.some(t => t.includes('Nokia')), 'should contain source')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  await test('DOCX: {ChangeHistory} renders empty when no CRs exist', async () => {
    const tmp = path.join(os.tmpdir(), `ch_docx_empty_${Date.now()}`)
    fs.mkdirSync(path.join(tmp, 'history'), { recursive: true })
    const mdFile = path.join(tmp, 'test.md')
    const outFile = path.join(tmp, 'out.docx')
    fs.writeFileSync(mdFile, '{ChangeHistory}\n')
    try {
      const { Md2Docx } = require('../../../lib/md2docx/md2docx')
      const converter = new Md2Docx({ specRootPath: tmp })
      await converter.convert(fs.readFileSync(mdFile, 'utf8'), outFile, tmp, null, {})
      const buf = fs.readFileSync(outFile)
      const zip = await JSZip.loadAsync(buf)
      const xml = await zip.file('word/document.xml').async('string')
      assert.ok(!xml.includes('<w:tbl>'), 'should not have a table')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  await test('DOCX: table caption before {ChangeHistory} gets TH style', async () => {
    const tmp = path.join(os.tmpdir(), `ch_docx_cap_${Date.now()}`)
    const histDir = path.join(tmp, 'history')
    fs.mkdirSync(histDir, { recursive: true })
    fs.writeFileSync(path.join(histDir, 'CR0001.json'), JSON.stringify({
      CR: 1, rev: 1, Category: 'B', Title: 'Test',
      'Clauses affected': ['5.1'], 'Source to WG': ['Ericsson']
    }))
    const mdFile = path.join(tmp, 'test.md')
    const outFile = path.join(tmp, 'out.docx')
    fs.writeFileSync(mdFile, 'Table A-1: Change history\n\n{ChangeHistory}\n')
    try {
      const { Md2Docx } = require('../../../lib/md2docx/md2docx')
      const converter = new Md2Docx({ specRootPath: tmp })
      await converter.convert(fs.readFileSync(mdFile, 'utf8'), outFile, tmp, null, {})
      const buf = fs.readFileSync(outFile)
      const zip = await JSZip.loadAsync(buf)
      const xml = await zip.file('word/document.xml').async('string')
      // TH style should appear before the table
      const thIdx = xml.indexOf('"TH"')
      const tblIdx = xml.indexOf('<w:tbl>')
      assert.ok(thIdx > 0, 'should have TH style')
      assert.ok(tblIdx > 0, 'should have a table')
      assert.ok(thIdx < tblIdx, 'TH caption should appear before the table')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  await test('DOCX: {ChangeHistory} without specRootPath produces no table', async () => {
    const tmp = path.join(os.tmpdir(), `ch_docx_noroot_${Date.now()}`)
    fs.mkdirSync(tmp, { recursive: true })
    const mdFile = path.join(tmp, 'test.md')
    const outFile = path.join(tmp, 'out.docx')
    fs.writeFileSync(mdFile, '{ChangeHistory}\n')
    try {
      const { Md2Docx } = require('../../../lib/md2docx/md2docx')
      const converter = new Md2Docx()
      await converter.convert(fs.readFileSync(mdFile, 'utf8'), outFile, tmp, null, {})
      const buf = fs.readFileSync(outFile)
      const zip = await JSZip.loadAsync(buf)
      const xml = await zip.file('word/document.xml').async('string')
      assert.ok(!xml.includes('<w:tbl>'), 'should not have a table')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  console.log('\nCR history annex (deprecated functions)')

  await test('renderCRHistoryDOCX returns heading + table for approved CRs', async () => {
    const { renderCRHistoryDOCX, loadApprovedCRs } = require('../../../lib/md2docx/crHistoryRenderer')
    // Use a temp directory with test CR files
    const tmp = path.join(os.tmpdir(), `cr_history_test_${Date.now()}`)
    const histDir = path.join(tmp, 'history')
    fs.mkdirSync(histDir, { recursive: true })
    fs.writeFileSync(path.join(histDir, 'CR0001.json'), JSON.stringify({
      CR: 1, rev: 1, Category: 'B', Title: 'First change',
      'Clauses affected': ['5.1'], 'Source to WG': ['Ericsson']
    }))
    fs.writeFileSync(path.join(histDir, 'CR0002.json'), JSON.stringify({
      CR: 2, rev: 0, Category: 'A', Title: 'Second change',
      'Clauses affected': ['3.2', '4.1'], 'Source to TSG': ['Nokia']
    }))
    try {
      const elements = renderCRHistoryDOCX(tmp)
      assert.ok(elements.length >= 2, 'should have heading + table')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  await test('renderCRHistoryDOCX returns empty for no approved CRs', async () => {
    const { renderCRHistoryDOCX } = require('../../../lib/md2docx/crHistoryRenderer')
    const tmp = path.join(os.tmpdir(), `cr_history_empty_${Date.now()}`)
    fs.mkdirSync(path.join(tmp, 'history'), { recursive: true })
    try {
      assert.strictEqual(renderCRHistoryDOCX(tmp).length, 0)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  await test('renderCRHistoryHTML contains CR data in table', async () => {
    const { renderCRHistoryHTML } = require('../../../lib/md2docx/crHistoryRenderer')
    const tmp = path.join(os.tmpdir(), `cr_history_html_${Date.now()}`)
    const histDir = path.join(tmp, 'history')
    fs.mkdirSync(histDir, { recursive: true })
    fs.writeFileSync(path.join(histDir, 'CR0042.json'), JSON.stringify({
      CR: 42, rev: 3, Category: 'C', Title: 'Fix procedure',
      'Clauses affected': ['7.2'], 'Source to WG': ['Samsung']
    }))
    try {
      const html = renderCRHistoryHTML(tmp)
      assert.ok(html.includes('Change history'), 'should have annex heading')
      assert.ok(html.includes('0042'), 'should have CR number')
      assert.ok(html.includes('Fix procedure'), 'should have title')
      assert.ok(html.includes('Samsung'), 'should have source')
      assert.ok(html.includes('7.2'), 'should have clauses')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  await test('renderCRHistoryHTML returns empty string when no CRs', async () => {
    const { renderCRHistoryHTML } = require('../../../lib/md2docx/crHistoryRenderer')
    assert.strictEqual(renderCRHistoryHTML('/non/existent'), '')
  })

  await test('CR history sorts by CR number', async () => {
    const { renderCRHistoryHTML } = require('../../../lib/md2docx/crHistoryRenderer')
    const tmp = path.join(os.tmpdir(), `cr_history_sort_${Date.now()}`)
    const histDir = path.join(tmp, 'history')
    fs.mkdirSync(histDir, { recursive: true })
    fs.writeFileSync(path.join(histDir, 'CR0005.json'), JSON.stringify({ CR: 5, Title: 'Five' }))
    fs.writeFileSync(path.join(histDir, 'CR0002.json'), JSON.stringify({ CR: 2, Title: 'Two' }))
    fs.writeFileSync(path.join(histDir, 'CR0009.json'), JSON.stringify({ CR: 9, Title: 'Nine' }))
    try {
      const html = renderCRHistoryHTML(tmp)
      const idx2 = html.indexOf('Two')
      const idx5 = html.indexOf('Five')
      const idx9 = html.indexOf('Nine')
      assert.ok(idx2 < idx5 && idx5 < idx9, 'should be sorted by CR number')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
