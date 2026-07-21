# SpecPress Pipeline Analysis: HTML and DOCX Generation

This document maps the full call flows for both the HTML and DOCX export pipelines,
identifies structural inconsistencies, and evaluates whether the current design is
reasonable or could be simplified.

---

## 1. Entry Points

Both pipelines share the same two entry points:

| Entry point | Pipeline |
|---|---|
| `cli/export-html.js` | HTML (CLI) |
| `cli/export-docx.js` | DOCX (CLI) |
| `Md2Html.renderMarkdown()` | HTML (VS Code preview) |
| `Md2Html.exportHtmlFromDirectory()` | HTML (VS Code export) |
| `convertToDocx()` | DOCX (VS Code export, via `docx-export-utils.js`) |

---

## 2. HTML Pipeline

### 2.1 Call Flow — CLI Export

```mermaid
flowchart TD
    A["export-html.js: run()"] --> B["loadMermaidConfig(path?)"]
    A --> C["loadMscgenConfig(path?)"]
    A --> D["loadCrCoverPage(path?)"]
    A --> E["loadFrontPage(path?)"]
    A --> F["new Md2Html({ css, mermaidConfig, mscgenConfig, specRootPath })"]
    F --> G["Md2Html.exportHtmlFromDirectory(inputDir, outputDir, { frontPageData, crCoverPageData })"]
    G --> H["collectFiles(inputDir) → string[]"]
    G --> I["concatenateFiles(files) → markdown string"]
    G --> J["Md2Html.renderMarkdownForExport(content, specRootPath=null, frontPageData, crCoverPageData)"]
    J --> K["Md2Html.renderBody(content, forPreview=false, baseDir=null, filePath=null, specRootPath, frontPageData, crCoverPageData)"]
    K --> L["md.parse(content, env) → tokens[]"]
    K --> M["_preprocessTokens(tokens, env, specRoot, filePath)"]
    M --> M1["buildJsonTableIndices(tokens)"]
    M --> M2["injectAllSectionNumbers(tokens, specRoot, filePath)"]
    M --> M3["insertBreakAfterColon (Annex headings)"]
    K --> N["_assignHeadingIds(tokens) → headings[]"]
    K --> O["_resolvePlaceholders(tokens, env, headings, specRoot)"]
    O --> O1["TOC: build nav HTML, replace tokens"]
    O --> O2["CR history: renderCRHistoryTableHTML(specRoot)"]
    K --> P["md.renderer.render(tokens, options, env) → htmlBody"]
    P --> P1["fence rule: renderMermaidFence(token, attrs, env)"]
    P1 --> P1a["renderMermaidCached([code], config, specRoot)"]
    P1a --> P1b["renderCached({ codes, config, specRoot, renderFn })"]
    P1b --> P1c["renderMermaidBatch(codes, config)  ← if not cached"]
    P --> P2["fence rule: renderMscgenFence(token, attrs, env)"]
    P --> P3["paragraph_open rule: classifyParagraph(tokens, idx, jsonTableIndices)"]
    P --> P4["link_open rule: jsonToHtmlTable(data, renderFn)"]
    K --> Q["_postProcessHtml(htmlBody, env, opts)"]
    Q --> Q1["renderCRCoverPageHTML(crCoverPageData)  ← if CR"]
    Q --> Q2["buildFrontPageHtml(frontPageData)  ← if front page"]
    J --> R["Md2Html.wrapHtml(htmlBody) → full HTML document"]
    G --> S["image copy loop: rewrite src to media/*, copy files"]
    G --> T["fs.writeFileSync(index.html)"]
```

### 2.2 Call Flow — VS Code Preview

```mermaid
flowchart TD
    A["SpecPressExt: previewCommand"] --> B["new Md2Html({ css, mermaidConfig, mscgenConfig, specRootPath, resolveImageUri, extraHeadContent, fileResolver })"]
    B --> C["Md2Html.renderMarkdown(content, baseDir, filePath, specRootPath, frontPageData, crCoverPageData)"]
    C --> D["Md2Html.renderBody(content, forPreview=true, baseDir, filePath, specRootPath, ...)"]
    D --> E["md.parse → tokens"]
    D --> F["_preprocessTokens"]
    D --> G["_assignHeadingIds"]
    D --> H["_resolvePlaceholders"]
    D --> I["_annotateForPreview(tokens, env)  ← preview-only step"]
    D --> J["md.renderer.render → htmlBody"]
    J --> J1["image rule: resolveImageUri(absPath) → webview URI"]
    D --> K["_postProcessHtml (cover pages, FILE comment removal)"]
    C --> L["Md2Html.wrapHtml(htmlBody, extraHeadContent) → full HTML"]
```

### 2.3 Key `env` object passed through rendering

