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
  'TDoc Number': 'RP-240123',
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

  test('rejects TDoc Number not matching schema pattern', () => {
    const result = validateCRCoverPageData({ ...validData, 'TDoc Number': '6GSM-12345' }, 'test.json')
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some(e => e.startsWith('TDoc Number:')))
  })

  test('accepts non-standard TDoc Number when custom tdocPattern matches', () => {
    const result = validateCRCoverPageData(
      { ...validData, 'TDoc Number': '6GSM-123456' }, 'test.json',
      { tdocPattern: '^6GSM-[0-9]{6}$' }
    )
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.errors.length, 0)
  })

  test('rejects TDoc Number when custom tdocPattern does not match', () => {
    // validData already has 'TDoc Number': 'RP-240123' which passes schema but not this custom pattern
    const result = validateCRCoverPageData(
      validData, 'test.json',
      { tdocPattern: '^R2-[0-9]{7}$' }
    )
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some(e => e.startsWith('TDoc Number:')))
  })

  test('shows custom pattern in error when schema also rejects TDoc Number', () => {
    const result = validateCRCoverPageData(
      { ...validData, 'TDoc Number': '6GSM-123456' }, 'test.json',
      { tdocPattern: '^6GSM-[0-9]{7}$' }  // wrong digit count — both schema and custom reject
    )
    assert.strictEqual(result.valid, false)
    const tdocErr = result.errors.find(e => e.startsWith('TDoc Number:'))
    assert.ok(tdocErr, 'should have a TDoc Number error')
    assert.ok(tdocErr.includes('^6GSM-[0-9]{7}$'), 'error should show custom pattern, not default')
  })

  test('custom tdocPattern does not affect other fields', () => {
    const result = validateCRCoverPageData(
      { ...validData, 'TDoc Number': '6GSM-123456', Category: 'Z' }, 'test.json',
      { tdocPattern: '^6GSM-[0-9]{6}$' }
    )
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('Category')))
    assert.ok(!result.errors.some(e => e.startsWith('TDoc Number:')))
  })

  test('reports missing CR and TDoc Number as errors', () => {
    const { CR: _cr, 'TDoc Number': _tdoc, ...withoutBoth } = validData
    const result = validateCRCoverPageData(withoutBoth, 'test.json')
    assert.strictEqual(result.valid, false)
    assert.ok(result.errors.some(e => e.includes('CR')))
    assert.ok(result.errors.some(e => e.includes('TDoc Number')))
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

describe('loadCRCoverPageData', () => {
  const { loadCRCoverPageData } = require('../../../lib/common/crCoverPageLoader')
  const os = require('os')

  test('returns data even when validation fails', () => {
    const tmp = path.join(os.tmpdir(), `cr_loader_test_${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify({ CR: 1, Title: 'incomplete' }))
    try {
      const result = loadCRCoverPageData(tmp)
      assert.strictEqual(result.valid, false)
      assert.ok(result.data !== null, 'data should be returned even when invalid')
      assert.strictEqual(result.data.CR, 1)
    } finally {
      fs.unlinkSync(tmp)
    }
  })

  test('passes tdocPattern option through to validation', () => {
    const tmp = path.join(os.tmpdir(), `cr_loader_tdoc_${Date.now()}.json`)
    // validData already has CR:123; override TDoc Number with non-standard value
    fs.writeFileSync(tmp, JSON.stringify({ ...validData, 'TDoc Number': '6GSM-123456' }))
    try {
      const withoutPattern = loadCRCoverPageData(tmp)
      assert.strictEqual(withoutPattern.valid, false) // schema rejects 6GSM-123456

      const withPattern = loadCRCoverPageData(tmp, { tdocPattern: '^6GSM-[0-9]{6}$' })
      assert.strictEqual(withPattern.valid, true)
    } finally {
      fs.unlinkSync(tmp)
    }
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
