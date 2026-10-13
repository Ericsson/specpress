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
 * Builds a temp git repo with a spec root containing one markdown file that
 * references an image relative to its own co-located `assets/` folder (the
 * common convention — not relative to specRoot's parent). Commits it, then
 * renames the image file locally (uncommitted), mirroring the real-world bug
 * report: a baseline image that still exists in the baseline commit, but no
 * longer exists at that path in the local working copy because it was
 * renamed/moved as part of unrelated local edits.
 *
 * Returns { repoRoot, specRoot, targetFile, baseCommit }.
 */
function makeRenamedImageRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'specpress-renamed-image-'))
  git(repoRoot, ['init', '-q', '-b', 'main'])
  git(repoRoot, ['config', 'user.email', 't@t.com'])
  git(repoRoot, ['config', 'user.name', 't'])
  git(repoRoot, ['config', 'commit.gpgsign', 'false'])

  const specRoot = path.join(repoRoot, 'spec')
  const fileDir = path.join(specRoot, '03 Section')
  const assetsDir = path.join(fileDir, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.writeFileSync(path.join(assetsDir, 'old_name.png'), RED_PNG)

  const targetFile = path.join(fileDir, '01 target.md')
  fs.writeFileSync(targetFile, [
    '# Target',
    '',
    'This paragraph has some baseline text that will be edited locally,',
    'so this file participates in the diff as a modified file.',
    '',
    '![An unrelated figure](assets/old_name.png)',
    '',
    'Figure x.x.x-1: An unrelated figure',
    ''
  ].join('\n'))

  git(repoRoot, ['add', '.'])
  git(repoRoot, ['commit', '-q', '-m', 'baseline'])
  const baseCommit = git(repoRoot, ['rev-parse', 'HEAD'])

  // Locally (uncommitted): edit the text AND rename the image file — the
  // markdown reference still points at the old filename (mirroring an
  // asset rename elsewhere in the repo without updating every reference,
  // or more directly: the image is simply gone from that exact local path).
  fs.writeFileSync(targetFile, [
    '# Target',
    '',
    'This paragraph has been edited locally to produce a real text diff',
    'so this file participates in the diff as a modified file.',
    '',
    '![An unrelated figure](assets/old_name.png)',
    '',
    'Figure x.x.x-1: An unrelated figure',
    ''
  ].join('\n'))
  fs.renameSync(path.join(assetsDir, 'old_name.png'), path.join(assetsDir, 'new_name.png'))

  return { repoRoot, specRoot, targetFile, baseCommit }
}

function cleanup(repoRoot) {
  fs.rmSync(repoRoot, { recursive: true, force: true })
}

describe('exportHtml — image resolution when a baseline image was renamed locally', () => {

  test('a baseline-only image, referenced relative to its markdown file\'s own assets/ folder, is embedded even though it no longer exists at that local path', () => {
    const { repoRoot, specRoot, targetFile, baseCommit } = makeRenamedImageRepo()
    const outputPath = path.join(os.tmpdir(), `specpress-renamed-image-out-${Date.now()}.html`)
    try {
      exportHtml({
        inputPaths: [targetFile],
        outputPath,
        specRoot,
        repoRoot,
        baseCommit,
        compareCommit: 'local',
        embedImages: true
      })
      const html = fs.readFileSync(outputPath, 'utf8')

      // The baseline image must appear inside a diff-del-block, embedded as a
      // base64 data URI — not left as a raw, unresolved relative path (which
      // would render as a broken/empty figure box, since the HTML file has no
      // base path to resolve a plain relative src against).
      const delBlockMatch = html.match(/<div class="diff-del-block">.*?<\/div>/s)
      assert.ok(delBlockMatch, 'the renamed baseline image should appear in a diff-del-block')
      assert.ok(
        delBlockMatch[0].includes('src="data:image/png'),
        `expected the baseline image to be embedded as a data URI, got: ${delBlockMatch[0].slice(0, 200)}`
      )
      assert.ok(
        !delBlockMatch[0].includes('src="assets/old_name.png"'),
        'the raw unresolved relative path must not leak into the output'
      )
    } finally {
      cleanup(repoRoot)
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    }
  })

  test('the same baseline image resolves correctly in a plain (non-diff) export of the baseline commit alone', () => {
    // Regression guard for the fact that the bug reproduced in BOTH diff and
    // non-diff modes (resolveImagePath is shared code) — verifies the fix
    // covers the non-diff path too.
    const { repoRoot, specRoot, targetFile, baseCommit } = makeRenamedImageRepo()
    const outputPath = path.join(os.tmpdir(), `specpress-renamed-image-baseline-only-${Date.now()}.html`)
    try {
      exportHtml({
        inputPaths: [targetFile],
        outputPath,
        specRoot,
        repoRoot,
        baseCommit,
        compareCommit: null,
        embedImages: true
      })
      const html = fs.readFileSync(outputPath, 'utf8')
      assert.ok(html.includes('src="data:image/png'), 'the baseline-only export should embed the image as a data URI')
      assert.ok(!html.includes('src="assets/old_name.png"'), 'the raw unresolved relative path must not leak into the output')
    } finally {
      cleanup(repoRoot)
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    }
  })

})
