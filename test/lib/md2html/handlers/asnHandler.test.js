const assert = require('assert')
const { highlightAsn, extractFirstAsnWord, extractAsnLeadingComments, asnToMarkdown } = require('../../../../lib/md2html/handlers/asnHandler')

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

// --- highlightAsn ---

console.log('highlightAsn')

test('highlights ASN.1 keywords', () => {
  const result = highlightAsn('DEFINITIONS AUTOMATIC TAGS BEGIN END')
  assert.ok(result.includes('<span class="asn-keyword">DEFINITIONS</span>'))
  assert.ok(result.includes('<span class="asn-keyword">AUTOMATIC</span>'))
  assert.ok(result.includes('<span class="asn-keyword">TAGS</span>'))
  assert.ok(result.includes('<span class="asn-keyword">BEGIN</span>'))
  assert.ok(result.includes('<span class="asn-keyword">END</span>'))
})

test('highlights all keywords', () => {
  const keywords = ['IMPORTS', 'EXPORTS', 'OPTIONAL', 'DEFAULT', 'SIZE']
  for (const kw of keywords) {
    const result = highlightAsn(kw)
    assert.ok(result.includes(`<span class="asn-keyword">${kw}</span>`), `Missing keyword: ${kw}`)
  }
})

test('highlights type names (uppercase start)', () => {
  const result = highlightAsn('MyType')
  assert.ok(result.includes('<span class="asn-type">MyType</span>'))
})

test('highlights field names (lowercase start)', () => {
  const result = highlightAsn('myField')
  assert.ok(result.includes('<span class="asn-field">myField</span>'))
})

test('highlights line comments', () => {
  const result = highlightAsn('code -- this is a comment')
  assert.ok(result.includes('<span class="asn-comment">-- this is a comment</span>'))
})

test('highlights block comments', () => {
  const result = highlightAsn('/* block comment */')
  assert.ok(result.includes('<span class="asn-comment">/* block comment */</span>'))
})

test('highlights multi-line block comments', () => {
  const result = highlightAsn('/* line1\nline2 */')
  assert.ok(result.includes('<span class="asn-comment">'))
  assert.ok(result.includes('line1'))
  assert.ok(result.includes('line2'))
})

test('escapes HTML entities', () => {
  const result = highlightAsn('a < b')
  assert.ok(!result.includes('<')  || result.includes('&lt;') || result.includes('<span'))
  assert.ok(!result.includes(' < '))
})

test('handles hyphenated identifiers', () => {
  const result = highlightAsn('my-field-name')
  assert.ok(result.includes('<span class="asn-field">my-field-name</span>'))
})

test('handles empty input', () => {
  const result = highlightAsn('')
  assert.strictEqual(result, '')
})

test('does not highlight words inside block comments', () => {
  const result = highlightAsn('/* DEFINITIONS */')
  // DEFINITIONS inside comment should not get keyword span
  const commentMatch = result.match(/<span class="asn-comment">.*?<\/span>/s)
  assert.ok(commentMatch)
  assert.ok(!commentMatch[0].includes('<span class="asn-keyword">'))
})

test('highlights code before line comment separately', () => {
  const result = highlightAsn('MyType -- comment')
  assert.ok(result.includes('<span class="asn-type">MyType</span>'))
  assert.ok(result.includes('<span class="asn-comment">-- comment</span>'))
})

// --- extractFirstAsnWord ---

console.log('\nextractFirstAsnWord')

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

// --- extractAsnLeadingComments ---

console.log('\nextractAsnLeadingComments')

test('extracts single line comment', () => {
  const { comments, remainingContent } = extractAsnLeadingComments('-- hello\ncode')
  assert.deepStrictEqual(comments, ['hello'])
  assert.strictEqual(remainingContent, 'code')
})

test('extracts multiple line comments', () => {
  const { comments } = extractAsnLeadingComments('-- first\n-- second\ncode')
  assert.deepStrictEqual(comments, ['first', 'second'])
})

test('extracts single-line block comment', () => {
  const { comments } = extractAsnLeadingComments('/* hello */\ncode')
  assert.deepStrictEqual(comments, ['hello'])
})

test('extracts multi-line block comment', () => {
  const { comments } = extractAsnLeadingComments('/* line1\nline2 */\ncode')
  assert.strictEqual(comments.length, 1)
  assert.ok(comments[0].includes('line1'))
  assert.ok(comments[0].includes('line2'))
})

test('returns remaining content after comments', () => {
  const { remainingContent } = extractAsnLeadingComments('-- comment\nMyModule DEFINITIONS')
  assert.strictEqual(remainingContent, 'MyModule DEFINITIONS')
})

test('handles no comments', () => {
  const { comments, remainingContent } = extractAsnLeadingComments('MyModule DEFINITIONS')
  assert.deepStrictEqual(comments, [])
  assert.strictEqual(remainingContent, 'MyModule DEFINITIONS')
})

test('skips empty lines before comments', () => {
  const { comments } = extractAsnLeadingComments('\n\n-- hello\ncode')
  assert.deepStrictEqual(comments, ['hello'])
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

// --- asnToMarkdown ---

console.log('\nasnToMarkdown')

test('wraps ASN.1 in fenced code block', () => {
  const result = asnToMarkdown('MyModule DEFINITIONS ::= BEGIN\nEND')
  assert.ok(result.includes('```asn'))
  assert.ok(result.includes('MyModule DEFINITIONS ::= BEGIN'))
  assert.ok(result.includes('END'))
})

test('extracts module name as heading', () => {
  const result = asnToMarkdown('MyModule DEFINITIONS ::= BEGIN\nEND')
  assert.ok(result.includes('#### ASN.1 Module: MyModule'))
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

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
