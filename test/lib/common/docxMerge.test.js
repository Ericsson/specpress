const { test, describe } = require('node:test')
const assert = require('assert')
const { mergeDocxVersions, detectBackends, findWinword, findLibreOffice } = require('../../../lib/common/docxMerge')

describe('detectBackends', () => {
  test('returns an object with word and libreoffice keys', () => {
    const result = detectBackends()
    assert.ok('word' in result)
    assert.ok('libreoffice' in result)
  })

  test('word is string or null', () => {
    const result = detectBackends()
    assert.ok(result.word === null || typeof result.word === 'string')
  })

  test('libreoffice is string or null', () => {
    const result = detectBackends()
    assert.ok(result.libreoffice === null || typeof result.libreoffice === 'string')
  })
})

describe('findWinword', () => {
  test('returns string or null', () => {
    const result = findWinword()
    assert.ok(result === null || typeof result === 'string')
  })

  if (process.platform === 'win32') {
    test('on Windows, returns a path ending in .exe if found', () => {
      const result = findWinword()
      if (result) assert.ok(result.toLowerCase().endsWith('.exe'), `Expected .exe path, got: ${result}`)
    })
  } else {
    test('on non-Windows, returns null', () => {
      assert.strictEqual(findWinword(), null)
    })
  }
})

describe('findLibreOffice', () => {
  test('returns string or null', () => {
    const result = findLibreOffice()
    assert.ok(result === null || typeof result === 'string')
  })
})

describe('mergeDocxVersions - validation', () => {
  test('rejects when revisions array is empty', async () => {
    await assert.rejects(
      () => mergeDocxVersions('/base.docx', [], '/output.docx'),
      (e) => { assert.ok(e.message.includes('At least one revision'), e.message); return true }
    )
  })

  test('rejects when revisions is null', async () => {
    await assert.rejects(() => mergeDocxVersions('/base.docx', null, '/output.docx'))
  })
})

describe('mergeDocxVersions - backend dispatch', () => {
  if (process.platform !== 'win32' || !findWinword()) {
    test('word backend rejects when Word not available', async () => {
      await assert.rejects(
        () => mergeDocxVersions('/base.docx', [{ docxPath: '/rev.docx', authorName: 'A' }], '/out.docx', { backend: 'word' }),
        (e) => { assert.ok(e.message.includes('not found') || e.message.includes('Failed'), e.message); return true }
      )
    })
  }

  if (!findLibreOffice()) {
    test('libreoffice backend rejects when LibreOffice not available', async () => {
      await assert.rejects(
        () => mergeDocxVersions('/base.docx', [{ docxPath: '/rev.docx', authorName: 'A' }], '/out.docx', { backend: 'libreoffice' }),
        (e) => { assert.ok(e.message.includes('not found'), e.message); return true }
      )
    })
  }

  test('libreoffice backend rejects more than 1 revision', async () => {
    await assert.rejects(
      () => mergeDocxVersions('/base.docx', [
        { docxPath: '/r1.docx', authorName: 'A' },
        { docxPath: '/r2.docx', authorName: 'B' }
      ], '/out.docx', { backend: 'libreoffice' }),
      (e) => { assert.ok(e.message.includes('not found') || e.message.includes('only 1 revision'), e.message); return true }
    )
  })

  test('auto backend rejects when no backend available', { skip: (() => { const b = detectBackends(); return (b.word || b.libreoffice) ? 'a backend is available on this machine' : undefined })() }, async () => {
    await assert.rejects(
      () => mergeDocxVersions('/base.docx', [{ docxPath: '/rev.docx', authorName: 'A' }], '/out.docx'),
      (e) => { assert.ok(e.message.includes('No merge backend'), e.message); return true }
    )
  })
})
