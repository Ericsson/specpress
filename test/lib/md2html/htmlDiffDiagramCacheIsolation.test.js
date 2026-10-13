const { test, describe } = require('node:test')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const { exportHtml } = require('../../../lib/md2html/exportHtml')
const { cacheKey } = require('../../../lib/common/diagramCache')

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

const BASELINE_DIAGRAM = 'gitGraph\n  commit id: "baseline-only-commit"'
const CURRENT_DIAGRAM = 'gitGraph\n  commit id: "baseline-only-commit"\n  commit id: "new-local-commit"'

/**
 * Builds a temp git repo with a spec root containing one file with a mermaid
 * diagram, commits it, then locally modifies the diagram (different content —
 * mirrors the real-world bug report of a gitGraph changing between a baseline
 * commit and the local working copy).
 *
 * Returns { repoRoot, specRoot, targetFile, baseCommit }.
 */
function makeDiagramDiffRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'specpress-diagram-cache-isolation-'))
  git(repoRoot, ['init', '-q', '-b', 'main'])
  git(repoRoot, ['config', 'user.email', 't@t.com'])
  git(repoRoot, ['config', 'user.name', 't'])
  git(repoRoot, ['config', 'commit.gpgsign', 'false'])

  const specRoot = path.join(repoRoot, 'spec')
  fs.mkdirSync(specRoot, { recursive: true })

  const targetFile = path.join(specRoot, '01 target.md')
  fs.writeFileSync(targetFile, [
    '# Target',
    '',
    '```mermaid',
    BASELINE_DIAGRAM,
    '```',
    ''
  ].join('\n'))

  git(repoRoot, ['add', '.'])
  git(repoRoot, ['commit', '-q', '-m', 'baseline'])
  const baseCommit = git(repoRoot, ['rev-parse', 'HEAD'])

  // Modify the diagram locally (uncommitted) — different diagram source, so baseline
  // and current render to different SVG/PNG cache keys.
  fs.writeFileSync(targetFile, [
    '# Target',
    '',
    '```mermaid',
    CURRENT_DIAGRAM,
    '```',
    ''
  ].join('\n'))

  return { repoRoot, specRoot, targetFile, baseCommit }
}

function cleanup(repoRoot) {
  fs.rmSync(repoRoot, { recursive: true, force: true })
}

describe('exportHtml — diagram cache isolation across baseline/current in a diff', () => {

  test('a mermaid diagram that changed between the baseline commit and local caches the baseline render into the commit resolver\'s temp dir, not the local cached/ folder', () => {
    const { repoRoot, specRoot, targetFile, baseCommit } = makeDiagramDiffRepo()
    const outputPath = path.join(os.tmpdir(), `specpress-diagram-cache-isolation-out-${Date.now()}.html`)
    const localCacheDir = path.join(repoRoot, 'cached')
    try {
      exportHtml({
        inputPaths: [targetFile],
        outputPath,
        specRoot,
        repoRoot,
        baseCommit,
        compareCommit: 'local',
        embedImages: true,
        mermaidConfig: '{}'
      })

      // The regression this guards against: before the fix, rendering the baseline
      // commit's diagram would always write into `<repoRoot>/cached/` on the real
      // local filesystem — the exact folder that is also the real local diagram cache
      // for the current working copy — making git report a brand-new untracked file
      // that is actually a stale/historical diagram render. After the fix, the
      // baseline-side render must use the commit resolver's own cacheDir (under
      // os.tmpdir()/specpress-cache/<commit>/), so the BASELINE diagram's cache key
      // must never appear in the real local cached/ folder. The CURRENT (local)
      // diagram's cache key legitimately may appear there — that's correct, since
      // the current version really is local content.
      const baselineKey = cacheKey(BASELINE_DIAGRAM, '{}')
      const currentKey = cacheKey(CURRENT_DIAGRAM, '{}')
      assert.notStrictEqual(baselineKey, currentKey, 'sanity check: baseline and current diagrams must hash differently')

      const localCacheEntries = fs.existsSync(localCacheDir) ? fs.readdirSync(localCacheDir) : []
      const leakedBaselineFiles = localCacheEntries.filter(f => f.includes(baselineKey))
      assert.strictEqual(
        leakedBaselineFiles.length, 0,
        `the baseline commit's diagram cache must not leak into the local cached/ folder, found: ${leakedBaselineFiles.join(', ')}`
      )

      // Positive check: the baseline's rendered diagram should actually have been
      // cached in the commit resolver's own temp directory, confirming the render
      // happened (not just that it failed silently) and landed in the right place.
      const resolverCacheDir = path.join(os.tmpdir(), 'specpress-cache', baseCommit, 'cached')
      if (fs.existsSync(resolverCacheDir)) {
        const resolverCacheEntries = fs.readdirSync(resolverCacheDir)
        const baselineInResolverDir = resolverCacheEntries.filter(f => f.includes(baselineKey))
        assert.ok(
          baselineInResolverDir.length > 0,
          `expected the baseline diagram's cache to be found in the commit resolver's temp dir, found entries: ${resolverCacheEntries.join(', ')}`
        )
      }
    } finally {
      cleanup(repoRoot)
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    }
  })

})
