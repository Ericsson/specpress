# Headless DOCX DIFF Generation

This document describes the plan for adding DOCX DIFF generation to the specpress library, enabling tracked-changes comparisons to be produced from CLI and CI pipelines — using either Microsoft Word or LibreOffice as the merge backend.

## Motivation

The DOCX DIFF feature currently lives in SpecPressExt and depends on:

- VS Code UI (commit picker, progress notifications)
- Microsoft Word via a VBScript (`merge-multi-version.vbs`) for merging tracked changes

Moving all core logic into specpress:

- Makes it usable from CLI and CI pipelines (with Word or LibreOffice)
- Keeps related functionality in one place
- Reduces SpecPressExt to a thin UI shell that collects parameters and delegates

## Current Architecture (SpecPressExt)

The existing flow in `compareDocx.js`:

1. User selects 2–5 git versions via VS Code QuickPick
2. For each version: extract files from git → concatenate → render mermaid → generate DOCX
3. Invoke VBScript that automates MS Word's `MergeDocuments` API to produce tracked changes
4. Save final DOCX with multi-author attribution

Key functions involved:

| Function | Location | VS Code dependency |
|---|---|---|
| `extractFilesFromCommit` | `SpecPressExt/src/vscode/helpers.js` | No |
| `makeCachedFileResolver` / `makeCachedTextReader` | `SpecPressExt/src/vscode/compareDocx.js` | No |
| `insertOmittedMarkers` | `SpecPressExt/src/vscode/helpers.js` | No |
| `collectFilesFromCommit` | `specpress/lib/common/gitHelpers.js` | No |
| `concatenateFiles` | `specpress/lib/common/specProcessor.js` | No |
| `MarkdownToDocxConverter` | `specpress/lib/md2docx/md2docx.js` | No |
| `renderMermaidBatch` (headless browser) | `specpress/lib/md2docx/handlers/mermaidHandler.js` | No |
| `merge-multi-version.vbs` | `SpecPressExt/scripts/` | No (requires MS Word) |
| `findWinword` | `SpecPressExt/src/utils/winword.js` | No |
| `pickCommit`, `showExportNotification` | `SpecPressExt/src/vscode/helpers.js` | **Yes** |

## Proposed Architecture

### Unified Merge API: `lib/common/docxMerge.js`

A single module with a backend-agnostic interface. Both MS Word and LibreOffice backends live here, with automatic detection and explicit override.

The API separates the **baseline** (the document against which all changes are tracked) from the **revisions** (documents that introduce tracked changes, each attributed to a named author):

```js
/**
 * Merges a baseline DOCX with one or more revisions into a tracked-changes document.
 *
 * @param {string} baseDocx - Path to the baseline DOCX (the "original" version).
 * @param {Array<{docxPath: string, authorName: string}>} revisions
 *   Ordered array of revisions. Each entry introduces tracked changes attributed
 *   to the given author. MS Word supports N revisions; LibreOffice supports 1 initially.
 * @param {string} outputPath - Where to save the final merged DOCX.
 * @param {object} [options]
 * @param {'auto'|'word'|'libreoffice'} [options.backend='auto'] - Merge backend.
 *   'auto' tries Word first (Windows), then LibreOffice.
 * @param {string} [options.wordPath] - Explicit path to winword.exe.
 * @param {string} [options.libreofficePath] - Explicit path to soffice executable.
 * @param {boolean} [options.debug=false] - Keep intermediate temp files.
 * @param {function} [options.onProgress] - Progress callback: (message: string) => void.
 * @returns {Promise<void>}
 */
async function mergeDocxVersions(baseDocx, revisions, outputPath, options = {}) { }

/**
 * Detects available merge backends on the current system.
 *
 * @returns {{word: string|null, libreoffice: string|null}}
 *   Paths to detected executables, or null if not found.
 */
function detectBackends() { }
```

This separation makes the semantics explicit: `baseDocx` is the reference point, `revisions` are the changes. There is no ambiguity about ignored fields.

The `onProgress` callback allows SpecPressExt to pipe status messages into VS Code's progress notification, while CLI callers can log to stdout.

#### MS Word backend

- Moves the existing `merge-multi-version.vbs` into `specpress/lib/scripts/`
- Moves `findWinword()` into `lib/common/docxMerge.js` (or a local helper)
- Supports N revisions (no upper limit in principle)
- Windows only

#### LibreOffice backend

- Uses a Python-UNO script (`lib/scripts/merge_tracked_changes.py`) invoked via `soffice --headless`
- Calls LibreOffice's `compareDocuments` UNO API
- Initially supports 1 revision (single comparison); multi-revision support can be added later using the same backward-merge strategy
- Cross-platform (Linux, macOS, Windows)

