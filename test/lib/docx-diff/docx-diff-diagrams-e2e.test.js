/**
 * End-to-end test for DOCX DIFF with mixed diagram/image content.
 *
 * Mirrors docx-diff-e2e.test.js's structure (standalone script, auto-skips
 * without a merge backend) but drives the REAL export pipeline used by
 * export-docx-diff.js (convertToDocx against two git commits, then
 * mergeDocxVersions) against a spec containing:
 *
 *   - a mermaid diagram that is left unchanged between baseline and revision
 *   - a mermaid diagram that IS changed
 *   - an mscgen diagram that is left unchanged
 *   - a PNG image that is left unchanged
 *   - an SVG image that IS changed
 *
 * Only ONE file is passed as the input path (out of two files in the spec),
 * exercising FileResolver's commit-based subset resolution and
 * insertOmittedMarkers at the same time.
 *
 * Expectations after merging base -> revision with tracked changes:
 *   - Unmodified diagrams/images produce NO <w:ins>/<w:del> wrapping around
 *     their <w:drawing> element (same embedded media, no revision marks).
 *   - The modified diagram/image's <w:drawing> elements DO appear inside
 *     <w:ins>/<w:del> (old removed, new added).
 *
 * Auto-skips when neither Word nor LibreOffice is available.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const JSZip = require('jszip')

const { detectBackends, mergeDocxVersions } = require('../../../lib/common/docxMerge')
const { convertToDocx, createTempDir } = require('../../../lib/md2docx/convertToDocx')
const { cacheKey } = require('../../../lib/common/diagramCache')
const { loadMscgenConfig, parseMscgenPreamble, applyMscgenPreamble } = require('../../../lib/common/mscgenConfig')

const backends = detectBackends()
if (!backends.word && !backends.libreoffice) {
  console.log('SKIPPED: DOCX DIFF diagrams/images e2e test requires Microsoft Word or LibreOffice installed')
  process.exit(0)
}
const backend = backends.word ? 'word' : 'libreoffice'

const RED_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
const RED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="red"/></svg>'
const BLUE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="blue"/></svg>'

const MERMAID_UNCHANGED = 'graph TD;\n  A-->B'
const MERMAID_BASELINE = 'graph TD;\n  C-->D'
const MERMAID_REVISION = 'graph TD;\n  C-->D-->E'
const MSCGEN_RAW = 'a: A;\nb: B;\na->b: hello;'

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function seedCache(dir, key, svg) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${key}.svg`), svg)
  fs.writeFileSync(path.join(dir, `${key}.png`), RED_PNG) // any valid-ish PNG bytes as fallback
}

/**
 * Builds a temp git repo with a spec containing one selected file (with the
 * mixed diagram/image content described above) and one unselected file.
 */
function makeRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'specpress-docxdiff-diagrams-'))
  git(repoRoot, ['init', '-q', '-b', 'main'])
  git(repoRoot, ['config', 'user.email', 't@t.com'])
  git(repoRoot, ['config', 'user.name', 't'])
  git(repoRoot, ['config', 'commit.gpgsign', 'false'])

  const specRoot = path.join(repoRoot, 'spec')
  const assetsDir = path.join(specRoot, '01 target', 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.writeFileSync(path.join(assetsDir, 'photo.png'), RED_PNG)
  fs.writeFileSync(path.join(assetsDir, 'diagram.svg'), RED_SVG)

  // target.md lives in its own subdirectory so it can be passed to convertToDocx as
  // inputPaths[0] (a directory — required so getRepoRoot's execFileSync cwd resolves)
  // while still naturally excluding "02 other/other.md" from the selection, exercising
  // the same subset-selection + insertOmittedMarkers path as a real partial export.
  const targetDir = path.join(specRoot, '01 target')
  const targetFile = path.join(targetDir, '00 target.md')
  const otherDir = path.join(specRoot, '02 other')
  fs.mkdirSync(otherDir, { recursive: true })
  const otherFile = path.join(otherDir, '00 other.md')

  const baselineMd = [
    '# Target', '',
    '## Unchanged mermaid diagram', '',
    '```mermaid', MERMAID_UNCHANGED, '```', '',
    'Figure 1: Unchanged mermaid diagram', '',
    '## Modified mermaid diagram', '',
    '```mermaid', MERMAID_BASELINE, '```', '',
    'Figure 2: Modified mermaid diagram', '',
    '## Unchanged mscgen diagram', '',
    '```mscgen', MSCGEN_RAW, '```', '',
    'Figure 3: Unchanged mscgen diagram', '',
    '## Unchanged PNG image', '',
    '![photo](assets/photo.png)', '',
    'Figure 4: Unchanged photo', '',
    '## Modified SVG image', '',
    '![diagram](assets/diagram.svg)', '',
    'Figure 5: Modified SVG diagram', ''
  ].join('\n')

  fs.writeFileSync(targetFile, baselineMd)
  fs.writeFileSync(otherFile, '# Other\n\nUnrelated content in a file that is not selected for export.\n')

  // Commit the diagram cache so the baseline commit can serve the unchanged
  // diagrams/old render of the modified diagram from cache (git archive
  // unpacks this into the commit resolver's own temp dir).
  const cacheDir = path.join(repoRoot, 'cached')
  const unchangedKey = cacheKey(MERMAID_UNCHANGED, '{}')
  const baselineKey = cacheKey(MERMAID_BASELINE, '{}')
  const mscgenConfigJson = loadMscgenConfig(null)
  const mscgenKey = cacheKey(applyMscgenPreamble(MSCGEN_RAW, parseMscgenPreamble(mscgenConfigJson)), mscgenConfigJson)
  seedCache(cacheDir, unchangedKey, '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><text>A to B</text></svg>')
  seedCache(cacheDir, baselineKey, '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><text>C to D</text></svg>')
  seedCache(cacheDir, mscgenKey, '<svg viewBox="0 0 150 80" xmlns="http://www.w3.org/2000/svg"><text>A to B</text></svg>')

  git(repoRoot, ['add', '.'])
  git(repoRoot, ['commit', '-q', '-m', 'baseline'])
  const baseCommit = git(repoRoot, ['rev-parse', 'HEAD'])

  // Revision (also committed, so convertToDocx can target it as a real commit
  // rather than "local" — exercising the same commit-resolver path on both sides):
  // only the "modified" mermaid diagram and the "modified" SVG image change.
  const revisionMd = baselineMd.replace(MERMAID_BASELINE, MERMAID_REVISION)
  fs.writeFileSync(targetFile, revisionMd)
  fs.writeFileSync(path.join(assetsDir, 'diagram.svg'), BLUE_SVG)
  const revisionKey = cacheKey(MERMAID_REVISION, '{}')
  seedCache(cacheDir, revisionKey, '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><text>C to D to E</text></svg>')

  git(repoRoot, ['add', '.'])
  git(repoRoot, ['commit', '-q', '-m', 'revision'])
  const revisionCommit = git(repoRoot, ['rev-parse', 'HEAD'])

  return { repoRoot, specRoot, targetDir, targetFile, baseCommit, revisionCommit }
}

function cleanup(repo) {
  fs.rmSync(repo.repoRoot, { recursive: true, force: true })
  for (const commit of [repo.baseCommit, repo.revisionCommit]) {
    fs.rmSync(path.join(os.tmpdir(), 'specpress-cache', commit), { recursive: true, force: true })
  }
}

/** Returns all paragraph-level blocks of document.xml that contain a <w:drawing>, tagged with whether each is inside <w:ins> or <w:del>. */
function analyzeDrawings(xml) {
  const drawings = []
  // Split on paragraph boundaries is unreliable with nested runs; instead scan each
  // <w:drawing>...</w:drawing> occurrence and check whether it is nested inside an
  // immediately-enclosing <w:ins>/<w:del> run (Word/LibreOffice wrap the whole run,
  // including the drawing, when an image is inserted/deleted).
  const drawingRegex = /<w:drawing>[\s\S]*?<\/w:drawing>/g
  let m
  while ((m = drawingRegex.exec(xml)) !== null) {
    const idx = m.index
    // Look backwards for the nearest enclosing <w:ins ...> or <w:del ...> that has not
    // yet been closed before this point, within a reasonable window.
    const before = xml.substring(Math.max(0, idx - 2000), idx)
    const lastInsOpen = before.lastIndexOf('<w:ins ')
    const lastInsClose = before.lastIndexOf('</w:ins>')
    const lastDelOpen = before.lastIndexOf('<w:del ')
    const lastDelClose = before.lastIndexOf('</w:del>')
    const insideIns = lastInsOpen > lastInsClose
    const insideDel = lastDelOpen > lastDelClose
    drawings.push({ insideIns, insideDel })
  }
  return drawings
}

