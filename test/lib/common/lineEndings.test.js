const { test, describe } = require('node:test')
const assert = require('assert')
const { normalizeCrlf, isNormalizableTextFile } = require('../../../lib/common/lineEndings')

describe('normalizeCrlf', () => {
  test('replaces CRLF with LF', () => {
    assert.strictEqual(normalizeCrlf('line1\r\nline2\r\n'), 'line1\nline2\n')
  })

  test('leaves LF-only content unchanged', () => {
    assert.strictEqual(normalizeCrlf('line1\nline2\n'), 'line1\nline2\n')
  })

  test('leaves content without line breaks unchanged', () => {
    assert.strictEqual(normalizeCrlf('no breaks here'), 'no breaks here')
  })

  test('handles mixed CRLF and LF', () => {
    assert.strictEqual(normalizeCrlf('a\r\nb\nc\r\n'), 'a\nb\nc\n')
  })

  test('passes through non-string input unchanged', () => {
    const buf = Buffer.from('abc')
    assert.strictEqual(normalizeCrlf(buf), buf)
    assert.strictEqual(normalizeCrlf(null), null)
    assert.strictEqual(normalizeCrlf(undefined), undefined)
  })
})

describe('isNormalizableTextFile', () => {
  test('recognizes markdown, ASN.1, JSON, SVG as text', () => {
    assert.ok(isNormalizableTextFile('spec/01 Scope/00 Scope.md'))
    assert.ok(isNormalizableTextFile('module.asn'))
    assert.ok(isNormalizableTextFile('data.json'))
    assert.ok(isNormalizableTextFile('cached/abc123.svg'))
  })

  test('is case-insensitive on extension', () => {
    assert.ok(isNormalizableTextFile('DIAGRAM.SVG'))
  })

  test('rejects binary extensions', () => {
    assert.ok(!isNormalizableTextFile('cached/abc123.png'))
    assert.ok(!isNormalizableTextFile('image.jpg'))
  })

  test('rejects files without an extension', () => {
    assert.ok(!isNormalizableTextFile('README'))
  })
})
