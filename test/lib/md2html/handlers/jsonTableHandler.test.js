const assert = require('assert')
const path = require('path')
const { jsonToHtmlTable, jsonFileToHtmlTable } = require('../../../../lib/md2html/handlers/jsonTableHandler')

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

console.log('jsonToHtmlTable')

test('returns empty string for null input', () => {
  assert.strictEqual(jsonToHtmlTable(null), '')
})

test('returns empty string for missing rows', () => {
  assert.strictEqual(jsonToHtmlTable({ columns: [{ name: 'A' }] }), '')
})

test('returns empty string for empty rows array', () => {
  assert.strictEqual(jsonToHtmlTable({ columns: [{ name: 'A' }], rows: [] }), '')
})

test('renders column headers', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'Col1' }, { name: 'Col2' }], rows: [[1, 2]] })
  assert.ok(html.includes('Col1</th>'))
  assert.ok(html.includes('Col2</th>'))
})

test('omits thead when no columns have names', () => {
  const html = jsonToHtmlTable({ columns: [{}, {}], rows: [[1, 2]] })
  assert.ok(!html.includes('<thead>'))
  assert.ok(html.includes('>1</td>'))
})

test('omits thead when columns array is absent', () => {
  const html = jsonToHtmlTable({ rows: [[1, 2]] })
  assert.ok(!html.includes('<thead>'))
})

test('applies column alignment to header', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A', align: 'center' }], rows: [[1]] })
  assert.ok(html.includes('text-align:center'))
  assert.ok(html.includes('A</th>'))
})

test('applies column alignment to cells', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A', align: 'right' }], rows: [[1]] })
  assert.ok(html.includes('text-align:right'))
  assert.ok(html.includes('>1</td>'))
})

test('renders correct number of rows', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A' }], rows: [[1], [2], [3]] })
  const rowCount = (html.match(/<tr>/g) || []).length
  assert.strictEqual(rowCount, 4) // 1 header + 3 data rows
})

test('renders empty cell for undefined values', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A' }, { name: 'B' }], rows: [[1]] })
  assert.ok(html.includes('></td>'))
})

test('renders array of tables', () => {
  const html = jsonToHtmlTable([
    { columns: [{ name: 'A' }], rows: [[1]] },
    { columns: [{ name: 'B' }], rows: [[2]] }
  ])
  const tableCount = (html.match(/<table/g) || []).length
  assert.strictEqual(tableCount, 2)
})

test('preserves string values with special characters', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A' }], rows: [['$\\\\\\\\delta_{x}$']] })
  assert.ok(html.includes('$\\\\\\\\delta_{x}$'))
})

test('renders numeric values as strings', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A' }], rows: [[0], [-1], [3.14]] })
  assert.ok(html.includes('>0</td>'))
  assert.ok(html.includes('>-1</td>'))
  assert.ok(html.includes('>3.14</td>'))
})

console.log('\nSpan markers')

test('colspan with < marker', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A' }, { name: 'B' }], rows: [[1, '<']] })
  assert.ok(html.includes('colspan="2"'))
})

test('rowspan with ^ marker', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A' }], rows: [[1], ['^']] })
  assert.ok(html.includes('rowspan="2"'))
})

test('colspan spans multiple cells', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], rows: [[1, '<', '<']] })
  assert.ok(html.includes('colspan="3"'))
})

test('rowspan spans multiple cells', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A' }], rows: [[1], ['^'], ['^']] })
  assert.ok(html.includes('rowspan="3"'))
})

test('mixed rowspan and colspan', () => {
  const html = jsonToHtmlTable({
    columns: [{ name: 'A' }, { name: 'B' }],
    rows: [
      [1, 2],
      ['^', 4]
    ]
  })
  assert.ok(html.includes('rowspan="2"'))
  assert.ok(html.includes('>2</td>'))
  assert.ok(html.includes('>4</td>'))
})

