const { test, describe } = require('node:test')
const assert = require('assert')
const { highlightAsn, extractFirstAsnWord, extractAsnLeadingComments, asnToMarkdown } = require('../../../../lib/md2html/handlers/asnHandler')

describe('highlightAsn', () => {
  test('highlights ASN.1 keywords', () => {
    const result = highlightAsn('DEFINITIONS AUTOMATIC TAGS BEGIN END')
    assert.ok(result.includes('<span class="asn-keyword">DEFINITIONS</span>'))
    assert.ok(result.includes('<span class="asn-keyword">BEGIN</span>'))
    assert.ok(result.includes('<span class="asn-keyword">END</span>'))
  })

  test('highlights all keywords', () => {
    for (const kw of ['IMPORTS', 'EXPORTS', 'OPTIONAL', 'DEFAULT', 'SIZE']) {
      assert.ok(highlightAsn(kw).includes(`<span class="asn-keyword">${kw}</span>`), `Missing keyword: ${kw}`)
    }
  })

  test('highlights type names (uppercase start)', () => {
    assert.ok(highlightAsn('MyType').includes('<span class="asn-type">MyType</span>'))
  })

  test('highlights field names (lowercase start)', () => {
    assert.ok(highlightAsn('myField').includes('<span class="asn-field">myField</span>'))
  })

  test('highlights line comments', () => {
    assert.ok(highlightAsn('code -- this is a comment').includes('<span class="asn-comment">-- this is a comment</span>'))
  })

  test('highlights block comments', () => {
    assert.ok(highlightAsn('/* block comment */').includes('<span class="asn-comment">/* block comment */</span>'))
  })

  test('highlights multi-line block comments', () => {
    const result = highlightAsn('/* line1\nline2 */')
    assert.ok(result.includes('<span class="asn-comment">'))
    assert.ok(result.includes('line1'))
    assert.ok(result.includes('line2'))
  })

  test('escapes HTML entities', () => {
    const result = highlightAsn('a < b')
    assert.ok(!result.includes(' < '))
  })

  test('handles hyphenated identifiers', () => {
    assert.ok(highlightAsn('my-field-name').includes('<span class="asn-field">my-field-name</span>'))
  })

  test('handles empty input', () => {
    assert.strictEqual(highlightAsn(''), '')
  })

  test('does not highlight words inside block comments', () => {
    const result = highlightAsn('/* DEFINITIONS */')
    const commentMatch = result.match(/<span class="asn-comment">.*?<\/span>/s)
    assert.ok(commentMatch)
    assert.ok(!commentMatch[0].includes('<span class="asn-keyword">'))
  })

  test('highlights code before line comment separately', () => {
    const result = highlightAsn('MyType -- comment')
    assert.ok(result.includes('<span class="asn-type">MyType</span>'))
    assert.ok(result.includes('<span class="asn-comment">-- comment</span>'))
  })
})

describe('extractFirstAsnWord', () => {
  test('extracts first word from simple content', () => {
    assert.strictEqual(extractFirstAsnWord('MyModule DEFINITIONS'), 'MyModule')
  })

  test('skips empty lines', () => {
    assert.strictEqual(extractFirstAsnWord('\n\nMyModule DEFINITIONS'), 'MyModule')
  })

  test('skips line comments', () => {
    assert.strictEqual(extractFirstAsnWord('-- comment\nMyModule DEFINITIONS'), 'MyModule')
  })

  test('extracts first word ignoring block comment content', () => {
    assert.strictEqual(extractFirstAsnWord('/* comment */\nMyModule'), 'MyModule')
  })

  test('returns null for empty content', () => {
    assert.strictEqual(extractFirstAsnWord(''), null)
  })

  test('returns null for only comments', () => {
    assert.strictEqual(extractFirstAsnWord('-- comment\n-- another'), null)
  })

  test('handles hyphenated module names', () => {
    assert.strictEqual(extractFirstAsnWord('My-Module DEFINITIONS'), 'My-Module')
  })
})

describe('extractAsnLeadingComments', () => {
  test('extracts single line comment', () => {
    const { comments, remainingContent } = extractAsnLeadingComments('-- hello\ncode')
    assert.deepStrictEqual(comments, ['hello'])
    assert.strictEqual(remainingContent, 'code')
  })

  test('extracts multiple line comments', () => {
    assert.deepStrictEqual(extractAsnLeadingComments('-- first\n-- second\ncode').comments, ['first', 'second'])
  })

  test('extracts single-line block comment', () => {
    assert.deepStrictEqual(extractAsnLeadingComments('/* hello */\ncode').comments, ['hello'])
  })

  test('extracts multi-line block comment', () => {
    const { comments } = extractAsnLeadingComments('/* line1\nline2 */\ncode')
    assert.strictEqual(comments.length, 1)
    assert.ok(comments[0].includes('line1'))
    assert.ok(comments[0].includes('line2'))
  })

  test('returns remaining content after comments', () => {
    assert.strictEqual(extractAsnLeadingComments('-- comment\nMyModule DEFINITIONS').remainingContent, 'MyModule DEFINITIONS')
  })

  test('handles no comments', () => {
    const { comments, remainingContent } = extractAsnLeadingComments('MyModule DEFINITIONS')
    assert.deepStrictEqual(comments, [])
    assert.strictEqual(remainingContent, 'MyModule DEFINITIONS')
  })

  test('skips empty lines before comments', () => {
    assert.deepStrictEqual(extractAsnLeadingComments('\n\n-- hello\ncode').comments, ['hello'])
  })

  test('handles empty input', () => {
    const { comments, remainingContent } = extractAsnLeadingComments('')
    assert.deepStrictEqual(comments, [])
    assert.strictEqual(remainingContent, '')
  })

  test('handles mixed comment styles', () => {
    const { comments } = extractAsnLeadingComments('-- line comment\n/* block comment */\ncode')
    assert.strictEqual(comments.length, 2)
    assert.strictEqual(comments[0], 'line comment')
    assert.strictEqual(comments[1], 'block comment')
  })

  test('stops at first non-comment line', () => {
    const { comments, remainingContent } = extractAsnLeadingComments('-- comment\ncode\n-- not extracted')
    assert.deepStrictEqual(comments, ['comment'])
    assert.ok(remainingContent.includes('code'))
    assert.ok(remainingContent.includes('-- not extracted'))
  })
})

describe('asnToMarkdown', () => {
  test('wraps ASN.1 in fenced code block', () => {
    const result = asnToMarkdown('MyModule DEFINITIONS ::= BEGIN\nEND')
    assert.ok(result.includes('```asn'))
    assert.ok(result.includes('MyModule DEFINITIONS ::= BEGIN'))
  })

  test('extracts module name as heading', () => {
    assert.ok(asnToMarkdown('MyModule DEFINITIONS ::= BEGIN\nEND').includes('#### ASN.1 Module: MyModule'))
  })

  test('extracts leading comments as paragraphs', () => {
    const result = asnToMarkdown('-- This is a comment\nMyModule DEFINITIONS ::= BEGIN\nEND')
    assert.ok(result.includes('This is a comment'))
    assert.ok(result.includes('#### ASN.1 Module: MyModule'))
  })

  test('handles content with no module name', () => {
    const result = asnToMarkdown('-- just a comment')
    assert.ok(!result.includes('#### ASN.1 Module:'))
    assert.ok(result.includes('just a comment'))
  })
})