### Functions to move into specpress

**→ `lib/common/gitHelpers.js`:**

| Function | Description |
|---|---|
| `extractFilesFromCommit(repoRoot, commit, searchPaths)` | Bulk-extracts files via `git archive` + tar parsing. Returns `Map<absolutePath, Buffer\|string>`. |
| `makeCachedFileResolver(cache)` | Creates a binary file resolver from the cache (for image resolution). |
| `makeCachedTextReader(cache)` | Creates a UTF-8 text reader from the cache (for `concatenateFiles`). |

**→ `lib/common/specProcessor.js`:**

| Function | Description |
|---|---|
| `insertOmittedMarkers(content, selectedFiles, allFiles)` | Inserts `<!-- OMITTED -->` markers where gaps exist between selected files. |

**→ `lib/common/docxMerge.js`:**

| Function | Description |
|---|---|
| `mergeDocxVersions(versions, outputPath, options)` | Unified merge API (see above). |
| `detectBackends()` | Detects Word and/or LibreOffice installations. |

**→ `lib/scripts/`:**

| File | Description |
|---|---|
| `merge-multi-version.vbs` | Moved from SpecPressExt. MS Word merge via VBScript. |
| `merge_tracked_changes.py` | New. LibreOffice merge via Python-UNO. |

### CLI entry point: `lib/cli/docx-diff.js`

```
node lib/cli/docx-diff.js <inputPaths...> --output <file> \
  --base <commit> \
  --revisions <commit1> [<commit2> ...] \
  --authors <author1> [<author2> ...] \
  [--spec-root <dir>] \
  [--omitted-markers] \
  [--backend auto|word|libreoffice] \
  [--mermaid-config <file>] \
  [--front-page-data <file>] \
  [--cr-cover-page-data <file>]
```

Use `local` as a commit identifier to use the current working copy instead of a git commit.

The `--authors` array must have the same length as `--revisions`. Each author name is attributed to the tracked changes introduced by the corresponding revision.

Pipeline steps:

1. Resolve repo root from input paths
2. Generate baseline DOCX from `--base` commit (or `local`):
   - Extract files via `extractFilesFromCommit` (or read from disk)
   - `concatenateFiles` with optional `insertOmittedMarkers`
   - Convert to DOCX via `MarkdownToDocxConverter` (mermaid via headless browser)
3. Generate DOCX for each revision (same process)
4. Call `mergeDocxVersions(baseDocx, revisions, outputPath)` to produce the tracked-changes DOCX
5. Clean up temp files

### Manual Testing (CLI)

To test the DOCX DIFF functionality locally (e.g. on a Linux machine with LibreOffice), clone the specpress repo on the `libreoffice-docx-diff` branch and run the CLI from within your specification repository.

#### Full pipeline (markdown → DOCX → merge)

This simulates what the CI pipeline does: generates DOCX from markdown sources for both versions, then merges them with tracked changes.

```bash
# Clone specpress and install dependencies
git clone -b libreoffice-docx-diff https://github.com/Ericsson/specpress.git /tmp/specpress
cd /tmp/specpress && npm install && cd -

# From within your specification repository:
cd /path/to/your/spec-repo

# Find the merge-base (where your CR branch diverged from main)
BASE=$(git merge-base HEAD origin/main)

# Generate DOCX DIFF comparing the merge-base against the current working copy
node /tmp/specpress/lib/cli/docx-diff.js \
  specification/ \
  --output diff-output.docx \
  --base "$BASE" \
  --revisions local \
  --authors "CR changes" \
  --backend libreoffice \
  --spec-root specification/ \
  --cr-cover-page-data specification/history/CRxxxx.json
```

Key options:

- `--revisions local` — uses the current working copy as the "after" version (no need to commit first)
- `--revisions HEAD` — uses the latest commit (working copy must be clean)
- `--base` — any git ref: a commit hash, `HEAD~5`, a tag, or the output of `git merge-base`
- `--backend libreoffice` — forces LibreOffice (omit to auto-detect)
- `--cr-cover-page-data` — path to the CR JSON file for the cover page (omit for no cover page)
- `--front-page-data` — path to the front page JSON (used when `--cr-cover-page-data` is absent)

#### Merge step only (two existing DOCX files)

If you already have two DOCX files and just want to test the LibreOffice merge in isolation:

```bash
# Using LibreOffice's bundled Python (has UNO bindings)
/usr/lib/libreoffice/program/python \
  /tmp/specpress/lib/scripts/merge_tracked_changes.py \
  base.docx revision.docx output.docx "Author Name"
```

