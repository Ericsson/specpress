const assert = require('assert')
const path = require('path')
const { buildCoverSections } = require('../../../lib/md2docx/coverPage')

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

const SAMPLE_DATA = {
  SPEC_NUMBER: 'TS 38.331',
  VERSION: 'V18.0.0',
  DATE: '2026-03',
  DOC_TYPE: 'Technical Specification',
  TSG: 'Technical Specification Group Radio Access Network',
  TITLE: 'NR; Radio Resource Control (RRC); Protocol specification',
  RELEASE: 'Release 18',
  KEYWORDS: 'NR, RRC, 5G'
}

console.log('buildCoverSections structure')

test('returns coverSection, innerCoverSection, bodyHeaderFooter', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  assert.ok(result.coverSection, 'should have coverSection')
  assert.ok(result.innerCoverSection, 'should have innerCoverSection')
  assert.ok(result.bodyHeaderFooter, 'should have bodyHeaderFooter')
})

test('coverSection has children array', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  assert.ok(Array.isArray(result.coverSection.children))
  assert.ok(result.coverSection.children.length > 0)
})

test('coverSection has page properties', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  assert.ok(result.coverSection.properties)
  assert.ok(result.coverSection.properties.page)
})

test('innerCoverSection has children and headers/footers', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  assert.ok(Array.isArray(result.innerCoverSection.children))
  assert.ok(result.innerCoverSection.headers)
  assert.ok(result.innerCoverSection.footers)
})

test('bodyHeaderFooter has headers and footers', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  assert.ok(result.bodyHeaderFooter.headers)
  assert.ok(result.bodyHeaderFooter.footers)
})

console.log('\ncover page content')

test('cover section contains spec number', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  const json = JSON.stringify(result.coverSection)
  assert.ok(json.includes('TS 38.331'), 'should contain spec number')
})

test('cover section contains version', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  const json = JSON.stringify(result.coverSection)
  assert.ok(json.includes('V18.0.0'), 'should contain version')
})

test('cover section contains date', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  const json = JSON.stringify(result.coverSection)
  assert.ok(json.includes('2026-03'), 'should contain date')
})

test('cover section contains title', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  const json = JSON.stringify(result.coverSection)
  assert.ok(json.includes('NR; Radio Resource Control'), 'should contain title')
})

test('cover section contains doc type in disclaimer', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  const json = JSON.stringify(result.coverSection)
  assert.ok(json.includes('Technical Specification'), 'should contain doc type')
})

test('inner cover contains keywords', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  const json = JSON.stringify(result.innerCoverSection)
  assert.ok(json.includes('NR, RRC, 5G'), 'should contain keywords')
})

console.log('\nyear derivation')

test('copyright year derived from DATE field', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  const json = JSON.stringify(result.innerCoverSection)
  assert.ok(json.includes('2026'), 'should contain year derived from DATE')
})

test('copyright year falls back to 2025 when DATE is empty', () => {
  const data = { ...SAMPLE_DATA, DATE: '' }
  const result = buildCoverSections(data, '')
  const json = JSON.stringify(result.innerCoverSection)
  assert.ok(json.includes('2025'), 'should fall back to 2025')
})

console.log('\nbody header')

test('body header contains spec number and version', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  const json = JSON.stringify(result.bodyHeaderFooter)
  assert.ok(json.includes('TS 38.331'), 'header should contain spec number')
  assert.ok(json.includes('V18.0.0'), 'header should contain version')
})

test('body header contains release', () => {
  const result = buildCoverSections(SAMPLE_DATA, '')
  const json = JSON.stringify(result.bodyHeaderFooter)
  assert.ok(json.includes('Release 18'), 'header should contain release')
})

console.log('\nmissing data handling')

test('works with minimal data (empty strings)', () => {
  const result = buildCoverSections({}, '')
  assert.ok(result.coverSection)
  assert.ok(result.innerCoverSection)
  assert.ok(result.bodyHeaderFooter)
})

test('works with null data', () => {
  const result = buildCoverSections(null, '')
  assert.ok(result.coverSection)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