The `env` object is the primary side-channel for passing context into markdown-it renderer rules:

| Field | Set by | Used by |
|---|---|---|
| `_baseDir` | `renderBody`, updated by `html_block` FILE rule | `link_open` (JsonTable), `image` rule |
| `_mermaidConfig` | `renderBody` (from `this.mermaidConfig`) | `mermaidFenceHtml.renderMermaidFence` |
| `_mscgenConfig` | `renderBody` (from `this.mscgenConfig`) | `mscgenFenceHtml.renderMscgenFence` |
| `_specRootPath` | `renderBody` | `mermaidFenceHtml` (cache path), `_resolvePlaceholders` |
| `_resolveUris` | `renderBody` | `image` rule |
| `_forPreview` | `_annotateForPreview` | `fence` rule (ASN.1 line annotations) |
| `_jsonTableIndices` | `_preprocessTokens` | `paragraph_open` rule, `_resolvePlaceholders` |
| `_skipLinkTokens` | `link_open` rule | `text` rule, `link_close` rule |

---

## 3. DOCX Pipeline

### 3.1 Call Flow — CLI Export

```mermaid
flowchart TD
    A["export-docx.js: run()"] --> B["loadMermaidConfig(path?)"]
    A --> C["loadMscgenConfig(path?)"]
    A --> D["loadCrCoverPage(path?)"]
    A --> E["loadFrontPage(path?)"]
    A --> F["createTempDir('export')"]
    A --> G["convertToDocx({ commit, inputPaths, specRoot, mermaidConfig, mscgenConfig, tempDir, crCoverPageData, frontPageData })"]
    G --> H{"commit === 'local'?"}
    H -- yes --> I["collectFiles(inputPaths) → files[]"]
    I --> J["concatenateFiles(files, undefined, specRoot) → markdown"]
    H -- no --> K["getRepoRoot(inputPaths[0])"]
    K --> L["createCommitResolver(repoRoot, specRoot, commit) → resolver"]
    L --> M["collectFilesFromCommit(repoRoot, inputPaths, commit) → files[]"]
    M --> N["concatenateFiles(files, resolver.readFile, specRoot) → markdown"]
    G --> O["fs.writeFileSync(tempMd, content)"]
    G --> P["new MarkdownToDocxConverter(mermaidConfig, specRoot, mermaidRenderer=null, fileResolver, { mscgenConfig, cacheDir })"]
    G --> Q["converter.convert(tempMd, docxPath, baseDir, frontPageData, { crCoverPageData })"]
    Q --> R["fs.readFileSync(tempMd) → markdown"]
    Q --> S["md.parse(markdown, { _baseDir }) → tokens"]
    Q --> T["injectAllSectionNumbers(tokens, specRootPath)"]
    Q --> U["walkTokens(tokens, baseDir)"]
    U --> V["beforeWalk(tokens, ctx)"]
    V --> V1["renderMermaidCached(codes, config, specRoot, null, cacheDir)"]
    V1 --> V1a["renderCached({ codes, config, specRoot, renderFn, cacheDir })"]
    V1a --> V1b["renderMermaidBatch(codes, config)  ← if not cached"]
    V --> V2["renderMscgenCached(codes, config, specRoot, null, cacheDir)"]
    V --> V3["jsonToDocxTable(data)  ← pre-scan JsonTable links"]
    U --> W["token dispatch loop"]
    W --> W1["exportHeading / exportParagraph / exportNote / ..."]
    W --> W2["handlePreScanned → handleMermaidSvg / handleMscgenSvg"]
    W --> W3["exportImage → readFile(imagePath)"]
    Q --> X["build Document sections (front page / CR cover / body)"]
    X --> X1["renderCRCoverPageDOCX(crCoverPageData)  ← if CR"]
    X --> X2["buildFrontPageDocx(frontPageData)  ← if front page"]
    Q --> Y["Packer.toBuffer(doc) → buffer"]
    Q --> Z["fs.writeFileSync(docxPath, buffer)"]
    G --> AA["cleanupDiagramCache(specRoot, { mermaidConfig, mscgenConfig })  ← local only"]
```

### 3.2 VS Code DOCX Export

The VS Code extension calls `convertToDocx()` directly (same function as CLI), but
injects a `mermaidRenderer` via `MarkdownToDocxConverter` constructor. The renderer
is `makeMermaidRenderer(vscode, context)` from `SpecPressExt/src/vscode/helpers.js`,
which calls `renderMermaidViaWebview()` instead of `renderMermaidBatch()`.

