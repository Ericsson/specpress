const { test, describe } = require('node:test')
const assert = require('assert')
const { buildFrontPageDocx } = require('../../../lib/md2docx/frontPage')

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

describe('buildFrontPageDocx structure', () => {
  test('returns frontSection, innerSection, bodyHeaderFooter', () => {
    const result = buildFrontPageDocx(SAMPLE_DATA, '')
    assert.ok(result.frontSection)
    assert.ok(result.innerSection)
    assert.ok(result.bodyHeaderFooter)
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
})

describe('front page content', () => {
  test('front section contains spec number', () => {
    assert.ok(JSON.stringify(buildFrontPageDocx(SAMPLE_DATA, '').frontSection).includes('TS 38.331'))
  })

  test('front section contains version', () => {
    assert.ok(JSON.stringify(buildFrontPageDocx(SAMPLE_DATA, '').frontSection).includes('V18.0.0'))
  })

  test('front section contains date', () => {
    assert.ok(JSON.stringify(buildFrontPageDocx(SAMPLE_DATA, '').frontSection).includes('2026-03'))
  })

  test('front section contains title', () => {
    assert.ok(JSON.stringify(buildFrontPageDocx(SAMPLE_DATA, '').frontSection).includes('NR; Radio Resource Control'))
  })

  test('front section contains doc type in disclaimer', () => {
    assert.ok(JSON.stringify(buildFrontPageDocx(SAMPLE_DATA, '').frontSection).includes('Technical Specification'))
  })

  test('inner section contains keywords', () => {
    assert.ok(JSON.stringify(buildFrontPageDocx(SAMPLE_DATA, '').innerSection).includes('NR, RRC, 5G'))
  })
})

describe('year derivation', () => {
  test('copyright year derived from DATE field', () => {
    assert.ok(JSON.stringify(buildFrontPageDocx(SAMPLE_DATA, '').innerSection).includes('2026'))
  })

  test('copyright year falls back to 2025 when DATE is empty', () => {
    assert.ok(JSON.stringify(buildFrontPageDocx({ ...SAMPLE_DATA, DATE: '' }, '').innerSection).includes('2025'))
  })
})

describe('body header', () => {
  test('body header contains spec number and version', () => {
    const json = JSON.stringify(buildFrontPageDocx(SAMPLE_DATA, '').bodyHeaderFooter)
    assert.ok(json.includes('TS 38.331'))
    assert.ok(json.includes('V18.0.0'))
  })

  test('body header contains release', () => {
    assert.ok(JSON.stringify(buildFrontPageDocx(SAMPLE_DATA, '').bodyHeaderFooter).includes('Release 18'))
  })
})

describe('missing data handling', () => {
  test('works with minimal data (empty strings)', () => {
    const result = buildFrontPageDocx({}, '')
    assert.ok(result.frontSection)
    assert.ok(result.innerSection)
    assert.ok(result.bodyHeaderFooter)
  })

  test('works with null data', () => {
    assert.ok(buildFrontPageDocx(null, '').frontSection)
  })
})
