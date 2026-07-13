# TODO: SpecPressExt Updates

After deploying the updated specpress library (with unified SVG/PNG caching for
mermaid and mscgen), the following changes should be made in the
[SpecPressExt](https://github.com/Ericsson/SpecPressExt) repository.

## Keep the diagram cache warm from VS Code

**Problem**: The `md2html.js` HTML preview now serves mermaid and mscgen diagrams
as pre-rendered SVGs from the `cached/` directory. When running inside VS Code,
if the cache is cold (new/modified diagram), the library falls back to launching
an external Chrome/Edge browser via `renderMermaidBatch`. This works but is
slower and requires an external browser installation.

**Solution**: SpecPressExt should proactively populate the cache using its
built-in webview renderer (VS Code's integrated Chromium), so the HTML preview
can always serve from cache without needing an external browser.

### Implementation steps

1. When a markdown file with mermaid fences is saved/changed, call
   `renderWithCache(codes, config, specRoot, webviewRendererFn)` from
   `mermaidHandler.js`. This will:
   - Skip already-cached diagrams (no re-render needed)
   - Render uncached diagrams via the VS Code webview
   - Write both SVG and PNG to the `cached/` directory

2. The `webviewRendererFn` should wrap `renderMermaidViaWebview(vscode, codes,
   config, bundlePath)` — which the extension already uses for DOCX export.

3. After the cache is updated, trigger a preview refresh. The `md2html.js` fence
   renderer will read the freshly cached SVGs.

### Benefits

- No external Chrome/Edge dependency for live preview in VS Code
- Preview renders instantly from cache (file read, no browser launch)
- Cache stays warm and is committed to git — CI and colleagues benefit too
- Single rendering path for preview, HTML export, and DOCX export

## MSC-Gen support in SpecPressExt

The specpress library now supports `mscgen` code fences. SpecPressExt may need:

- [ ] Pass `mscgenConfig` option to `Md2Html` constructor (for preview rendering)
- [ ] Add `--mscgen-config` support to any extension commands that invoke CLI tools
- [ ] Optionally: warn the user if `msc-gen` is not installed when mscgen fences
      are detected (similar to the browser warning for mermaid)

## Fix image URI handling in SpecPressExt HTML export

When exporting HTML from SpecPressExt, regular images (PNGs) retain their
`vscode-resource` URIs instead of being rewritten to relative `media/` paths.
The export should:

- [ ] Detect `vscode-resource` URIs in `<img src="...">` tags
- [ ] Resolve them back to absolute file paths
- [ ] Copy the files to the `media/` directory and rewrite the URIs

The specpress library's `exportHtmlFromDirectory` already handles this correctly
for CLI exports (it resolves absolute paths and copies to `media/`). The issue is
that SpecPressExt's preview path injects `vscode-resource` URIs via
`resolveImageUri`, and the HTML export captures that output without converting
back.

## Investigate LibreOffice SVG rendering issues

Some mermaid SVGs (particularly flowcharts and gitGraphs) display incorrectly in
LibreOffice Writer. The SVGs look correct in browsers and in Word.

Possible causes to investigate:

- [ ] The mermaid CSS post-processing in the DOCX path (`handleMermaidSvg` in
      md2docx.js) inlines `!important` CSS rules and adjusts `dominant-baseline`/`dy`
      attributes for Word compatibility. These transformations may break
      LibreOffice's SVG renderer.
- [ ] LibreOffice may not support certain SVG features (CSS variables, complex
      selectors, embedded `<style>` blocks).
- [ ] The PNG fallback should be a viable workaround — verify that LibreOffice
      correctly falls back to the PNG when it can't render the SVG.
- [ ] Consider skipping the CSS post-processing entirely and relying on the PNG
      fallback for LibreOffice (since the post-processing is only needed for Word).



## E2E test coverage for DOCX export (specpress)

The HTML export has full E2E tests (htmlExportImages.test.js) verifying that all
images and cover pages are correctly included. The DOCX export needs equivalent
coverage. Build on the existing docx-diff-e2e.test.js framework.

Tests needed for `export-docx.js` (normal DOCX export):

- [ ] PNG images are embedded in the DOCX (in word/media/)
- [ ] Mermaid SVG diagrams are embedded (from cache and freshly rendered)
- [ ] Mermaid PNG fallbacks are present alongside SVGs
- [ ] MSC-Gen SVG diagrams are embedded (from cache and freshly rendered)
- [ ] MSC-Gen PNG fallbacks are present
- [ ] Diagram render failure produces raw code in PL style (not a crash)
- [ ] Standard front page is included when frontPageData is provided
- [ ] CR cover page is included when crCoverPageData is provided
- [ ] CR cover page takes precedence over front page
- [ ] No cover page when neither is provided
- [ ] Figure captions get TF style after diagram fences
- [ ] Section numbering works with x-placeholders

## Implement export-html-diff.js in specpress

Move the core HTML diff logic from SpecPressExt's `diffRenderer.js` to specpress
as `lib/md2html/htmlDiff.js`. Create a CLI wrapper at `lib/cli/export-html-diff.js`.

### Known issue: Scroll sync breaks with change tracking enabled

**FIXED** — `data-source-line` attributes are now preserved through the diff process.

### Known limitation: Renamed/deleted files not detected in change tracking

When a markdown file is renamed, the change tracking shows the old content as
missing and the new content as entirely added (rather than showing just the
heading change). Similarly, deleted files don't appear as deletions in the diff.

Root cause: The baseline content is matched to current files by filename. A renamed
file has a different name, so no baseline match is found.

Approaches considered but not yet implemented:
- Match by directory position + numeric prefix (handles renames within same slot)
- Include all baseline files within spec root (causes false deletions in live preview)
- Scope-aware matching with edge trimming

A clean solution likely requires:
- [ ] Matching at the file-collection level before rendering (not in the diff wrapper)
- [ ] A heuristic that pairs files by content similarity when names don't match
- [ ] Different behavior for full-spec preview (show deletions) vs live preview (don't)

### Architecture

The CLI should follow the same pattern as `export-docx-diff.js`:

```
node lib/cli/export-html-diff.js <inputPaths...> --output <file>
  --base <commit>
  --revisions <commit...>
  [--spec-root <dir>]
  [--mermaid-config <file>]
  [--mscgen-config <file>]
  [--front-page-data <file>]
  [--cr-cover-page-data <file>]
  [--css <file>]
```

Modules:

- `lib/md2html/htmlDiff.js` — Pure function: `diffHtml(opts)`
  - opts.baselineContent (string) — baseline markdown
  - opts.currentContent (string) — current markdown
  - opts.handler (Md2Html) — renderer instance
  - opts.specRoot, opts.frontPageData, opts.crCoverPageData
  - Renders both versions to HTML via `renderBody`
  - Replaces images/diagrams with stable placeholders (hash-based)
  - Runs htmldiff-js for word-level diffing
  - Restores placeholders with diff visualization (added/removed/changed)
  - Returns HTML body with `<ins>`/`<del>` tracked changes
  - Must preserve `data-source-line` annotations for scroll sync

- `lib/cli/export-html-diff.js` — CLI wrapper:
  - Same structure as export-docx-diff.js: parseArgs → validate → run()
  - Extracts baseline from git commit(s)
  - Renders current (local or from git)
  - Calls diffHtml()
  - Wraps result and writes HTML + copies images to media/

- SpecPressExt `diffRenderer.js` — becomes a thin wrapper:
  - Provides baseline content from state.changeTrackingBaseline
  - Calls specpress `diffHtml()` for the actual diff logic
  - No more duplicated rendering/diffing code

### Implementation steps

1. Create `lib/md2html/htmlDiff.js` by extracting from SpecPressExt diffRenderer.js
2. Add `htmldiff-js` as a specpress dependency
3. Create `lib/cli/export-html-diff.js` following export-docx-diff.js pattern
4. Write E2E tests
5. Update SpecPressExt diffRenderer.js to call specpress htmlDiff
6. Fix scroll sync (ensure data-source-line survives the diff process)

### E2E tests needed

- [ ] Text changes produce `<ins>` and `<del>` markup
- [ ] Added/removed paragraphs are tracked
- [ ] Added/removed images are shown with diff visualization
- [ ] Added/removed diagrams (mermaid/mscgen) are shown with diff visualization
- [ ] Modified diagrams show old and new versions side by side
- [ ] Front page changes are tracked
- [ ] Section numbering changes don't produce false diffs
- [ ] Output HTML is self-contained (images in media/, CSS embedded)
- [ ] data-source-line attributes survive the diff for scroll sync


## PRIORITY: Unified image/diagram URI and file resolution

Currently inconsistent handling of images and diagrams across contexts:

### Current inconsistencies

1. **Diagram SVGs use absolute paths** in the HTML renderer, while regular images
   use relative paths. Both work for export but for different reasons.

2. **Git-sourced images are broken** in HTML diff/preview. When rendering baseline
   content from a git commit, images referenced by that markdown don't exist on
   disk (they're in the commit, not the working copy). They silently disappear.

3. **URI resolution logic is scattered** across: image token renderer, fence
   renderer, renderBody post-processing, exportHtmlFromDirectory regex.

### Design for unified handling

**Core concept: `fileResolver`**

A single function `(path) => Buffer|string|null` that resolves file paths to
content. The Md2Html instance accepts it in the constructor (same as
MarkdownToDocxConverter already does for DOCX).

- For local files: `fileResolver = null` (uses filesystem directly)
- For git baseline: `fileResolver = makeCachedFileResolver(gitCache)`
- For preview: `fileResolver = null` (local files via filesystem)

**Image path strategy:**

All image sources (regular PNGs, mermaid SVGs, mscgen SVGs) output as
**relative paths** from the rendered HTML. The fence renderer outputs paths
relative to the spec root's parent (where `cached/` lives).

**URI transformation (final step):**

| Context | Input (relative path) | Output |
|---|---|---|
| Export (CLI) | `cached/abc123.svg` | → copied to `media/`, rewritten to `media/abc123.svg` |
| Export (CLI) | `assets/test.png` | → copied to `media/`, rewritten to `media/test.png` |
| Preview (VS Code) | `cached/abc123.svg` | → `resolveImageUri(absPath)` → `vscode-webview://...` |
| DOCX | `cached/abc123.svg` | → read via fileResolver, embedded as ImageRun |
| HTML diff (baseline) | `assets/old.png` | → read via fileResolver(gitCache), embedded as data URI or placeholder |

### Implementation steps

1. Make diagram fence renderers output **relative** paths (relative to spec root parent)
2. Add `fileResolver` option to Md2Html constructor
3. Image token renderer: use fileResolver to check existence (instead of fs.existsSync)
4. exportHtmlFromDirectory: resolve relative paths using baseDir, copy to media/
5. HTML diff baseline: pass fileResolver backed by git cache
6. Update resolveImageUri post-processing to resolve relative → absolute → webview URI
7. Remove absolute path logic from diagram fence renderers