```mermaid
flowchart TD
    A["SpecPressExt: exportDocxCommand"] --> B["convertToDocx(opts)"]
    B --> C["new MarkdownToDocxConverter(mermaidConfig, specRoot, mermaidRenderer, fileResolver, opts)"]
    C --> D["converter.convert(...)"]
    D --> E["beforeWalk → renderMermaidCached(codes, config, specRoot, mermaidRenderer, cacheDir)"]
    E --> F{"cache hit?"}
    F -- yes --> G["return cached SVG from disk"]
    F -- no --> H["mermaidRenderer(codes)  ← VS Code webview path"]
    H --> I["renderMermaidViaWebview(vscode, codes, config, bundlePath)"]
    I --> J["createWebviewPanel → render mermaid.js → postMessage results"]
```

---

## 4. Shared Infrastructure

Both pipelines share these modules from `lib/common/`:

```mermaid
flowchart LR
    HTML["Md2Html"] --> SP["specProcessor.js\n(collectFiles, concatenateFiles,\nclassifyParagraph, injectAllSectionNumbers,\ninsertOmittedMarkers, ...)"]
    DOCX["MarkdownToDocxConverter"] --> SP
    HTML --> DC["diagramCache.js\n(renderCached, cacheKey,\nsvgCacheDir, getSvgDimensions)"]
    DOCX --> DC
    HTML --> MC["mermaidConfig.js\n(loadMermaidConfig)"]
    DOCX --> MC
    DOCX --> FR["fileResolver.js\n(FileResolver, createCommitResolver)"]
```

---

## 5. Consistency Analysis

### 5.1 What is consistent ✓

- **Paragraph classification**: both pipelines call `classifyParagraph()` from `specProcessor.js` — single source of truth.
- **Section number injection**: both call `injectAllSectionNumbers()` before rendering.
- **Annex heading line break**: both call `insertBreakAfterColon()` for `h1` Annex headings.
- **Diagram caching**: both use `renderCached()` / `renderCachedAsync()` from `diagramCache.js`.
- **Cache key**: both use `cacheKey(code, config)` — SHA-256 of `code + '\0' + config`.
- **File collection**: both use `collectFiles()` / `concatenateFiles()` from `specProcessor.js`.
- **Cover page precedence**: CR cover page takes precedence over front page in both pipelines.

### 5.2 Inconsistencies and structural issues ✗

#### (a) `concatenateFiles` called without `specRoot` in HTML export

In `Md2Html.exportHtmlFromDirectory()`:
```js
const content = concatenateFiles(files)   // no specRoot → no folder headings
```
In `convertToDocx()` (DOCX):
```js
content = concatenateFiles(files, undefined, opts.specRoot)  // specRoot passed
```
The HTML export silently omits auto-generated folder headings. This is probably
unintentional — the `specRootPath` is available on `this.specRootPath` but not
forwarded to `concatenateFiles`.

#### (b) `renderMarkdownForExport` passes `specRootPath=null` instead of `this.specRootPath`

```js
// exportHtmlFromDirectory:
let html = this.renderMarkdownForExport(content, null, frontPageData, crCoverPageData)
//                                              ^^^^
// renderMarkdownForExport then calls renderBody with specRootPath=null
// renderBody: effectiveSpecRoot = specRootPath !== null ? specRootPath : this.specRootPath
```
This actually works correctly because `renderBody` falls back to `this.specRootPath`
when `null` is passed. But it is confusing — the caller explicitly passes `null`
when it could just omit the argument or pass `this.specRootPath` directly.

#### (c) `MarkdownToDocxConverter` constructor has positional parameters instead of an options object

```js
new MarkdownToDocxConverter(mermaidConfig, specRootPath, mermaidRenderer, fileResolver, options)
```
Four positional parameters before the options bag. Compare with `Md2Html` which uses
a clean single options object. The DOCX constructor is harder to call correctly
(easy to accidentally swap `mermaidRenderer` and `fileResolver`) and harder to extend.

#### (d) `convert()` re-reads the markdown file from disk

`convertToDocx()` writes the concatenated markdown to a temp file, then `convert()`
reads it back:
```js
fs.writeFileSync(tempMd, content)          // write
// ...
const markdown = readFileSync(markdownPath, 'utf-8')  // read back
```
This write-then-read round-trip through the filesystem is unnecessary. The content
string is already in memory. The `convert()` method could accept the markdown string
directly (or as an alternative overload), avoiding the temp file entirely for the
content (though the temp file is still needed for the output DOCX path).

#### (e) `injectAllSectionNumbers` called twice in the DOCX path

In `convertToDocx()` → `convert()`:
```js
// convert():
injectAllSectionNumbers(tokens, this.specRootPath)   // ← called here
await this.walkTokens(tokens, baseDir)
```
But `concatenateFiles()` already embeds `<!-- FILE: ... -->` markers, and
`injectAllSectionNumbers` handles multi-file mode via those markers. This is
correct and only called once — but the call is inside `convert()` which is
also called directly from tests, so the placement is intentional. No actual
double-call issue, but worth noting that the HTML pipeline does this in
`_preprocessTokens` (a named step), while DOCX does it inline in `convert()`.

