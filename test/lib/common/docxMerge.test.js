const assert = require('assert')
const { mergeDocxVersions, detectBackends, findWinword, findLibreOffice } = require('../../../lib/common/docxMerge')

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

async function asyncTest(name, fn) {
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

async function run() {
  // ── detectBackends ──

  console.log('detectBackends')

  test('returns an object with word and libreoffice keys', () => {
    const result = detectBackends()
    assert.ok('word' in result, 'should have word key')
    assert.ok('libreoffice' in result, 'should have libreoffice key')
  })

  test('word is string or null', () => {
    const result = detectBackends()
    assert.ok(result.word === null || typeof result.word === 'string')
  })

  test('libreoffice is string or null', () => {
    const result = detectBackends()
    assert.ok(result.libreoffice === null || typeof result.libreoffice === 'string')
  })

  // ── findWinword ──

  console.log('\nfindWinword')

  test('returns string or null', () => {
    const result = findWinword()
    assert.ok(result === null || typeof result === 'string')
  })

  if (process.platform === 'win32') {
    test('on Windows, returns a path ending in .exe if found', () => {
      const result = findWinword()
      if (result) {
        assert.ok(result.toLowerCase().endsWith('.exe'), `Expected .exe path, got: ${result}`)
      }
    })
  } else {
    test('on non-Windows, returns null', () => {
      assert.strictEqual(findWinword(), null)
    })
  }

  // ── findLibreOffice ──

  console.log('\nfindLibreOffice')

  test('returns string or null', () => {
    const result = findLibreOffice()
    assert.ok(result === null || typeof result === 'string')
  })

  // ── mergeDocxVersions - validation ──

  console.log('\nmergeDocxVersions - validation')

  await asyncTest('rejects when revisions array is empty', async () => {
    try {
      await mergeDocxVersions('/base.docx', [], '/output.docx')
      assert.fail('should have thrown')
    } catch (e) {
      assert.ok(e.message.includes('At least one revision'), e.message)
    }
  })

  await asyncTest('rejects when revisions is null', async () => {
    try {
      await mergeDocxVersions('/base.docx', null, '/output.docx')
      assert.fail('should have thrown')
    } catch (e) {
      assert.ok(e.message)
    }
  })

  // ── mergeDocxVersions - backend dispatch ──

  console.log('\nmergeDocxVersions - backend dispatch')

  if (process.platform !== 'win32' || !findWinword()) {
    await asyncTest('word backend rejects when Word not available', async () => {
      try {
        await mergeDocxVersions('/base.docx', [{ docxPath: '/rev.docx', authorName: 'A' }], '/out.docx', { backend: 'word' })
        assert.fail('should have thrown')
      } catch (e) {
        assert.ok(e.message.includes('not found') || e.message.includes('Failed'), e.message)
      }
    })
  }

  if (!findLibreOffice()) {
    await asyncTest('libreoffice backend rejects when LibreOffice not available', async () => {
      try {
        await mergeDocxVersions('/base.docx', [{ docxPath: '/rev.docx', authorName: 'A' }], '/out.docx', { backend: 'libreoffice' })
        assert.fail('should have thrown')
      } catch (e) {
        assert.ok(e.message.includes('not found'), e.message)
      }
    })
  }

  await asyncTest('libreoffice backend rejects more than 1 revision', async () => {
    try {
      await mergeDocxVersions('/base.docx', [
        { docxPath: '/r1.docx', authorName: 'A' },
        { docxPath: '/r2.docx', authorName: 'B' }
      ], '/out.docx', { backend: 'libreoffice' })
      assert.fail('should have thrown')
    } catch (e) {
      // Either "not found" (if LO not installed) or "only 1 revision" is acceptable
      assert.ok(e.message.includes('not found') || e.message.includes('only 1 revision'), e.message)
    }
  })

  await asyncTest('auto backend rejects when no backend available', async () => {
    // This test only makes sense if neither Word nor LibreOffice is installed
    const backends = detectBackends()
    if (backends.word || backends.libreoffice) {
      // Can't test "no backend" on this machine — skip
      return
    }
    try {
      await mergeDocxVersions('/base.docx', [{ docxPath: '/rev.docx', authorName: 'A' }], '/out.docx')
      assert.fail('should have thrown')
    } catch (e) {
      assert.ok(e.message.includes('No merge backend'), e.message)
    }
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
