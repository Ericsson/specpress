const { test, describe } = require('node:test')
const assert = require('assert')
const path = require('path')
const fs = require('fs')
const {
  validateCRCoverPageData,
  formatCRNumber,
  formatRevNumber,
  extractRelease,
  formatList
} = require('../../../lib/common/crCoverPageLoader')

const schemaPath = path.join(__dirname, '../../../lib/templates/crCoverPageSchema.json')
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))

const validData = {
  'Specification': '38.413',
  'Current version': '17.5.0',
  'Release': 17,
  'CR': 123,
  'Title': 'Test CR',
  'Category': 'B',
  'Source to TSG': ['RAN2'],
  'Reason for change': 'Some reason',
  'Summary of change': 'Some summary',
  'Work item code': ['FS_6G_Radio'],
  'Clauses affected': ['5.2.3'],
  'Date': '2026-05-28',
  'Consequences if not approved': 'Bad things happen'
}

describe('schema-driven validation', () => {
  test('reports all schema-required fields when data is empty', () => {
    const result = validateCRCoverPageData({}, 'test.json')
    assert.strictEqual(result.valid, false)
    const reported = result.errors
      .filter(e => e.startsWith('Missing required field: '))
      .map(e => e.replace('Missing required field: ', ''))
    for (const field of schema.required) {
      assert.ok(reported.includes(field), `Schema requires "${field}" but validator did not report it as missing`)
    }
  })

  test('accepts data that satisfies all schema constraints', () => {
    const result = validateCRCoverPageData(validData, 'test.json')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.errors.length, 0)
  })

  test('rejects CR number out of schema range', () => {
    const result = validateCRCoverPageData({ ...validData, CR: 10000 }, 'test.json')
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('CR')))
  })

  test('rejects invalid Category enum value', () => {
    const result = validateCRCoverPageData({ ...validData, Category: 'Z' }, 'test.json')
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('Category')))
  })

  test('rejects invalid Specification pattern', () => {
    const result = validateCRCoverPageData({ ...validData, Specification: 'invalid' }, 'test.json')
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('Specification')))
  })

  test('rejects additional properties not in schema', () => {
    const result = validateCRCoverPageData({ ...validData, unknownField: 'value' }, 'test.json')
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('additional')))
  })

  test('rejects null data', () => {
    const result = validateCRCoverPageData(null, 'test.json')
    assert.strictEqual(result.valid, false)
  })

  test('accepts data with Release field', () => {
    const result = validateCRCoverPageData({ ...validData, Release: 18 }, 'test.json')
    assert.strictEqual(result.valid, true)
  })
})

describe('formatCRNumber', () => {
  test('pads with leading zeros', () => {
    assert.strictEqual(formatCRNumber(1), '0001')
    assert.strictEqual(formatCRNumber(123), '0123')
    assert.strictEqual(formatCRNumber(9999), '9999')
  })

  test('returns - for null/undefined/0', () => {
    assert.strictEqual(formatCRNumber(null), '-')
    assert.strictEqual(formatCRNumber(undefined), '-')
    assert.strictEqual(formatCRNumber(0), '-')
  })
})

describe('formatRevNumber', () => {
  test('returns dash for 0/null/undefined', () => {
    assert.strictEqual(formatRevNumber(0), '-')
    assert.strictEqual(formatRevNumber(null), '-')
    assert.strictEqual(formatRevNumber(undefined), '-')
  })

  test('returns number as string', () => {
    assert.strictEqual(formatRevNumber(1), '1')
    assert.strictEqual(formatRevNumber(10), '10')
  })
})

describe('extractRelease', () => {
  test('extracts release from version string', () => {
    assert.strictEqual(extractRelease('17.5.0'), 'Rel-17')
    assert.strictEqual(extractRelease('18.0.0'), 'Rel-18')
  })

  test('returns empty for invalid input', () => {
    assert.strictEqual(extractRelease(null), '')
    assert.strictEqual(extractRelease(''), '')
  })
})

describe('formatList', () => {
  test('joins array items', () => {
    assert.strictEqual(formatList(['Ericsson', 'Nokia']), 'Ericsson, Nokia')
  })

  test('returns empty for non-array', () => {
    assert.strictEqual(formatList(null), '')
    assert.strictEqual(formatList('string'), '')
  })
})
