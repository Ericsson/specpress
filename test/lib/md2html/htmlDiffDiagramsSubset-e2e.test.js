const { test, describe } = require('node:test')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const { exportHtml } = require('../../../lib/md2html/exportHtml')
const { cacheKey } = require('../../../lib/common/diagramCache')
const { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble } = require('../../../lib/common/mscgenConfig')

/**
 * End-to-end regression test combining several real-world bug scenarios that
 * were previously only covered in isolation (diagram cache isolation, omitted
 * markers, renamed images):
 *
 *  - A spec with two diagram types (mermaid + mscgen) and two image types
 *    (PNG + SVG), where only ONE of each pair is modified between baseline and
 *    local — the other is left byte-identical.
 *  - Only a SUBSET of the spec's files is passed to exportHtml (mirroring a
 *    real "export selection"), so FileResolver + insertOmittedMarkers must
 *    both engage.
 *
 * Diagram/image caches are pre-rendered and committed into git as part of the
 * baseline commit (mirroring the documented workflow of committing `cached/`
 * — see README "Diagram Caching"), and the modified diagram's new render is
 * added to the real local `cached/` folder for the "current" (local) side.
 * This matters because the baseline resolver unpacks `cached/` via
 * `git archive` into its own temp directory (os.tmpdir()/specpress-cache/<commit>),
 * which is a DIFFERENT physical folder than the local `cached/` dir — a cache
 * entry written to one is not visible to the other, exactly as in production.
 *
 * Expectations:
 *  - Unmodified diagrams/images produce no <ins>/<del> markup at all (same
 *    cached SVG rendered once, reused identically on both sides of the diff).
 *  - Modified diagrams/images are marked as both a deletion (old render) and
 *    an insertion (new render).
 *  - The unrelated (non-selected) file is represented only by an omitted
 *    marker, not leaked content.
 */

const RED_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')

const RED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="red"/></svg>'
const BLUE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="blue"/></svg>'

const MERMAID_UNCHANGED = 'graph TD;\n  A-->B'
const MERMAID_BASELINE = 'graph TD;\n  C-->D'
const MERMAID_CURRENT = 'graph TD;\n  C-->D-->E'

const MSCGEN_RAW = 'a: A;\nb: B;\na->b: hello;'

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * Builds a temp git repo with a spec root containing:
 *  - target.md  (selected for export) — references:
 *      - an unchanged mermaid diagram
 *      - a modified mermaid diagram
 *      - an mscgen diagram (unchanged)
 *      - an unchanged PNG image
 *      - a modified SVG image
 *  - other.md   (NOT selected for export) — unrelated content, only present
 *    to make insertOmittedMarkers have a real gap to mark.
 *
 * Returns everything needed to drive exportHtml plus the pre-computed cache
 * keys so assertions can target specific diagram renders.
 */
function makeRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'specpress-diagrams-subset-'))
  git(repoRoot, ['init', '-q', '-b', 'main'])
  git(repoRoot, ['config', 'user.email', 't@t.com'])
  git(repoRoot, ['config', 'user.name', 't'])
  git(repoRoot, ['config', 'commit.gpgsign', 'false'])

  const specRoot = path.join(repoRoot, 'spec')
  const assetsDir = path.join(specRoot, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })

  fs.writeFileSync(path.join(assetsDir, 'photo.png'), RED_PNG)
  fs.writeFileSync(path.join(assetsDir, 'diagram.svg'), RED_SVG)

  const targetFile = path.join(specRoot, '01 target.md')
  const otherFile = path.join(specRoot, '02 other.md')

  const baselineMd = [
    '# Target',
    '',
    '## Unchanged diagram',
    '',
    '```mermaid',
    MERMAID_UNCHANGED,
    '```',
    '',
    'Figure 1: Unchanged mermaid diagram',
    '',
    '## Modified diagram',
    '',
    '```mermaid',
    MERMAID_BASELINE,
    '```',
    '',
    'Figure 2: Modified mermaid diagram',
    '',
    '## MSC-Gen diagram (unchanged)',
    '',
    '```mscgen',
    MSCGEN_RAW,
    '```',
    '',
    'Figure 3: Unchanged mscgen diagram',
    '',
    '## Unchanged PNG image',
    '',
    '![photo](assets/photo.png)',
    '',
    'Figure 4: Unchanged photo',
    '',
    '## Modified SVG image',
    '',
    '![diagram](assets/diagram.svg)',
    '',
    'Figure 5: Modified SVG diagram',
    ''
  ].join('\n')

  fs.writeFileSync(targetFile, baselineMd)
  fs.writeFileSync(otherFile, '# Other\n\nUnrelated content in a file that is not selected for export.\n')

  // Pre-render and commit the diagram cache into git. `git archive` (used by the
  // commit resolver) unpacks this into os.tmpdir()/specpress-cache/<commit>/cached —
  // NOT the real local cached/ folder — so this is the only way the baseline side of
  // the diff can serve these renders from cache instead of live-rendering.
  const cacheDir = path.join(repoRoot, 'cached')
  fs.mkdirSync(cacheDir, { recursive: true })
  const unchangedKey = cacheKey(MERMAID_UNCHANGED, '{}')
  const baselineKey = cacheKey(MERMAID_BASELINE, '{}')
  const configJson = loadMscgenConfig(null)
  const mscgenKey = cacheKey(applyMscgenPreamble(MSCGEN_RAW, parseMscgenPreamble(configJson)), configJson)
  const seedCache = (dir, key, svg) => {
    fs.writeFileSync(path.join(dir, `${key}.svg`), svg)
    fs.writeFileSync(path.join(dir, `${key}.png`), Buffer.from('png'))
  }
  seedCache(cacheDir, unchangedKey, '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><text>A to B</text></svg>')
  seedCache(cacheDir, baselineKey, '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><text>C to D</text></svg>')
  seedCache(cacheDir, mscgenKey, '<svg viewBox="0 0 150 80" xmlns="http://www.w3.org/2000/svg"><text>A to B</text></svg>')

  git(repoRoot, ['add', '.'])
  git(repoRoot, ['commit', '-q', '-m', 'baseline'])
  const baseCommit = git(repoRoot, ['rev-parse', 'HEAD'])

  // Locally (uncommitted): modify only the "modified" diagram and the "modified"
  // SVG image — everything else (unchanged mermaid, mscgen, PNG) stays byte-identical.
  const currentMd = baselineMd.replace(MERMAID_BASELINE, MERMAID_CURRENT)
  fs.writeFileSync(targetFile, currentMd)
  fs.writeFileSync(path.join(assetsDir, 'diagram.svg'), BLUE_SVG)

  // Pre-seed the NEW diagram render into the real local cached/ folder (the "current"
  // side of the diff reads from local disk, not from a git-unpacked temp dir). The
  // unchanged mermaid/mscgen entries are also present here already since cached/ was
  // committed and never removed locally.
  const currentKey = cacheKey(MERMAID_CURRENT, '{}')
  seedCache(cacheDir, currentKey, '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><text>C to D to E</text></svg>')

  return {
    repoRoot, specRoot, targetFile, otherFile, baseCommit,
    cacheKeys: { unchangedKey, baselineKey, currentKey, mscgenKey }
  }
}

function cleanup(repo) {
  fs.rmSync(repo.repoRoot, { recursive: true, force: true })
  fs.rmSync(path.join(os.tmpdir(), 'specpress-cache', repo.baseCommit), { recursive: true, force: true })
}

