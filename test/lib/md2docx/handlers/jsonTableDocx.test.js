const assert = require('assert')
const { jsonToDocxTable, jsonFileToDocxTable } = require('../../../../lib/md2docx/handlers/jsonTableHandler')
const path = require('path')

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

/** Recursively collect all paragraph style IDs from a docx element tree. */
function collectStyles(el) {
  const styles = []
  const json = JSON.stringify(el)
  const re = /w:pStyle.*?w:val.*?"value":"([^"]+)"/g
  let m
  while ((m = re.exec(json)) !== null) styles.push(m[1])
  return styles
}

/** Recursively collect all text content from w:t elements. */
function collectTexts(el) {
  const texts = []
  const json = JSON.stringify(el)
  const re = /"w:t".*?\[.*?"preserve"\},"([^"]+)"/g
  let m
  while ((m = re.exec(json)) !== null) texts.push(m[1])
  return texts
}

async function run() {
  console.log('jsonToDocxTable')

  await test('returns null for empty data', async () => {
    assert.strictEqual(await jsonToDocxTable(null), null)
    assert.strictEqual(await jsonToDocxTable({}), null)
    assert.strictEqual(await jsonToDocxTable({ rows: [] }), null)
  })

  await test('generates a Table with correct row count', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A' }],
      rows: [['r1'], ['r2'], ['r3']]
    })
    assert.ok(table, 'should return a table')
    // header row + 3 data rows = 4 TableRows
    const rowCount = table.root.filter(r => r.rootKey === 'w:tr').length
    assert.strictEqual(rowCount, 4)
  })

  await test('header cells get TAH style', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'Header1' }],
      rows: [['val']]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAH'))
  })

  await test('left-aligned column gets TAL style', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A', align: 'left' }],
      rows: [['val']]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAL'))
  })

  await test('center-aligned column gets TAC style', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A', align: 'center' }],
      rows: [['val']]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAC'))
  })

  await test('right-aligned column gets TAR style', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A', align: 'right' }],
      rows: [['val']]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAR'))
  })

  await test('NOTE cell gets TAN style', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A' }],
      rows: [['NOTE: important']]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAN'))
  })

  await test('NOTE 2: numbered note gets TAN style', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A' }],
      rows: [['NOTE 2: second note']]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAN'))
  })

  await test('multi-line cell with NOTE gets TAN for note line only', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A' }],
      rows: [['Regular text\nNOTE: a note']]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAL'), 'regular line should be TAL')
    assert.ok(styles.includes('TAN'), 'note line should be TAN')
  })

  await test('NOTE cell has colon-tab replacement', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A' }],
      rows: [['NOTE: text here']]
    })
    const json = JSON.stringify(table)
    assert.ok(json.includes('NOTE:\\ttext'), 'should replace ": " with ":\\t"')
  })

  await test('colspan with < marker', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A' }, { name: 'B' }],
      rows: [['spans two', '<']]
    })
    const json = JSON.stringify(table)
    assert.ok(json.includes('"gridSpan"') || json.includes('w:gridSpan'), 'should have colspan')
  })

  await test('rowspan with ^ marker', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A' }],
      rows: [['spans down'], ['^']]
    })
    const json = JSON.stringify(table)
    assert.ok(json.includes('vMerge') || json.includes('w:vMerge'), 'should have rowspan merge')
  })

  await test('skips header row when no column names', async () => {
    const table = await jsonToDocxTable({
      rows: [['a', 'b']]
    })
    const rowCount = table.root.filter(r => r.rootKey === 'w:tr').length
    assert.strictEqual(rowCount, 1, 'only data row, no header')
  })

  console.log('\njsonFileToDocxTable')

  await test('reads and converts a JSON file', async () => {
    const samplePath = path.join(__dirname, '../../md2html/handlers/samples/jsonTable1.json')
    const result = await jsonFileToDocxTable(samplePath)
    assert.ok(result, 'should return a table or array')
  })

  console.log('\nitalic/bold in JsonTable cells')

  await test('NOTE with italic content gets TAN style', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A' }],
      rows: [['NOTE: *italic* content']]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAN'))
  })

  await test('cell with italic text but no NOTE gets normal style', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A' }],
      rows: [['*italic* regular text']]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAL'))
    assert.ok(!styles.includes('TAN'))
  })

  await test('multi-line cell with italic in NOTE line', async () => {
    const table = await jsonToDocxTable({
      columns: [{ name: 'A' }],
      rows: [['Regular *italic*\nNOTE: *italic* note']]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAL'), 'regular line should be TAL')
    assert.ok(styles.includes('TAN'), 'note line should be TAN')
  })

  console.log('\nkey-based rows format')

  await test('key-based row objects produce a table', async () => {
    const table = await jsonToDocxTable({
      columns: [{ key: 'a', name: 'Col A' }, { key: 'b', name: 'Col B' }],
      rows: [{ a: 'r1a', b: 'r1b' }]
    })
    assert.ok(table, 'should return a table')
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAH'), 'should have header style')
    assert.ok(styles.includes('TAL'), 'should have body style')
  })

  await test('key-based format with alignment', async () => {
    const table = await jsonToDocxTable({
      columns: [{ key: 'x', name: 'X', align: 'center' }],
      rows: [{ x: 'val' }]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAC'), 'should have center alignment style')
  })

  await test('key-based format with NOTE gets TAN', async () => {
    const table = await jsonToDocxTable({
      columns: [{ key: 'a', name: 'A' }],
      rows: [{ a: 'NOTE: important' }]
    })
    const styles = collectStyles(table)
    assert.ok(styles.includes('TAN'), 'NOTE should get TAN style')
  })

  await test('key-based format with missing key produces empty cell', async () => {
    const table = await jsonToDocxTable({
      columns: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }],
      rows: [{ a: 'only a' }]
    })
    assert.ok(table, 'should return a table')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()