async function runE2ETest() {
  const repo = makeRepo()
  const tempDir = createTempDir('docxdiff-diagrams')
  try {
    console.log('=== DOCX DIFF Diagrams/Images End-to-End Test ===\n')
    console.log(`Backend: ${backend}\n`)

    // Generate base and revision DOCX via the real convertToDocx pipeline, selecting
    // only the "01 target" subdirectory (subset of the spec) to exercise FileResolver
    // + insertOmittedMarkers — "02 other" is excluded from the selection.
    console.log('Step 1: Generating base and revision DOCX via convertToDocx...')
    const baseResult = await convertToDocx({
      commit: repo.baseCommit,
      inputPaths: [repo.targetDir],
      specRoot: repo.specRoot,
      mermaidConfig: '{}',
      mscgenConfig: loadMscgenConfig(null),
      tempDir
    })
    const revTempDir = path.join(tempDir, 'rev1')
    fs.mkdirSync(revTempDir, { recursive: true })
    const revResult = await convertToDocx({
      commit: repo.revisionCommit,
      inputPaths: [repo.targetDir],
      specRoot: repo.specRoot,
      mermaidConfig: '{}',
      mscgenConfig: loadMscgenConfig(null),
      tempDir: revTempDir
    })
    console.log(`  base: ${baseResult.fileCount} file(s), ${baseResult.imageCount} image(s)`)
    console.log(`  revision: ${revResult.fileCount} file(s), ${revResult.imageCount} image(s)\n`)

    // Step 2: Merge with tracked changes
    console.log('Step 2: Merging via mergeDocxVersions...')
    const outputPath = path.join(tempDir, 'output.docx')
    await mergeDocxVersions(baseResult.docxPath, [
      { docxPath: revResult.docxPath, authorName: 'DiagramAuthor' }
    ], outputPath, { backend, onProgress: (msg) => console.log(`  ${msg}`) })
    console.log('  \u2713 Merge completed\n')

    // Step 3: Inspect document.xml
    console.log('Step 3: Inspecting tracked changes around diagrams/images...')
    const buf = fs.readFileSync(outputPath)
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml').async('string')

    const drawings = analyzeDrawings(xml)
    console.log(`  Found ${drawings.length} <w:drawing> element(s) in merged document`)

    // There should be 6 drawings total: unchanged mermaid, OLD modified mermaid,
    // NEW modified mermaid, unchanged mscgen, unchanged PNG, OLD+NEW modified SVG (2).
    // Exact count depends on backend merge behavior, so assert on relative properties
    // instead of an exact total.
    const trackedDrawings = drawings.filter(d => d.insideIns || d.insideDel)
    const untrackedDrawings = drawings.filter(d => !d.insideIns && !d.insideDel)

    console.log(`  Untracked (unmodified) drawings: ${untrackedDrawings.length}`)
    console.log(`  Tracked (ins/del) drawings: ${trackedDrawings.length}`)

    const errors = []
    // At least the 3 unmodified assets (unchanged mermaid, unchanged mscgen, unchanged
    // PNG) must appear with NO tracked-change wrapping.
    if (untrackedDrawings.length < 3) {
      errors.push(`Expected at least 3 untracked (unmodified) drawings, found ${untrackedDrawings.length}`)
    }
    // At least the 2 modified assets (mermaid, SVG) must produce tracked-change
    // wrapping (old deleted + new inserted = at least 2 tracked drawings, often 4
    // depending on backend merge granularity).
    if (trackedDrawings.length < 2) {
      errors.push(`Expected at least 2 tracked (ins/del) drawings for the modified diagram+image, found ${trackedDrawings.length}`)
    }
    // Both insertions AND deletions should be represented among tracked drawings
    // (not just one direction), confirming old-removed + new-added semantics.
    if (!trackedDrawings.some(d => d.insideDel)) {
      errors.push('Expected at least one drawing marked as deleted (old render removed)')
    }
    if (!trackedDrawings.some(d => d.insideIns)) {
      errors.push('Expected at least one drawing marked as inserted (new render added)')
    }

    console.log(`\n=== Test Results ===\n`)
    const success = errors.length === 0
    if (errors.length > 0) {
      console.log('  Errors:')
      errors.forEach(e => console.log(`    - ${e}`))
    }
    console.log(`\n${success ? '\u2713' : '\u2717'} Overall: ${success ? 'PASSED' : 'FAILED'}`)

    cleanup(repo)
    fs.rmSync(tempDir, { recursive: true, force: true })
    process.exit(success ? 0 : 1)
  } catch (error) {
    console.error(`\n\u2717 Test failed: ${error.message}`)
    console.error(error.stack)
    try { cleanup(repo) } catch (e) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch (e) {}
    process.exit(1)
  }
}

runE2ETest()
