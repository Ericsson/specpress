const { test, describe } = require('node:test')
const assert = require('assert')
const { insertOmittedMarkers } = require('../../../lib/common/specProcessor')

describe('insertOmittedMarkers - basic', () => {
  test('returns content unchanged when allFiles is empty', () => {
    const content = '<!-- FILE: /a.md -->\n# Hello'
    assert.strictEqual(insertOmittedMarkers(content, ['/a.md'], []), content)
  })

  test('returns content unchanged when all files are selected', () => {
    const all = ['/a.md', '/b.md']
    const content = '<!-- FILE: /a.md -->\n# A\n<!-- FILE: /b.md -->\n# B'
    assert.strictEqual(insertOmittedMarkers(content, all, all), content)
  })

  test('returns content unchanged when selectedFiles equals allFiles', () => {
    const files = ['/spec/01/file.md']
    const content = '<!-- FILE: /spec/01/file.md -->\n# Content'
    assert.strictEqual(insertOmittedMarkers(content, files, files), content)
  })
})

describe('insertOmittedMarkers - leading gap', () => {
  test('inserts marker before first file when it is not first in spec', () => {
    const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md']
    const content = '<!-- FILE: /spec/02.md -->\n# Section 2'
    const result = insertOmittedMarkers(content, ['/spec/02.md'], all)
    assert.ok(result.startsWith('<!-- OMITTED -->'))
    assert.ok(result.includes('<!-- FILE: /spec/02.md -->'))
  })

  test('no leading marker when first selected is first in spec', () => {
    const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md']
    const content = '<!-- FILE: /spec/01.md -->\n# Section 1'
    const result = insertOmittedMarkers(content, ['/spec/01.md'], all)
    assert.ok(!result.startsWith('<!-- OMITTED -->'))
  })
})

describe('insertOmittedMarkers - trailing gap', () => {
  test('appends marker when last selected is not last in spec', () => {
    const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md']
    const content = '<!-- FILE: /spec/01.md -->\n# Section 1'
    const result = insertOmittedMarkers(content, ['/spec/01.md'], all)
    assert.ok(result.trimEnd().endsWith('<!-- OMITTED -->'))
  })

  test('no trailing marker when last selected is last in spec', () => {
    const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md']
    const content = '<!-- FILE: /spec/03.md -->\n# Section 3'
    const result = insertOmittedMarkers(content, ['/spec/03.md'], all)
    assert.ok(!result.trimEnd().endsWith('<!-- OMITTED -->'))
  })
})

describe('insertOmittedMarkers - middle gaps', () => {
  test('inserts marker between non-consecutive selected files', () => {
    const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md', '/spec/04.md']
    const selected = ['/spec/01.md', '/spec/04.md']
    const content = '<!-- FILE: /spec/01.md -->\n# One\n\n<!-- FILE: /spec/04.md -->\n# Four'
    const result = insertOmittedMarkers(content, selected, all)
    const idx01 = result.indexOf('<!-- FILE: /spec/01.md -->')
    const idx04 = result.indexOf('<!-- FILE: /spec/04.md -->')
    assert.ok(result.substring(idx01, idx04).includes('<!-- OMITTED -->'))
  })

  test('no marker between consecutive selected files', () => {
    const all = ['/spec/01.md', '/spec/02.md', '/spec/03.md']
    const selected = ['/spec/01.md', '/spec/02.md']
    const content = '<!-- FILE: /spec/01.md -->\n# One\n\n<!-- FILE: /spec/02.md -->\n# Two'
    const result = insertOmittedMarkers(content, selected, all)
    const idx01 = result.indexOf('<!-- FILE: /spec/01.md -->')
    const idx02 = result.indexOf('<!-- FILE: /spec/02.md -->')
    assert.ok(!result.substring(idx01, idx02).includes('<!-- OMITTED -->'))
  })
})

describe('insertOmittedMarkers - case insensitive paths', () => {
  test('handles case-insensitive path matching on Windows', () => {
    const all = ['C:\\Spec\\01.md', 'C:\\Spec\\02.md', 'C:\\Spec\\03.md']
    const selected = ['C:\\Spec\\01.md', 'C:\\Spec\\03.md']
    const content = '<!-- FILE: C:\\Spec\\01.md -->\n# One\n\n<!-- FILE: C:\\Spec\\03.md -->\n# Three'
    assert.ok(insertOmittedMarkers(content, selected, all).includes('<!-- OMITTED -->'))
  })
})

describe('insertOmittedMarkers - auto-headings', () => {
  test('places marker after auto-headings when intra-folder gap exists', () => {
    const all = ['/spec/03/01.md', '/spec/03/02.md', '/spec/03/03.md']
    const selected = ['/spec/03/03.md']
    const content = '<!-- FILE: /spec/03/03.md -->\n<!-- AUTO-HEADING -->\n### 3.3 Abbreviations\n\nContent here'
    const result = insertOmittedMarkers(content, selected, all)
    assert.ok(result.includes('<!-- OMITTED -->'))
  })
})

describe('insertOmittedMarkers - multiple gaps', () => {
  test('inserts markers at multiple gap positions', () => {
    const all = ['/s/01.md', '/s/02.md', '/s/03.md', '/s/04.md', '/s/05.md']
    const selected = ['/s/01.md', '/s/03.md', '/s/05.md']
    const content = '<!-- FILE: /s/01.md -->\n# 1\n\n<!-- FILE: /s/03.md -->\n# 3\n\n<!-- FILE: /s/05.md -->\n# 5'
    const result = insertOmittedMarkers(content, selected, all)
    assert.strictEqual((result.match(/<!-- OMITTED -->/g) || []).length, 2)
  })

  test('leading + middle + trailing gaps produce 2 markers', () => {
    const all = ['/s/01.md', '/s/02.md', '/s/03.md', '/s/04.md', '/s/05.md']
    const content = '<!-- FILE: /s/03.md -->\n# 3'
    const result = insertOmittedMarkers(content, ['/s/03.md'], all)
    assert.strictEqual((result.match(/<!-- OMITTED -->/g) || []).length, 2)
  })
})

describe('insertOmittedMarkers - edge cases', () => {
  test('handles single file in allFiles', () => {
    const all = ['/spec/only.md']
    const content = '<!-- FILE: /spec/only.md -->\n# Only'
    assert.strictEqual(insertOmittedMarkers(content, all, all), content)
  })

  test('handles forward-slash FILE markers with backslash paths', () => {
    const all = ['C:\\spec\\01.md', 'C:\\spec\\02.md']
    const content = '<!-- FILE: C:/spec/02.md -->\n# Two'
    assert.ok(insertOmittedMarkers(content, ['C:\\spec\\02.md'], all).includes('<!-- OMITTED -->'))
  })
})