test('combined rowspan and colspan (2x2 block)', () => {
  const html = jsonToHtmlTable({
    columns: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    rows: [
      [1, 2, 3],
      [4, 'X', '<'],
      [7, '^', '^']
    ]
  })
  assert.ok(html.includes('rowspan="2"'))
  assert.ok(html.includes('colspan="2"'))
  assert.ok(html.includes('X'))
})

console.log('\njsonFileToHtmlTable')

test('reads and converts sample JSON file', () => {
  const filePath = path.join(__dirname, 'samples', 'jsonTable1.json')
  const html = jsonFileToHtmlTable(filePath)
  assert.ok(html.includes('TPC Command Field'))
  assert.ok(html.includes('<table'))
})

test('throws on non-existent file', () => {
  assert.throws(() => jsonFileToHtmlTable('nonexistent.json'))
})

console.log('\nMarkdown rendering')

test('renders string cells as markdown when renderMd is provided', () => {
  const renderMd = (s) => `<p><em>${s}</em></p>`
  const html = jsonToHtmlTable({ columns: [{ name: 'A' }], rows: [['hello']] }, renderMd)
  assert.ok(html.includes('<em>hello</em>'))
  assert.ok(!html.includes('<p>'))
})

test('renders header names as markdown when renderMd is provided', () => {
  const renderMd = (s) => `<p><em>${s}</em></p>`
  const html = jsonToHtmlTable({ columns: [{ name: 'Col' }], rows: [[1]] }, renderMd)
  assert.ok(html.includes('<em>Col</em></th>'))
})

test('does not render numeric cells through renderMd', () => {
  const renderMd = (s) => `<p>${s}</p>`
  const html = jsonToHtmlTable({ rows: [[42]] }, renderMd)
  assert.ok(html.includes('>42</td>'))
  assert.ok(!html.includes('<p>42</p>'))
})

test('string cells render as plain text without renderMd', () => {
  const html = jsonToHtmlTable({ columns: [{ name: 'A' }], rows: [['**bold**']] })
  assert.ok(html.includes('>**bold**</td>'))
})

test('jsonFileToHtmlTable passes renderMd through', () => {
  const renderMd = (s) => `<p><em>${s}</em></p>`
  const filePath = path.join(__dirname, 'samples', 'jsonTable1.json')
  const html = jsonFileToHtmlTable(filePath, renderMd)
  assert.ok(html.includes('<em>TPC Command Field</em>'))
})

// ── NOTE detection in table cells (table-note class) ────────

const MarkdownIt = require('markdown-it')
const noteMd = new MarkdownIt({ html: true })
const noteRenderMd = (s) => noteMd.render(s)

test('single-line NOTE cell gets table-note class on td', () => {
  const html = jsonToHtmlTable({
    columns: [{ name: 'A' }],
    rows: [['NOTE: important']]
  }, noteRenderMd)
  assert.ok(html.includes('class="table-note"'), 'td should have table-note class')
})

test('NOTE 2: numbered note gets table-note class', () => {
  const html = jsonToHtmlTable({
    columns: [{ name: 'A' }],
    rows: [['NOTE 2: second note']]
  }, noteRenderMd)
  assert.ok(html.includes('class="table-note"'))
})

test('non-NOTE cell does not get table-note class', () => {
  const html = jsonToHtmlTable({
    columns: [{ name: 'A' }],
    rows: [['regular text']]
  }, noteRenderMd)
  assert.ok(!html.includes('table-note'))
})

test('multi-line cell: NOTE line gets p.table-note, other lines do not', () => {
  const html = jsonToHtmlTable({
    columns: [{ name: 'A' }],
    rows: [['Regular text\nNOTE: a note']]
  }, noteRenderMd)
  assert.ok(html.includes('<p class="table-note">'), 'NOTE line should have table-note class')
  assert.ok(html.includes('<p>'), 'regular line should be plain p')
})

test('NOTE cell omits column alignment from inline style', () => {
  const html = jsonToHtmlTable({
    columns: [{ name: 'A', align: 'center' }],
    rows: [['NOTE: centered column note']]
  }, noteRenderMd)
  const tdMatch = html.match(/<td[^>]*class="table-note"[^>]*>/)
  assert.ok(tdMatch, 'should have td with table-note class')
  assert.ok(!tdMatch[0].includes('text-align'), 'should not have text-align in inline style')
})

