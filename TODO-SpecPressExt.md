# TODO: SpecPressExt Updates

After deploying the updated specpress library (with unified SVG/PNG caching for
mermaid and mscgen), the following changes should be made in the
[SpecPressExt](https://github.com/Ericsson/SpecPressExt) repository.

## ✅ Keep the diagram cache warm from VS Code

**DONE** — Implemented via `renderMermaidCached`/`renderMscgenCached` in
`diagramRenderers.js`, `mermaidWebviewRenderer.js` in SpecPressExt, and
`makeMermaidRenderer` in `helpers.js`. Cache is also populated before DOCX
export and cleaned up with a debounced 5s trigger on `.md`/`.asn` save.

~~**Problem**: The `md2html.js` HTML preview now serves mermaid and mscgen diagrams
as pre-rendered SVGs from the `cached/` directory. When running inside VS Code,
if the cache is cold (new/modified diagram), the library falls back to launching
an external Chrome/Edge browser via `renderMermaidBatch`. This works but is
slower and requires an external browser installation.~~

~~**Solution**: SpecPressExt should proactively populate the cache using its
built-in webview renderer (VS Code's integrated Chromium), so the HTML preview
can always serve from cache without needing an external browser.~~

## MSC-Gen support in SpecPressExt

The specpress library now supports `mscgen` code fences. SpecPressExt may need:

- [ ] Pass `mscgenConfig` option to `Md2Html` constructor — `previewManager.js` already calls `config.loadMscgenConfig()`, but `ConfigLoader` does not yet implement that method. Add `loadMscgenConfig()` to `ConfigLoader` (reads `specpress.mscgenConfigFile` setting, falls back to specpress default)
- [ ] Add `--mscgen-config` support to any extension commands that invoke CLI tools
- [ ] Optionally: warn the user if `msc-gen` is not installed when mscgen fences
      are detected (similar to the browser warning for mermaid)

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

## ✅ E2E test coverage for DOCX export (specpress)

**DONE** — `test/lib/md2docx/docxExport-e2e.test.js` covers all items:

- ✅ PNG images are embedded in the DOCX (in word/media/)
- ✅ Mermaid SVG diagrams are embedded (from cache and freshly rendered)
- ✅ Mermaid PNG fallbacks are present alongside SVGs
- ✅ MSC-Gen SVG diagrams are embedded (from cache and freshly rendered)
- ✅ MSC-Gen PNG fallbacks are present
- ✅ Diagram render failure produces raw code in PL style (not a crash)
- ✅ Standard front page is included when frontPageData is provided
- ✅ CR cover page is included when crCoverPageData is provided
- ✅ CR cover page takes precedence over front page
- ✅ No cover page when neither is provided
- ✅ Figure captions get TF style after diagram fences
- ⬜ Section numbering works with x-placeholders (not yet covered)

## ✅ Implement export-html-diff.js in specpress

**DONE** — `lib/md2html/htmlDiff.js` and `lib/cli/export-html-diff.js` are implemented.
`SpecPressExt/diffRenderer.js` is now a thin wrapper that calls `specpress diffHtml()`.

### ✅ Known issue: Scroll sync breaks with change tracking enabled

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


### ✅ E2E tests

**DONE** — `test/lib/md2html/htmlDiff-e2e.test.js` covers:

- ✅ Text changes produce `<ins>` and `<del>` markup
- ✅ Added/removed paragraphs are tracked
- ✅ Added/removed images are shown with diff visualization
- ✅ Added/removed diagrams (mermaid/mscgen) are shown with diff visualization
- ✅ Modified diagrams show old and new versions side by side
- ⬜ Front page changes are tracked (not yet covered)
- ⬜ Section numbering changes don't produce false diffs (not yet covered)
- ⬜ Output HTML is self-contained (images in media/, CSS embedded) (not yet covered)
- ✅ data-source-line attributes survive the diff for scroll sync


## Unified image/diagram URI and file resolution

Largely implemented. `FileResolver` class exists in `lib/common/fileResolver.js`.
`Md2Html` accepts `fileResolver` in its constructor. Preview and DOCX paths use it.

### Remaining inconsistency

- `exportHtmlFromDirectory` still uses a regex-based image copy loop rather than
  routing through `fileResolver`. Git-sourced images in HTML export/diff are not
  yet resolved via the resolver (they silently disappear).

### Remaining steps

- [ ] HTML diff baseline: pass `fileResolver` backed by git cache so baseline images
      are resolved (currently they silently disappear)
- [ ] `exportHtmlFromDirectory`: route image resolution through `fileResolver` instead
      of the current regex + `fs.existsSync` loop
