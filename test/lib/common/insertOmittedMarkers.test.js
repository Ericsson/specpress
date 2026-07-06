const assert = require('assert')
const { insertOmittedMarkers } = require('../../../lib/common/specProcessor')

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

// ── insertOmittedMarkers - basic ──

console.log('insertOmittedMarkers - basic')

test('returns content unchanged when allFiles is empty', () => {
  const content = '<!-- FILE: /a.md -->\n# Hello'
  const result = insertOmittedMarkers(content, ['/a.md'], [])
  assert.strictEqual(result, content)
})

test('returns content unchanged when all files are selected', () => {
  const all = ['/a.md', '/b.md']
  const content = '<!-- FILE: /a.md -->\n# A\n<!-- FILE: /b.md -->\n# B'
  const result = insertOmittedMarkers(content, all, all)
  assert.strictEqual(result, content)
})

test('returns content unchanged when selectedFiles equals allFiles', () => {
  const files = ['/spec/01/file.md']
  const content = '<!-- FILE: /spec/01/file.md -->\n# Content'
  const result = insertOmittedMarkers(content, files, files)
  assert.strictEqual(result, content)
})

// ── insertOmittedMarkers - leading gap ──

console.log('\ninsertOmittedMarkers - leading gap')

test('inserts marker before first file when it is not first in spec', () => {
  const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md']
  const selected = ['/spec/02.md']
  const content = '<!-- FILE: /spec/02.md -->\n# Section 2'
  const result = insertOmittedMarkers(content, selected, all)
  assert.ok(result.startsWith('<!-- OMITTED -->'), 'should start with OMITTED marker')
  assert.ok(result.includes('<!-- FILE: /spec/02.md -->'), 'should still contain file content')
})

test('no leading marker when first selected is first in spec', () => {
  const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md']
  const selected = ['/spec/01.md']
  const content = '<!-- FILE: /spec/01.md -->\n# Section 1'
  const result = insertOmittedMarkers(content, selected, all)
  assert.ok(!result.startsWith('<!-- OMITTED -->'), 'should not start with OMITTED marker')
})

// ── insertOmittedMarkers - trailing gap ──

console.log('\ninsertOmittedMarkers - trailing gap')

test('appends marker when last selected is not last in spec', () => {
  const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md']
  const selected = ['/spec/01.md']
  const content = '<!-- FILE: /spec/01.md -->\n# Section 1'
  const result = insertOmittedMarkers(content, selected, all)
  assert.ok(result.trimEnd().endsWith('<!-- OMITTED -->'), 'should end with OMITTED marker')
})

test('no trailing marker when last selected is last in spec', () => {
  const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md']
  const selected = ['/spec/03.md']
  const content = '<!-- FILE: /spec/03.md -->\n# Section 3'
  const result = insertOmittedMarkers(content, selected, all)
  assert.ok(!result.trimEnd().endsWith('<!-- OMITTED -->'), 'should not end with OMITTED marker')
})

// ── insertOmittedMarkers - middle gaps ──

console.log('\ninsertOmittedMarkers - middle gaps')

test('inserts marker between non-consecutive selected files', () => {
  const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md', '/spec/04.md']
  const selected = ['/spec/01.md', '/spec/04.md']
  const content = '<!-- FILE: /spec/01.md -->\n# One\n\n<!-- FILE: /spec/04.md -->\n# Four'
  const result = insertOmittedMarkers(content, selected, all)
  const idx01 = result.indexOf('<!-- FILE: /spec/01.md -->')
  const idx04 = result.indexOf('<!-- FILE: /spec/04.md -->')
  const between = result.substring(idx01, idx04)
  assert.ok(between.includes('<!-- OMITTED -->'), 'should have OMITTED marker between non-consecutive files')
})