#### (f) `mermaidFenceHtml.js` imports from `md2docx/handlers/mermaidHandler.js`

```js
// mermaidFenceHtml.js (HTML handler):
const { renderMermaidCached, getSvgDimensions } = require('../../md2docx/handlers/mermaidHandler')
```
The HTML handler reaches into the DOCX handler module. This creates a
cross-layer dependency: `md2html/` → `md2docx/`. The shared functions
(`renderMermaidCached`, `getSvgDimensions`) belong in `common/` or
`common/diagramCache.js` (where `getSvgDimensions` already lives).
`renderMermaidCached` is a thin wrapper around `renderCached` from `diagramCache.js`
and could live there too.

#### (g) `ctx` object in DOCX `walkTokens` is an ad-hoc bag

The walk context object is assembled inline:
```js
const ctx = { skipIndices, fileDirByIndex, jsonTableIndices, baseDir }
// then augmented in beforeWalk:
ctx.svgByIndex = ...
ctx.mscgenSvgByIndex = ...
ctx.jsonTableByIndex = ...
```
This is a reasonable pattern but the shape is implicit. A documented type or
class would make it clearer what `ctx` contains and what each `export*` method
can expect.

#### (h) `mermaidConfig` type inconsistency

- `Md2Html` constructor: `options.mermaidConfig` is a JSON string (or loaded via `loadMermaidConfig`).
- `MarkdownToDocxConverter` constructor: `mermaidConfig` is also a JSON string, but documented as `string|null`.
- `renderMermaidBatch(codes, mermaidConfig)`: receives the JSON string.
- `renderMermaidCached(codes, config, specRoot, renderFn, cacheDir)`: parameter named `config` (not `mermaidConfig`).
- `renderCached(opts)`: `opts.config` is the JSON string.

The name oscillates between `mermaidConfig` and `config` across the call chain.
Not a bug, but adds cognitive load.

---

## 6. Parameter Bundling Opportunities

The pipelines pass many related parameters individually. Several natural groupings emerge:

### 6.1 `RenderContext` — shared rendering configuration

Currently scattered across constructor options and `env`:

```js
// Candidate bundle:
{
  mermaidConfig,   // JSON string
  mscgenConfig,    // JSON string
  specRootPath,    // absolute path
  cacheDir,        // absolute path or null
}
```
Used by: `Md2Html` constructor, `MarkdownToDocxConverter` constructor,
`renderMermaidCached`, `renderMscgenCached`, `convertToDocx`.

### 6.2 `CoverPageOptions` — front page / CR cover page

```js
// Candidate bundle:
{
  frontPageData,      // object | null
  crCoverPageData,    // object | null
}
```
Currently passed as two separate parameters through:
`exportHtmlFromDirectory` → `renderMarkdownForExport` → `renderBody` → `_postProcessHtml`
and
`convertToDocx` → `converter.convert` → `convert()`

The two are mutually exclusive (CR takes precedence), so bundling them makes
the precedence rule easier to enforce in one place.

### 6.3 `WalkContext` (DOCX only) — already partially bundled

The `ctx` object in `walkTokens` is a good start. Making its shape explicit
(e.g. with a JSDoc typedef) would improve readability without requiring a class.

---

## 7. Summary of Findings

| # | Issue | Severity | Location |
|---|---|---|---|
| a | `concatenateFiles` called without `specRoot` in HTML export | Bug / inconsistency | `md2html.js:exportHtmlFromDirectory` |
| b | `renderMarkdownForExport` passes `null` for `specRootPath` unnecessarily | Confusing | `md2html.js:exportHtmlFromDirectory` |
| c | `MarkdownToDocxConverter` uses positional params instead of options object | Design | `md2docx.js` constructor |
| d | Write-then-read round-trip for markdown content via temp file | Inefficiency | `convertToDocx.js` + `md2docx.js:convert` |
| e | `injectAllSectionNumbers` placement differs between HTML and DOCX | Inconsistency | `md2html.js:_preprocessTokens` vs `md2docx.js:convert` |
| f | `mermaidFenceHtml.js` imports from `md2docx/` (cross-layer dependency) | Architecture | `md2html/handlers/mermaidFenceHtml.js` |
| g | `ctx` shape in `walkTokens` is implicit / undocumented | Readability | `md2docx.js:walkTokens` / `beforeWalk` |
| h | `mermaidConfig` vs `config` naming inconsistency across call chain | Readability | multiple files |

The most impactful fixes would be **(a)** (actual behavioral difference between
HTML and DOCX), **(d)** (unnecessary I/O), and **(f)** (architectural boundary
violation). The others are readability/maintainability improvements.