Alternatively, if `soffice --python` is supported (LibreOffice 7.4+):

```bash
soffice --headless --invisible --python \
  /tmp/specpress/lib/scripts/merge_tracked_changes.py \
  base.docx revision.docx output.docx "Author Name"
```

The script prints `Success` on stdout when the merge completes. The output DOCX will contain tracked changes (insertions/deletions) attributed to the given author name.

#### Prerequisites

- **Node.js 16+** — for the CLI and DOCX generation
- **LibreOffice Writer** — `apt install libreoffice-writer` (Debian/Ubuntu) or equivalent
- **Chrome/Chromium** — only needed if your spec contains mermaid diagrams (`apt install chromium`)
- **git** — for extracting files from commits

On Ubuntu/Debian, a minimal install for testing:

```bash
apt-get install -y git libreoffice-writer chromium-browser
export CHROME_BIN=$(which chromium-browser)
```

### Refactored SpecPressExt

After the move, `SpecPressExt/src/vscode/compareDocx.js` becomes a thin UI wrapper that:

1. Collects user input via VS Code UI (commit picker, author names, save dialog)
2. Generates DOCX files for each version (using webview mermaid renderer)
3. Calls `mergeDocxVersions(baseDocx, revisions, outputPath, { backend: 'auto', onProgress })` from specpress
4. Shows the result notification

The extension can pass `onProgress: (msg) => progress.report({ message: msg })` to get live status in the VS Code notification.

## What stays in SpecPressExt

| Function/Feature | Reason |
|---|---|
| `pickCommit` | VS Code QuickPick UI |
| `showExportNotification` | VS Code notification API |
| `makeMermaidRenderer` (webview variant) | Uses VS Code webview for faster rendering |
| `generateCRFilename` | UI-adjacent formatting |
| DOCX generation orchestration for each version | Uses webview mermaid renderer; delegates to specpress converter |

Note: The DOCX *generation* step (per version) still happens in SpecPressExt when running inside VS Code, because it benefits from the webview-based mermaid renderer which is faster than the headless browser. The CLI path uses `renderMermaidBatch` (headless Chrome/Edge) which is already in specpress.

## Backend Comparison

| Aspect | MS Word | LibreOffice |
|---|---|---|
| Platform | Windows only | Cross-platform |
| Max revisions | Unlimited (backward merge) | 1 initially, extensible |
| Invocation | VBScript via `cscript` | Python-UNO via `soffice --headless` |
| CI suitability | Windows runners with Office | Any runner with `libreoffice-writer` |
| Output quality | Native Word tracked changes | Compatible tracked changes |
| Detection | Registry lookup (`winword.exe`) | Common paths (`/usr/bin/soffice`, etc.) |

## LibreOffice Merge: Technical Notes

- **Comparison API**: `XDocumentComparison.compareDocuments()` or the dispatch command `.uno:CompareDocuments`
- **Author attribution**: Set `RedlineAuthor` property on the document before comparison
- **Multi-revision merge** (future): Same backward strategy as VBScript — merge base with r1, then result with r2, etc.
- **CI compatibility**: `soffice --headless` runs without a display server (no X11 needed)
- **Detection paths**: `/usr/bin/soffice`, `/usr/bin/libreoffice`, `C:\Program Files\LibreOffice\program\soffice.exe`, `/Applications/LibreOffice.app/Contents/MacOS/soffice`

## CI Pipeline Integration

### Unified Pipeline (recommended)

The `ci_templates/.gitlab-ci-unified.yml` template auto-detects whether to produce a DOCX DIFF or a normal export:

- If `{SPEC_ROOT}/history/CRxxxx.json` exists → **DOCX DIFF** with tracked changes against the merge-base of the current branch and the release branch, including the CR cover page.
- If `CRxxxx.json` does not exist → **normal DOCX export** with the specification front page.

The target branch for the merge-base is derived from the `Release` field in `CRxxxx.json`:

1. Read `Release` from `CRxxxx.json` (e.g. `19`)
2. Construct branch name `Rel-19`
3. Verify it exists on the remote (`git ls-remote`)
4. If not found (or `Release` is absent), fall back to `main`

```yaml
# Just copy .gitlab-ci-unified.yml to your repo as .gitlab-ci.yml and set:
variables:
  SPEC_INPUT_DIR: "specification"
  SPEC_ROOT: "specification"
  SPEC_NUMBER: "38413"
  FRONT_PAGE_DATA: "specification/front-page.json"  # for non-CR exports
```

The pipeline uses `git merge-base HEAD origin/Rel-{N}` to determine where the CR branch diverged, ensuring the DOCX DIFF shows exactly the changes introduced by the CR.

