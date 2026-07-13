/**
 * End-to-end tests for HTML diff (change tracking).
 *
 * Tests the diffHtml() function which takes baseline and current markdown,
 * renders both to HTML, and produces word-level tracked changes with
 * <ins>/<del> markup.
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { Md2Html } = require('../../../lib/md2html/md2html')
const { diffHtml } = require('../../../lib/md2html/htmlDiff')

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

function createHandler() {
  return new Md2Html({})
}

async function run() {
  console.log('HTML diff — text changes')

  await test('added text produces <ins> markup', () => {
    const handler = createHandler()
    const baseline = '# Heading\n\nOriginal text.\n'
    const current = '# Heading\n\nOriginal text. Added sentence.\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(result.includes('<ins'), 'should contain <ins> for added text')
    assert.ok(result.includes('Added sentence'), 'should contain the added text')
  })

  await test('removed text produces <del> markup', () => {
    const handler = createHandler()
    const baseline = '# Heading\n\nThis will be removed.\n'
    const current = '# Heading\n\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(result.includes('<del'), 'should contain <del> for removed text')
    assert.ok(result.includes('removed'), 'should contain the deleted text')
  })

  await test('modified text produces both <ins> and <del>', () => {
    const handler = createHandler()
    const baseline = '# Heading\n\nThe old word here.\n'
    const current = '# Heading\n\nThe new word here.\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(result.includes('<ins'), 'should have insertion')
    assert.ok(result.includes('<del'), 'should have deletion')
    assert.ok(result.includes('new'), 'should contain new text')
    assert.ok(result.includes('old'), 'should contain old text')
  })

  await test('identical content produces no <ins> or <del>', () => {
    const handler = createHandler()
    const content = '# Heading\n\nSame content.\n'
    const result = diffHtml({ baselineContent: content, currentContent: content, handler })
    assert.ok(!result.includes('<ins'), 'no insertions for identical content')
    assert.ok(!result.includes('<del'), 'no deletions for identical content')
    assert.ok(result.includes('Same content'), 'content should be present')
  })

  console.log('\nHTML diff — paragraph changes')

  await test('added paragraph is tracked', () => {
    const handler = createHandler()
    const baseline = '# Heading\n\nFirst paragraph.\n'
    const current = '# Heading\n\nFirst paragraph.\n\nSecond paragraph.\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(result.includes('<ins'), 'should have insertion for new paragraph')
    assert.ok(result.includes('Second paragraph'), 'new paragraph content present')
  })

  await test('removed paragraph is tracked', () => {
    const handler = createHandler()
    const baseline = '# Heading\n\nKeep this.\n\nRemove this.\n'
    const current = '# Heading\n\nKeep this.\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(result.includes('<del'), 'should have deletion for removed paragraph')
    assert.ok(result.includes('Remove this'), 'deleted paragraph content present')
  })

  console.log('\nHTML diff — heading changes')

  await test('modified heading is tracked', () => {
    const handler = createHandler()
    const baseline = '# Old Title\n\nContent.\n'
    const current = '# New Title\n\nContent.\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(result.includes('<del'), 'should have deletion for old heading text')
    assert.ok(result.includes('<ins'), 'should have insertion for new heading text')
    assert.ok(result.includes('Old'), 'old heading word should be in output')
    assert.ok(result.includes('New'), 'new heading word should be in output')
  })

  console.log('\nHTML diff — image handling')

  await test('added image is shown as inserted', () => {
    const handler = createHandler()
    const baseline = '# Heading\n\nText only.\n'
    const current = '# Heading\n\nText only.\n\n![photo](test.png)\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    // Image should be marked as new (either <ins> around it or a diff-ins-block)
    assert.ok(
      result.includes('diff-ins') || result.includes('<ins'),
      'added image should be marked as insertion'
    )
  })

  await test('removed image is shown as deleted', () => {
    const handler = createHandler()
    const baseline = '# Heading\n\n![photo](test.png)\n\nText.\n'
    const current = '# Heading\n\nText.\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(
      result.includes('diff-del') || result.includes('<del'),
      'removed image should be marked as deletion'
    )
  })

  console.log('\nHTML diff — diagram handling')

  await test('added mermaid diagram is shown as inserted', () => {
    const handler = createHandler()
    const baseline = '# Heading\n\nText.\n'
    const current = '# Heading\n\nText.\n\n```mermaid\ngraph TD; A-->B\n```\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(
      result.includes('diff-ins') || result.includes('<ins'),
      'added diagram should be marked as insertion'
    )
  })

  await test('removed mermaid diagram is shown as deleted', () => {
    const handler = createHandler()
    const baseline = '# Heading\n\n```mermaid\ngraph TD; A-->B\n```\n\nText.\n'
    const current = '# Heading\n\nText.\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(
      result.includes('diff-del') || result.includes('<del'),
      'removed diagram should be marked as deletion'
    )
  })

  await test('modified diagram shows both old and new', () => {
    const handler = createHandler()
    const baseline = '# Heading\n\n```mermaid\ngraph TD; A-->B\n```\n'
    const current = '# Heading\n\n```mermaid\ngraph TD; X-->Y\n```\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    // Modified diagrams should show some kind of change indication
    assert.ok(
      result.includes('diff-del') || result.includes('diff-ins') || result.includes('<ins') || result.includes('<del'),
      'modified diagram should show change'
    )
  })

  console.log('\nHTML diff — returns valid HTML')

  await test('result is a valid HTML body (no full document wrapper)', () => {
    const handler = createHandler()
    const baseline = '# Hello\n\nWorld.\n'
    const current = '# Hello\n\nEarth.\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    // Should be HTML body content, not a full document
    assert.ok(!result.includes('<!DOCTYPE'), 'should not be a full HTML document')
    assert.ok(!result.includes('<html'), 'should not contain <html> tag')
    assert.ok(result.includes('<h1') || result.includes('<p'), 'should contain HTML elements')
  })

  await test('empty baseline (new document) shows everything as inserted', () => {
    const handler = createHandler()
    const baseline = ''
    const current = '# New Heading\n\nNew content.\n'
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(result.includes('New Heading') || result.includes('New content'), 'content should be present')
    assert.ok(result.includes('<ins'), 'new content should be marked as insertion')
  })

  await test('empty current (deleted document) shows everything as deleted', () => {
    const handler = createHandler()
    const baseline = '# Old Heading\n\nOld content.\n'
    const current = ''
    const result = diffHtml({ baselineContent: baseline, currentContent: current, handler })
    assert.ok(result.includes('Old Heading') || result.includes('Old content'), 'old content should be present')
    assert.ok(result.includes('<del'), 'old content should be marked as deletion')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run()
