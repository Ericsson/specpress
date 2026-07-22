const { test, describe } = require('node:test')
const assert = require('assert')
const { parseArgs } = require('../../../lib/cli/export-docx-diff')

describe('parseArgs', () => {
  test('extracts input paths', () => {
    const opts = parseArgs(['node', 'script', 'spec/', '--output', 'out.docx', '--base', 'HEAD~1', '--revisions', 'HEAD', '--authors', 'Me'])
    assert.deepStrictEqual(opts.inputPaths, ['spec/'])
  })

  test('extracts multiple input paths', () => {
    const opts = parseArgs(['node', 'script', 'a/', 'b/', '--output', 'x.docx', '--base', 'abc', '--revisions', 'def', '--authors', 'A'])
    assert.deepStrictEqual(opts.inputPaths, ['a/', 'b/'])
  })

  test('extracts --output', () => {
    const opts = parseArgs(['node', 'script', 'spec/', '--output', 'diff.docx', '--base', 'HEAD', '--revisions', 'HEAD~1', '--authors', 'X'])
    assert.strictEqual(opts.output, 'diff.docx')
  })

  test('extracts --base', () => {
    const opts = parseArgs(['node', 'script', 'spec/', '--output', 'o.docx', '--base', 'abc123', '--revisions', 'def', '--authors', 'A'])
    assert.strictEqual(opts.base, 'abc123')
  })

  test('extracts multiple --revisions', () => {
    const opts = parseArgs(['node', 'script', 'spec/', '--output', 'o.docx', '--base', 'v1', '--revisions', 'v2', 'v3', 'v4', '--authors', 'A', 'B', 'C'])
    assert.deepStrictEqual(opts.revisions, ['v2', 'v3', 'v4'])
  })

  test('extracts multiple --authors', () => {
    const opts = parseArgs(['node', 'script', 'spec/', '--output', 'o.docx', '--base', 'v1', '--revisions', 'v2', 'v3', '--authors', 'Alice', 'Bob'])
    assert.deepStrictEqual(opts.authors, ['Alice', 'Bob'])
  })

  test('extracts --spec-root', () => {
    const opts = parseArgs(['node', 'script', 'spec/', '--output', 'o.docx', '--base', 'v1', '--revisions', 'v2', '--authors', 'A', '--spec-root', 'spec/'])
    assert.strictEqual(opts.specRoot, 'spec/')
  })

  test('extracts --backend', () => {
    const opts = parseArgs(['node', 'script', 'spec/', '--output', 'o.docx', '--base', 'v1', '--revisions', 'v2', '--authors', 'A', '--backend', 'libreoffice'])
    assert.strictEqual(opts.backend, 'libreoffice')
  })

  test('extracts --omitted-markers flag', () => {
    const opts = parseArgs(['node', 'script', 'spec/', '--output', 'o.docx', '--base', 'v1', '--revisions', 'v2', '--authors', 'A', '--omitted-markers'])
    assert.strictEqual(opts.omittedMarkers, true)
  })

  test('--revisions stops at next flag', () => {
    const opts = parseArgs(['node', 'script', 'spec/', '--base', 'v1', '--revisions', 'v2', 'v3', '--authors', 'A', 'B', '--output', 'o.docx'])
    assert.deepStrictEqual(opts.revisions, ['v2', 'v3'])
    assert.deepStrictEqual(opts.authors, ['A', 'B'])
    assert.strictEqual(opts.output, 'o.docx')
  })

  test('defaults to empty arrays when flags absent', () => {
    const opts = parseArgs(['node', 'script', 'spec/'])
    assert.deepStrictEqual(opts.revisions, [])
    assert.deepStrictEqual(opts.authors, [])
    assert.strictEqual(opts.output, undefined)
  })
})