function runExport(repo) {
  const outputPath = path.join(os.tmpdir(), `specpress-diagrams-subset-out-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  exportHtml({
    inputPaths: [repo.targetFile],
    outputPath,
    specRoot: repo.specRoot,
    repoRoot: repo.repoRoot,
    baseCommit: repo.baseCommit,
    compareCommit: 'local',
    insertOmitted: true,
    embedImages: true,
    mermaidConfig: '{}',
    mscgenConfig: loadMscgenConfig(null)
  })
  const html = fs.readFileSync(outputPath, 'utf8')
  fs.unlinkSync(outputPath)
  return html
}

describe('exportHtml — DIFF with mixed diagrams/images, modified vs unmodified, subset selection', () => {

  test('unmodified mermaid diagram produces no <ins>/<del> markup', () => {
    const repo = makeRepo()
    try {
      const html = runExport(repo)
      const headingIdx = html.indexOf('Unchanged diagram')
      assert.notStrictEqual(headingIdx, -1, 'the unchanged diagram heading should be present')
      const captionIdx = html.indexOf('Unchanged mermaid diagram', headingIdx)
      assert.notStrictEqual(captionIdx, -1, 'the unchanged diagram caption should be present')
      const section = html.substring(headingIdx, captionIdx)
      assert.ok(section.includes('mermaid-figure'), 'the unchanged diagram image should be present')
      assert.ok(!section.includes('diff-ins-block'), 'unchanged diagram must not be wrapped as an insertion')
      assert.ok(!section.includes('diff-del-block'), 'unchanged diagram must not be wrapped as a deletion')
    } finally {
      cleanup(repo)
    }
  })

  test('modified mermaid diagram is shown as both a deletion (old render) and an insertion (new render)', () => {
    const repo = makeRepo()
    try {
      const html = runExport(repo)
      const headingIdx = html.indexOf('Modified diagram')
      assert.notStrictEqual(headingIdx, -1, 'the modified diagram heading should be present')
      const captionIdx = html.indexOf('Modified mermaid diagram', headingIdx)
      assert.notStrictEqual(captionIdx, -1, 'the modified diagram caption should be present')
      const section = html.substring(headingIdx, captionIdx)

      assert.ok(section.includes('diff-del-block'), 'old diagram render should appear as a deletion block')
      assert.ok(section.includes('diff-ins-block'), 'new diagram render should appear as an insertion block')
      const figureCount = (section.match(/mermaid-figure/g) || []).length
      assert.ok(figureCount >= 2, `expected both old and new diagram renders, found ${figureCount} mermaid-figure occurrences`)
    } finally {
      cleanup(repo)
    }
  })

  test('unmodified mscgen diagram produces no <ins>/<del> markup', () => {
    const repo = makeRepo()
    try {
      const html = runExport(repo)
      const headingIdx = html.indexOf('MSC-Gen diagram (unchanged)')
      assert.notStrictEqual(headingIdx, -1, 'the mscgen diagram heading should be present')
      const captionIdx = html.indexOf('Unchanged mscgen diagram', headingIdx)
      assert.notStrictEqual(captionIdx, -1, 'the mscgen diagram caption should be present')
      const section = html.substring(headingIdx, captionIdx)
      assert.ok(section.includes('mscgen-figure'), 'the mscgen diagram image should be present')
      assert.ok(!section.includes('diff-ins-block'), 'unchanged mscgen diagram must not be wrapped as an insertion')
      assert.ok(!section.includes('diff-del-block'), 'unchanged mscgen diagram must not be wrapped as a deletion')
    } finally {
      cleanup(repo)
    }
  })

  test('unmodified PNG image produces no <ins>/<del> markup', () => {
    const repo = makeRepo()
    try {
      const html = runExport(repo)
      const headingIdx = html.indexOf('Unchanged PNG image')
      assert.notStrictEqual(headingIdx, -1, 'the unchanged PNG heading should be present')
      const captionIdx = html.indexOf('Unchanged photo', headingIdx)
      assert.notStrictEqual(captionIdx, -1, 'the unchanged photo caption should be present')
      const section = html.substring(headingIdx, captionIdx)
      assert.ok(section.includes('<img'), 'the unchanged photo should be present')
      assert.ok(!section.includes('diff-ins-block'), 'unchanged photo must not be wrapped as an insertion')
      assert.ok(!section.includes('diff-del-block'), 'unchanged photo must not be wrapped as a deletion')
    } finally {
      cleanup(repo)
    }
  })

  test('modified SVG image is shown as both a deletion (old) and insertion (new)', () => {
    const repo = makeRepo()
    try {
      const html = runExport(repo)
      const headingIdx = html.indexOf('Modified SVG image')
      assert.notStrictEqual(headingIdx, -1, 'the modified SVG heading should be present')
      const captionIdx = html.indexOf('Modified SVG diagram', headingIdx)
      assert.notStrictEqual(captionIdx, -1, 'the modified SVG caption should be present')
      const section = html.substring(headingIdx, captionIdx)
      assert.ok(section.includes('diff-del-block'), 'old SVG should appear as a deletion block')
      assert.ok(section.includes('diff-ins-block'), 'new SVG should appear as an insertion block')
    } finally {
      cleanup(repo)
    }
  })

  test('subset selection: the non-selected file is represented only by an omitted marker, not leaked content', () => {
    const repo = makeRepo()
    try {
      const html = runExport(repo)
      assert.ok(html.includes('unmodified sections omitted'), 'the omitted-section marker should be present since only one of two files was selected')
      assert.ok(!html.includes('Unrelated content in a file that is not selected'), 'content from the non-selected file must not leak into the output')
    } finally {
      cleanup(repo)
    }
  })

  test('subset selection: FileResolver correctly serves the baseline diagram render for the selected file via the commit resolver', () => {
    const repo = makeRepo()
    try {
      runExport(repo)

      // The baseline commit's diagram cache must be resolved from the commit resolver's
      // own unpacked temp dir (populated via git archive from the committed cached/
      // folder), proving the subset-selected file's diagram correctly round-tripped
      // through FileResolver rather than falling back to a live re-render.
      const resolverCacheDir = path.join(os.tmpdir(), 'specpress-cache', repo.baseCommit, 'cached')
      assert.ok(fs.existsSync(resolverCacheDir), 'the commit resolver should have unpacked a cached/ dir for the baseline commit')
      const entries = fs.readdirSync(resolverCacheDir)
      assert.ok(entries.some(f => f.includes(repo.cacheKeys.baselineKey)), 'the baseline diagram render should be available from the commit resolver\'s cache dir')
    } finally {
      cleanup(repo)
    }
  })

})