// ── Key-based format (items) ─────────────────────────────────

console.log('\nkey-based rows format')

test('renders table from key-based row objects', () => {
  const html = jsonToHtmlTable({
    columns: [{ key: 'a', name: 'Col A' }, { key: 'b', name: 'Col B' }],
    rows: [{ a: 'r1a', b: 'r1b' }, { a: 'r2a', b: 'r2b' }]
  })
  assert.ok(html.includes('Col A'))
  assert.ok(html.includes('r1a'))
  assert.ok(html.includes('r2b'))
})

test('key-based format supports alignment', () => {
  const html = jsonToHtmlTable({
    columns: [{ key: 'x', name: 'X', align: 'center' }],
    rows: [{ x: 'val' }]
  })
  assert.ok(html.includes('text-align:center'))
})

test('key-based format supports cell merging markers', () => {
  const html = jsonToHtmlTable({
    columns: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }],
    rows: [{ a: 'spans', b: '<' }, { a: '^', b: 'val' }]
  })
  assert.ok(html.includes('colspan'))
  assert.ok(html.includes('rowspan'))
})

test('key-based format with missing key returns empty cell', () => {
  const html = jsonToHtmlTable({
    columns: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }],
    rows: [{ a: 'only a' }]
  })
  assert.ok(html.includes('only a'))
  const tds = html.match(/<td[^>]*>/g)
  assert.ok(tds.length === 2, 'should have 2 cells')
})

test('key-based format with renderMd', () => {
  const renderMd = (s) => `<p>${s}</p>`
  const html = jsonToHtmlTable({
    columns: [{ key: 'a', name: 'A' }],
    rows: [{ a: '**bold**' }]
  }, renderMd)
  assert.ok(html.includes('**bold**'))
})

test('columns without keys still work with array rows', () => {
  const html = jsonToHtmlTable({
    columns: [{ name: 'A' }],
    rows: [['val']]
  })
  assert.ok(html.includes('val'))
})

// ── mergeOnAbsence ─────────────────────────────────────────

console.log('\nmergeOnAbsence')

test('mergeOnAbsence: "above" produces rowspan when key is absent', () => {
  const html = jsonToHtmlTable({
    columns: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B', mergeOnAbsence: 'above' }],
    rows: [{ a: '1', b: 'spans' }, { a: '2' }]
  })
  assert.ok(html.includes('rowspan'), 'absent key with mergeOnAbsence:above should produce rowspan')
})

test('mergeOnAbsence: "left" produces colspan when key is absent', () => {
  const html = jsonToHtmlTable({
    columns: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B', mergeOnAbsence: 'left' }],
    rows: [{ a: 'spans' }]
  })
  assert.ok(html.includes('colspan'), 'absent key with mergeOnAbsence:left should produce colspan')
})

test('mergeOnAbsence: empty string value is NOT treated as absent', () => {
  const html = jsonToHtmlTable({
    columns: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B', mergeOnAbsence: 'above' }],
    rows: [{ a: '1', b: 'top' }, { a: '2', b: '' }]
  })
  assert.ok(!html.includes('rowspan'), 'empty string should not trigger merge')
})

test('mergeOnAbsence: "no" (default) produces empty cell', () => {
  const html = jsonToHtmlTable({
    columns: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B', mergeOnAbsence: 'no' }],
    rows: [{ a: '1' }]
  })
  assert.ok(!html.includes('colspan'), 'should not merge')
  assert.ok(!html.includes('rowspan'), 'should not merge')
  const tds = html.match(/<td[^>]*>/g)
  assert.strictEqual(tds.length, 2, 'should have 2 separate cells')
})

test('mergeOnAbsence: absent without config produces empty cell', () => {
  const html = jsonToHtmlTable({
    columns: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }],
    rows: [{ a: '1' }]
  })
  assert.ok(!html.includes('colspan'))
  assert.ok(!html.includes('rowspan'))
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
