const { test, describe } = require('node:test')
const assert = require('assert')
const MarkdownIt = require('markdown-it')

const mdImageSize = require('../../../lib/common/mdImageSize')

/** Builds a markdown-it instance with only the image-size plugin enabled. */
function makeMd() {
  return new MarkdownIt({ html: true }).use(mdImageSize)
}

/** Parses `src` and returns the first image token found in the stream. */
function firstImageToken(md, src) {
  const tokens = md.parse(src, {})
  for (const t of tokens) {
    if (t.type !== 'inline' || !t.children) continue
    const img = t.children.find(c => c.type === 'image')
    if (img) return img
  }
  return null
}

describe('mdImageSize — attribute parsing', () => {

  test('sets width from {width=300}', () => {
    const md = makeMd()
    const img = firstImageToken(md, '![alt](image.png){width=300}')
    assert.strictEqual(img.attrGet('width'), '300')
    assert.strictEqual(img.attrGet('height'), null)
  })

  test('sets both width and height from {width=300 height=200}', () => {
    const md = makeMd()
    const img = firstImageToken(md, '![alt](image.png){width=300 height=200}')
    assert.strictEqual(img.attrGet('width'), '300')
    assert.strictEqual(img.attrGet('height'), '200')
  })

  test('preserves percentage width from {width=50%}', () => {
    const md = makeMd()
    const img = firstImageToken(md, '![alt](image.png){width=50%}')
    assert.strictEqual(img.attrGet('width'), '50%')
  })

  test('strips trailing px unit ({width=300px} -> 300)', () => {
    const md = makeMd()
    const img = firstImageToken(md, '![alt](image.png){width=300px}')
    assert.strictEqual(img.attrGet('width'), '300')
  })

  test('accepts reversed key order {height=200 width=300}', () => {
    const md = makeMd()
    const img = firstImageToken(md, '![alt](image.png){height=200 width=300}')
    assert.strictEqual(img.attrGet('width'), '300')
    assert.strictEqual(img.attrGet('height'), '200')
  })

  test('ignores unknown keys but still applies width', () => {
    const md = makeMd()
    const img = firstImageToken(md, '![alt](image.png){width=300 class=foo}')
    assert.strictEqual(img.attrGet('width'), '300')
    assert.strictEqual(img.attrGet('class'), null)
  })

  test('plain image without block is unaffected', () => {
    const md = makeMd()
    const img = firstImageToken(md, '![alt](image.png)')
    assert.strictEqual(img.attrGet('width'), null)
    assert.strictEqual(img.attrGet('height'), null)
  })

  test('block separated by a space is NOT consumed (GitLab requires adjacency)', () => {
    const md = makeMd()
    const img = firstImageToken(md, '![alt](image.png) {width=300}')
    assert.strictEqual(img.attrGet('width'), null)
  })
})

describe('mdImageSize — rendered HTML', () => {

  test('emits width attribute and removes the {...} block from text', () => {
    const md = makeMd()
    const html = md.render('![alt](image.png){width=300}')
    assert.ok(html.includes('width="300"'), 'width attribute should be rendered')
    assert.ok(!html.includes('{width=300}'), 'literal block should not appear in output')
    assert.ok(!html.includes('{width'), 'no leftover brace fragment')
  })

  test('emits width and height, keeps trailing text after the block', () => {
    const md = makeMd()
    const html = md.render('![alt](image.png){width=300 height=200} caption')
    assert.ok(html.includes('width="300"'))
    assert.ok(html.includes('height="200"'))
    assert.ok(html.includes('caption'), 'trailing text should be preserved')
    assert.ok(!html.includes('{width'), 'block should be stripped')
  })

  test('percentage width renders as-is', () => {
    const md = makeMd()
    const html = md.render('![alt](image.png){width=50%}')
    assert.ok(html.includes('width="50%"'))
  })
})
