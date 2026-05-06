const assert = require('assert')
const { buildFrontPageDocx } = require('../../../lib/md2docx/frontPage')

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

console.log('buildFrontPageDocx structure')

test('returns frontSection, innerSection, bodyHeaderFooter', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  assert.ok(result.frontSection, 'should have frontSection')
  assert.ok(result.innerSection, 'should have innerSection')
  assert.ok(result.bodyHeaderFooter, 'should have bodyHeaderFooter')
})

test('frontSection has children array', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  assert.ok(Array.isArray(result.frontSection.children))
  assert.ok(result.frontSection.children.length > 0)
})

test('frontSection has page properties', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  assert.ok(result.frontSection.properties)
  assert.ok(result.frontSection.properties.page)
})

test('innerSection has children and headers/footers', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  assert.ok(Array.isArray(result.innerSection.children))
  assert.ok(result.innerSection.headers)
  assert.ok(result.innerSection.footers)
})

test('bodyHeaderFooter has headers and footers', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  assert.ok(result.bodyHeaderFooter.headers)
  assert.ok(result.bodyHeaderFooter.footers)
})

console.log('\nfront page content')

test('front section contains spec number', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  const json = JSON.stringify(result.frontSection)
  assert.ok(json.includes('TS 38.331'), 'should contain spec number')
})

test('front section contains version', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  const json = JSON.stringify(result.frontSection)
  assert.ok(json.includes('V18.0.0'), 'should contain version')
})

test('front section contains date', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  const json = JSON.stringify(result.frontSection)
  assert.ok(json.includes('2026-03'), 'should contain date')
})

test('front section contains title', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  const json = JSON.stringify(result.frontSection)
  assert.ok(json.includes('NR; Radio Resource Control'), 'should contain title')
})

test('front section contains doc type in disclaimer', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  const json = JSON.stringify(result.frontSection)
  assert.ok(json.includes('Technical Specification'), 'should contain doc type')
})

test('inner section contains keywords', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  const json = JSON.stringify(result.innerSection)
  assert.ok(json.includes('NR, RRC, 5G'), 'should contain keywords')
})

console.log('\nyear derivation')

test('copyright year derived from DATE field', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  const json = JSON.stringify(result.innerSection)
  assert.ok(json.includes('2026'), 'should contain year derived from DATE')
})

test('copyright year falls back to 2025 when DATE is empty', () => {
  const data = { ...SAMPLE_DATA, DATE: '' }
  const result = buildFrontPageDocx(data, '')
  const json = JSON.stringify(result.innerSection)
  assert.ok(json.includes('2025'), 'should fall back to 2025')
})

console.log('\nbody header')

test('body header contains spec number and version', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  const json = JSON.stringify(result.bodyHeaderFooter)
  assert.ok(json.includes('TS 38.331'), 'header should contain spec number')
  assert.ok(json.includes('V18.0.0'), 'header should contain version')
})

test('body header contains release', () => {
  const result = buildFrontPageDocx(SAMPLE_DATA, '')
  const json = JSON.stringify(result.bodyHeaderFooter)
  assert.ok(json.includes('Release 18'), 'header should contain release')
})

console.log('\nmissing data handling')

test('works with minimal data (empty strings)', () => {
  const result = buildFrontPageDocx({}, '')
  assert.ok(result.frontSection)
  assert.ok(result.innerSection)
  assert.ok(result.bodyHeaderFooter)
})

test('works with null data', () => {
  const result = buildFrontPageDocx(null, '')
  assert.ok(result.frontSection)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