test('no marker between consecutive selected files', () => {
  const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md']
  const selected = ['/spec/01.md', '/spec/02.md']
  const content = '<!-- FILE: /spec/01.md -->\n# One\n\n<!-- FILE: /spec/02.md -->\n# Two'
  const result = insertOmittedMarkers(content, selected, all)
  const idx01 = result.indexOf('<!-- FILE: /spec/01.md -->')
  const idx02 = result.indexOf('<!-- FILE: /spec/02.md -->')
  const between = result.substring(idx01, idx02)
  assert.ok(!between.includes('<!-- OMITTED -->'), 'should not have OMITTED marker between consecutive files')
})

// ── insertOmittedMarkers - case insensitive paths ──

console.log('\ninsertOmittedMarkers - case insensitive paths')

test('handles case-insensitive path matching on Windows', () => {
  const all = ['C:\\Spec\\01.md', 'C:\\Spec\\02.md', 'C:\\Spec\\03.md']
  const selected = ['C:\\Spec\\01.md', 'C:\\Spec\\03.md']
  const content = '<!-- FILE: C:\\Spec\\01.md -->\n# One\n\n<!-- FILE: C:\\Spec\\03.md -->\n# Three'
  const result = insertOmittedMarkers(content, selected, all)
  assert.ok(result.includes('<!-- OMITTED -->'), 'should detect gap with backslash paths')
})

// ── insertOmittedMarkers - auto-headings ──

console.log('\ninsertOmittedMarkers - auto-headings')

test('places marker after auto-headings when intra-folder gap exists', () => {
  const all = ['/spec/03/01.md', '/spec/03/02.md', '/spec/03/03.md']
  const selected = ['/spec/03/03.md']
  const content = '<!-- FILE: /spec/03/03.md -->\n<!-- AUTO-HEADING -->\n### 3.3 Abbreviations\n\nContent here'
  const result = insertOmittedMarkers(content, selected, all)
  assert.ok(result.includes('<!-- OMITTED -->'), 'should have OMITTED marker')
})

// ── insertOmittedMarkers - multiple gaps ──

console.log('\ninsertOmittedMarkers - multiple gaps')

test('inserts markers at multiple gap positions', () => {
  const all = ['/s/01.md', '/s/02.md', '/s/03.md', '/s/04.md', '/s/05.md']
  const selected = ['/s/01.md', '/s/03.md', '/s/05.md']
  const content = '<!-- FILE: /s/01.md -->\n# 1\n\n<!-- FILE: /s/03.md -->\n# 3\n\n<!-- FILE: /s/05.md -->\n# 5'
  const result = insertOmittedMarkers(content, selected, all)
  const markers = (result.match(/<!-- OMITTED -->/g) || []).length
  assert.strictEqual(markers, 2, `Expected 2 OMITTED markers, got ${markers}`)
})

test('leading + middle + trailing gaps produce 2 markers', () => {
  const all = ['/s/01.md', '/s/02.md', '/s/03.md', '/s/04.md', '/s/05.md']
  const selected = ['/s/03.md']
  const content = '<!-- FILE: /s/03.md -->\n# 3'
  const result = insertOmittedMarkers(content, selected, all)
  const markers = (result.match(/<!-- OMITTED -->/g) || []).length
  assert.strictEqual(markers, 2, `Expected 2 OMITTED markers (leading + trailing), got ${markers}`)
})

// ── insertOmittedMarkers - edge cases ──

console.log('\ninsertOmittedMarkers - edge cases')

test('handles single file in allFiles', () => {
  const all = ['/spec/only.md']
  const selected = ['/spec/only.md']
  const content = '<!-- FILE: /spec/only.md -->\n# Only'
  const result = insertOmittedMarkers(content, selected, all)
  assert.strictEqual(result, content)
})

test('handles forward-slash FILE markers with backslash paths', () => {
  const all = ['C:\\spec\\01.md', 'C:\\spec\\02.md']
  const selected = ['C:\\spec\\02.md']
  const content = '<!-- FILE: C:/spec/02.md -->\n# Two'
  const result = insertOmittedMarkers(content, selected, all)
  assert.ok(result.includes('<!-- OMITTED -->'), 'should handle mixed slash styles')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
