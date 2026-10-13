const { test, describe } = require('node:test')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const { exportHtml } = require('../../../lib/md2html/exportHtml')

/** Minimal 1x1 red PNG for test images. */
const RED_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * Builds a temp git repo with a spec root containing two files, commits it, then
 * modifies one file (adding a brand new subsection with an image) and leaves the
 * change uncommitted (so "local" represents the new version).
 *
 * Returns { repoRoot, specRoot, targetFile, baseCommit } — only `targetFile` is
 * selected for export, so the spec root also has a second (unselected) file whose
 * presence triggers insertOmittedMarkers on both sides.
 */
function makeDiffRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'specpress-diff-export-'))
  git(repoRoot, ['init', '-q', '-b', 'main'])
  git(repoRoot, ['config', 'user.email', 't@t.com'])
  git(repoRoot, ['config', 'user.name', 't'])
  git(repoRoot, ['config', 'commit.gpgsign', 'false'])

  const specRoot = path.join(repoRoot, 'spec')
  fs.mkdirSync(specRoot, { recursive: true })
  const assetsDir = path.join(specRoot, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.writeFileSync(path.join(assetsDir, 'old.png'), RED_PNG)
  fs.writeFileSync(path.join(assetsDir, 'new.png'), RED_PNG)

  // Two files in the spec root — only "target.md" will be selected for export, so
  // insertOmittedMarkers has a real gap to mark (the other file is omitted).
  const targetFile = path.join(specRoot, '01 target.md')
  const otherFile = path.join(specRoot, '02 other.md')
  fs.writeFileSync(targetFile, [
    '# Target',
    '',
    '## Existing subsection',
    '',
    'This paragraph exists in both the baseline and the current version unchanged.',
    '',
    '![existing](assets/old.png)',
    ''
  ].join('\n'))
  fs.writeFileSync(otherFile, '# Other\n\nUnrelated content in a file that is not selected for export.\n')

  git(repoRoot, ['add', '.'])
  git(repoRoot, ['commit', '-q', '-m', 'baseline'])
  const baseCommit = git(repoRoot, ['rev-parse', 'HEAD'])

  // Modify the target file locally (uncommitted): add a brand new subsection with a
  // new image — mirrors the real-world bug report (new sections/images not present
  // in the baseline).
  fs.writeFileSync(targetFile, [
    '# Target',
    '',
    '## Existing subsection',
    '',
    'This paragraph exists in both the baseline and the current version unchanged.',
    '',
    '![existing](assets/old.png)',
    '',
    '## A brand new subsection',
    '',
    'This entire subsection did not exist in the baseline at all.',
    '',
    '![brand new figure](assets/new.png)',
    ''
  ].join('\n'))

  return { repoRoot, specRoot, targetFile, baseCommit }
}

function cleanup(repoRoot) {
  fs.rmSync(repoRoot, { recursive: true, force: true })
}

describe('exportHtml — diff with partial selection (omitted-section markers)', () => {

  test('a newly added image (not present in the baseline) is rendered as an insertion, not a leaked placeholder', () => {
    const { repoRoot, specRoot, targetFile, baseCommit } = makeDiffRepo()
    const outputPath = path.join(os.tmpdir(), `specpress-diff-export-out-${Date.now()}.html`)
    try {
      exportHtml({
        inputPaths: [targetFile],
        outputPath,
        specRoot,
        repoRoot,
        baseCommit,
        compareCommit: 'local',
        insertOmitted: true,
        embedImages: true
      })
      const html = fs.readFileSync(outputPath, 'utf8')
      assert.ok(!/IMG_[0-9a-f]{12}/.test(html), 'no raw placeholder ID should leak into the output')
      assert.ok(html.includes('diff-ins-block'), 'the new image/section should be marked as an insertion')
    } finally {
      cleanup(repoRoot)
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    }
  })

  test('the omitted-section marker appears identically on both sides and is not itself shown as a change', () => {
    // Regression test: insertOmittedMarkers was previously applied only to the
    // baseline content, never to the compare (new) content, in diff mode. That made
    // the "=== unmodified sections omitted ===" marker exist on one side only, which
    // htmldiff-js then rendered as a spurious deletion/insertion unrelated to any real
    // edit — and that artifact could visually tangle with genuinely new content placed
    // near it (e.g. a newly added subsection with new images).
    const { repoRoot, specRoot, targetFile, baseCommit } = makeDiffRepo()
    const outputPath = path.join(os.tmpdir(), `specpress-diff-export-out2-${Date.now()}.html`)
    try {
      exportHtml({
        inputPaths: [targetFile],
        outputPath,
        specRoot,
        repoRoot,
        baseCommit,
        compareCommit: 'local',
        insertOmitted: true,
        embedImages: true
      })
      const html = fs.readFileSync(outputPath, 'utf8')
      const markerIdx = html.indexOf('unmodified sections omitted')
      assert.notStrictEqual(markerIdx, -1, 'the omitted-section marker should be present (file is a partial selection)')

      // The marker's own <div> must not be wrapped in <ins> or <del> — i.e. it must be
      // identical (and therefore unchanged) on both sides of the diff.
      const windowStart = Math.max(0, markerIdx - 60)
      const windowEnd = Math.min(html.length, markerIdx + 60)
      const surrounding = html.substring(windowStart, windowEnd)
      assert.ok(!surrounding.includes('<del'), 'the omitted marker must not be rendered as a deletion')
      assert.ok(!surrounding.includes('<ins'), 'the omitted marker must not be rendered as an insertion')
    } finally {
      cleanup(repoRoot)
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    }
  })

})