### With LibreOffice (Linux)

```yaml
docx-diff:
  image: node:18
  before_script:
    - apt-get update && apt-get install -y libreoffice-writer git
    - npm install specpress
  script:
    - node node_modules/specpress/lib/cli/docx-diff.js specification/
        --output diff.docx
        --spec-root specification/
        --base HEAD~1
        --revisions HEAD
        --authors "Latest changes"
        --backend libreoffice
  artifacts:
    paths:
      - diff.docx
```

### With MS Word (Windows runner)

```yaml
docx-diff:
  tags: [windows]
  before_script:
    - npm install specpress
  script:
    - node node_modules/specpress/lib/cli/docx-diff.js specification/
        --output diff.docx
        --spec-root specification/
        --base HEAD~3
        --revisions HEAD~1 HEAD
        --authors "Intermediate changes" "Latest changes"
        --backend word
  artifacts:
    paths:
      - diff.docx
```

## Test Migration Plan

The following tests move from SpecPressExt to specpress alongside the code they cover.

### Tests to move

| Current location (SpecPressExt) | Target (specpress) | What it tests |
|---|---|---|
| `test/vscode/helpers.test.js` (insertOmittedMarkers section) | `test/lib/common/insertOmittedMarkers.test.js` | All 14 insertOmittedMarkers unit tests |
| `test/docx-diff/docx-diff-e2e.test.js` | `test/lib/docx-diff/docx-diff-e2e.test.js` | Full e2e: generate DOCX → merge via Word → validate tracked changes |
| `test/docx-diff/verify-docx-diff-lib.js` | `test/lib/docx-diff/verify-docx-diff-lib.js` | Shared DOCX XML extraction and validation logic |
| `test/docx-diff/verify-docx-diff.js` | `test/lib/docx-diff/verify-docx-diff.js` | Standalone verification script |
| `test/docx-diff/generate-docx.js` | `test/lib/docx-diff/generate-docx.js` | DOCX generation from markdown fixtures |
| `test/docx-diff/test-v1.md` through `test-v4.md` | `test/lib/docx-diff/test-v1.md` through `test-v4.md` | Markdown fixtures for e2e test |
| `test/docx-diff/README.md` | `test/lib/docx-diff/README.md` | Test documentation |

### Tests that stay in SpecPressExt

| File | Reason |
|---|---|
| `test/vscode/helpers.test.js` (formatExportTimestamp section) | Tests VS Code-specific helper |
| `test/vscode/diffRenderer.test.js` | Tests the VS Code live preview change tracking (HTML diff), not the DOCX DIFF |
| `test/vscode/crFilename.test.js` | Tests `generateCRFilename` which stays in SpecPressExt |

### Adaptations needed for moved tests

- **e2e test**: Update `require` paths (VBScript path changes from `../../scripts/` to `../../lib/scripts/`). Replace `findWinword` import with the new `detectBackends` from `docxMerge.js`.
- **insertOmittedMarkers test**: Remove the `vscode` mock (no longer needed since the function moves to specpress). Remove `formatExportTimestamp` tests from this file.
- **verify-docx-diff-lib.js**: No changes needed (pure Node.js, no VS Code dependency).

### New tests to add in specpress

After the refactoring, the following components need new test coverage:

| Component | Test file | Coverage needed |
|---|---|---|
| `extractFilesFromCommit` | `test/lib/common/gitHelpers.test.js` | Tar parsing, file filtering by extension, path normalization, handling of missing paths in commit |
| `makeCachedFileResolver` | `test/lib/common/gitHelpers.test.js` | Cache hit, cache miss (fallback to fs), case-insensitive path matching |
| `makeCachedTextReader` | `test/lib/common/gitHelpers.test.js` | Buffer-to-string conversion, cache hit/miss |
| `mergeDocxVersions` (Word) | `test/lib/docx-diff/docxMerge-word.test.js` | Correct VBScript invocation args, error handling (Word not found, VBScript failure), debug mode temp file retention |
| `mergeDocxVersions` (LibreOffice) | `test/lib/docx-diff/docxMerge-libre.test.js` | Correct soffice invocation, error handling (LibreOffice not found), Python script args |
| `detectBackends` | `test/lib/common/docxMerge.test.js` | Detection on Windows (registry), detection on Linux (common paths), both missing |
| `docx-diff.js` CLI | `test/lib/docx-diff/cli.test.js` | Argument parsing, version/author count mismatch error, missing repo error, `local` keyword handling |

### Test coverage analysis after refactoring

| Component | Current coverage | After refactoring |
|---|---|---|
| `insertOmittedMarkers` | ✅ 14 unit tests (SpecPressExt) | ✅ Same tests, moved to specpress |
| `extractFilesFromCommit` | ❌ No unit tests (only exercised by e2e) | ⚠️ Needs new unit tests |
| `makeCachedFileResolver/TextReader` | ❌ No unit tests (only exercised by e2e) | ⚠️ Needs new unit tests |
| VBScript merge (Word) | ✅ e2e test with 4 versions | ✅ Same e2e, moved to specpress |
| LibreOffice merge | ❌ Does not exist yet | ⚠️ Needs new e2e test |
| `mergeDocxVersions` unified API | ❌ Does not exist yet | ⚠️ Needs unit tests for dispatch logic |
| `detectBackends` | ❌ Does not exist yet | ⚠️ Needs unit tests |
| CLI argument parsing | ❌ Does not exist yet | ⚠️ Needs unit tests |
| DOCX generation per version | ✅ Covered by existing md2docx tests | ✅ No change needed |
| Mermaid rendering (headless) | ✅ Covered by mermaidDocx.test.js | ✅ No change needed |
| `collectFilesFromCommit` | ❌ No unit tests | ⚠️ Pre-existing gap (consider adding) |
| `concatenateFiles` | ✅ Covered by specProcessor tests | ✅ No change needed |

### Testing the `extractFilesFromCommit` function

This function uses `git archive` which requires a real git repository. The unit test should:

1. Create a temporary git repo with known files
2. Make a commit
3. Call `extractFilesFromCommit` and verify the returned Map contains expected paths and content
4. Verify filtering (only `.md`, `.asn`, `.json`, image extensions are extracted)
5. Verify that non-existent paths in the commit are handled gracefully

### Testing the LibreOffice backend

Similar to the existing Word e2e test pattern:

1. Skip if LibreOffice is not installed (`soffice --version` check)
2. Generate 2 DOCX files from markdown fixtures
3. Call `mergeDocxVersions(base, [{docxPath, authorName}], output, {backend: 'libreoffice'})`
4. Extract `word/document.xml` from output and validate tracked changes exist
5. Clean up temp files

This test would be tagged as slow/optional (like the Word e2e test) and skipped in `test:quick` mode.

### Test runner integration

Specpress uses `node scripts/run-tests.js` which discovers `*.test.js` files. The moved tests will be auto-discovered at their new locations. The e2e test should:

- Auto-skip when Word is not installed (existing behavior, preserved)
- Be excluded from a future `test:quick` mode in specpress (if added)
- Print clear skip messages explaining the requirement

## Implementation Order

1. ~~Move `extractFilesFromCommit`, `makeCachedFileResolver`, `makeCachedTextReader` → `lib/common/gitHelpers.js`~~ ✅
2. ~~Move `insertOmittedMarkers` → `lib/common/specProcessor.js`~~ ✅
3. ~~Move tests: `insertOmittedMarkers` unit tests → `test/lib/common/insertOmittedMarkers.test.js`~~ ✅
4. ~~Move `merge-multi-version.vbs` → `lib/scripts/merge-multi-version.vbs`~~ ✅
5. ~~Move `findWinword` → `lib/common/docxMerge.js`~~ ✅
6. ~~Create `lib/common/docxMerge.js` with unified API + Word backend~~ ✅
7. ~~Move e2e test suite → `test/lib/docx-diff/` (adapt paths, use new API)~~ ✅
8. ~~Add unit tests for `extractFilesFromCommit`, `makeCachedFileResolver`, `makeCachedTextReader`~~ ✅
9. ~~Add unit tests for `detectBackends` and `mergeDocxVersions` dispatch logic~~ ✅
10. ~~Create `lib/scripts/merge_tracked_changes.py` (Python-UNO script)~~ ✅
11. ~~Add LibreOffice backend to `lib/common/docxMerge.js`~~ ✅
12. ~~Add LibreOffice e2e test (auto-skipped when not installed)~~ ✅
13. ~~Create `lib/cli/docx-diff.js` (CLI orchestrator)~~ ✅
14. ~~Add CLI argument parsing tests~~ ✅
15. ~~Add CI templates (`ci_templates/.gitlab-ci-docx-diff.yml`)~~ ✅
16. ~~Refactor SpecPressExt's `compareDocx.js` to delegate to `mergeDocxVersions`~~ ✅
17. ~~Remove moved code from SpecPressExt (VBScript, `findWinword`, `extractFilesFromCommit`, `insertOmittedMarkers`, e2e tests)~~ ✅
18. ~~Update SpecPressExt's `helpers.test.js` to remove `insertOmittedMarkers` tests (now in specpress)~~ ✅
