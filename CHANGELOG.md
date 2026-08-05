# Changelog

All notable changes to the SpecPress library will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.4.12] - 2026-08-02

### Fixed

- **HTML DIFF export aborts when CR metadata is invalid** — `export-html-diff.js` used `strict: true` for CR cover page loading, causing the export to fail with `exit 1` when `CRxxxx.json` contains validation errors. Changed to `strict: false` (warning + no cover page) to match the DOCX DIFF behaviour. The CI `export` job now always produces output regardless of CR metadata validity, consistent with the intent that `validate-cr` is the gating check.

## [3.4.11] - 2026-08-02

### Added

- **JUnit XML test report in `validate-cr` CI job** — Validation results are now written as a JUnit XML artifact (`cr-validation.xml`). GitLab renders this in the MR "Tests" tab, showing each check by name and surfacing failure messages (e.g. schema errors) directly on the MR page without requiring the user to open the job log.

### Fixed

- **DOCX DIFF fails with `ENOENT` when revision commit is a symbolic ref (e.g. `HEAD`)** — Two bugs in the DOCX DIFF pipeline, both introduced in the `38171f3` refactoring:
  - `export-docx-diff.js` passed `path.join(tempDir, 'rev1')` etc. as the temp directory for each revision DOCX, but never created those subdirectories with `mkdirSync`. The old `generateDocx` function wrote all files into the same flat `tempDir`; the subdirectory scheme was added during refactoring but the corresponding `mkdirSync` was omitted.
  - `convertToDocx` used the raw commit string (e.g. `HEAD`) as the DOCX filename label and passed it verbatim to `collectFilesFromCommit` and `createCommitResolver`. Symbolic refs now resolved to their full hash via a new `resolveCommit()` helper before any file operations.
- **`resolveCommit()` added to `lib/common/gitHelpers.js`** — New utility that calls `git rev-parse` to expand any ref (symbolic ref, branch name, short hash) to its full 40-character commit hash.

## [3.4.10] - 2026-08-02

### Changed

- **Image scaling syntax changed to GitLab-style `{width= height=}`** — The explicit image size is now specified with a curly-brace attribute block placed directly after the image link instead of the `=WxH` syntax inside the link parentheses:
  - `![alt](image.png){width=300}` — display at 300 pixels wide (height auto-calculated)
  - `![alt](image.png){width=50%}` — display at 50% of the page/body width
  - `![alt](image.png){width=300 height=200}` — explicit width and height in pixels
  - A trailing `px` unit is accepted and ignored (`{width=300px}` ≡ `{width=300}`).

  The image link itself stays a plain `![alt](path)`, so editors such as VS Code keep recognizing the path — rename/refactor (F2), go-to-file and broken-link detection now continue to work. The old `=WxH` syntax (`markdown-it-imsize`) is no longer supported.

### Removed

- **`markdown-it-imsize` dependency** — Replaced by a small self-contained `lib/common/mdImageSize.js` markdown-it plugin shared by the HTML and DOCX paths.

## [3.4.8] - 2026-07-29

### Fixed

- **Embedded images in HTML by default** - Fixed *lib\cli\export-html.js* so that BASE64 embedded images become the default upon HTML export.

## [3.4.7] - 2026-07-29

### Fixed

- **HTML export image tests** — `htmlExportImages.test.js` rewritten to use `exportHtml()` directly (replacing the removed `exportHtmlFromDirectory` method) and extended to cover both the default embedded (data URI) mode and the `embedImages: false` media/ copy mode.
- **Test runner** — e2e tests are now skipped when the unit test batch fails, preventing their summary from hiding unit test failures.

## [3.4.6] - 2026-07-29

### Changed

- **HTML export embeds images by default** — `exportHtml()` now embeds all images as base64 data URIs directly in the HTML file instead of copying them to a `media/` directory. This makes exported HTML files fully self-contained: a single file that renders correctly in any browser regardless of how it is served (e.g. as a GitLab artifact link). The `--embed-images` CLI flag is still accepted but is now a no-op. Pass `embedImages: false` to `exportHtml()` to restore the old `media/` behaviour.

## [3.4.5] - 2026-07-27

### Fixed

- **Mermaid test skip** - If bundle cannot be downloaded, skip the test.

## [3.4.4] - 2026-07-27

### Added

- **Explicit image width** — Images can now be sized explicitly using the `=WxH` syntax after the image URL (provided by `markdown-it-imsize`):
  - `![alt](image.png =300x)` — display at 300 pixels wide, height auto-calculated from aspect ratio
  - `![alt](image.png =50%x)` — display at 50% of the page/body width
  - Respected in both HTML preview/export and DOCX export. The automatic `scaleToFit` logic remains the fallback when no explicit size is given.

### Changed

- **Image scaling refactored** — `getImageDimensions` and `scaleToFit` moved from `md2docx/md2docx.js` to `common/imageUtils.js` for shared use by both HTML and DOCX paths.
- **CSS `img` rule** — Changed from `width: 80%` to `max-width: 100%` so that explicitly sized images are rendered at their specified width rather than being overridden by the stylesheet.

## [3.4.0] - 2026-07-22

### Added

- **MSC-Gen diagram support** — Fenced code blocks tagged `mscgen` are rendered as MSC-Gen sequence, block, or graph diagrams in both HTML and DOCX output.
  - Diagram type is auto-detected (`graph { ... }` → Graphviz DOT) or set explicitly with an `@type=` directive (`signalling`, `block`, `graph`).
  - Configurable preamble (hscale, defstyle) via `lib/css/mscgen-config.json` or a user-supplied config file.
  - Rendered at 2× resolution (PNG) and cached on disk alongside mermaid SVGs.
  - Requires the [msc-generator](https://gitlab.com/msc-generator/msc-generator) CLI tool to be installed.
- **`exportHtml()` library function** (`lib/md2html/exportHtml.js`) — Unified HTML export for both plain and diff output. Handles local files and any git commit/branch/tag as source, resolver-aware image copying to a `media/` directory (two-pass for diffs: deleted images get `_old` suffix), and omitted-section markers. Used by both CLI scripts and SpecPressExt.
- **`htmlDiff()` library function** (`lib/md2html/htmlDiff.js`) — Word-level HTML tracked-changes diff between two versions of a markdown specification. Produces `<ins>`/`<del>` markup with side-by-side display for changed images and diagrams. Used by both the `export-html-diff.js` CLI and SpecPressExt's change tracking preview.
- **`FileResolver` class** (`lib/common/fileResolver.js`) — Unified file access abstraction for local files and git commits. For git commits, unpacks the commit to a persistent temp directory (`os.tmpdir()/specpress-cache/<hash>/`) on first use. Factory functions `createLocalResolver()` and `createCommitResolver()` simplify construction.
- **`diagramRenderers.js`** (`lib/common/diagramRenderers.js`) — Shared cached-render wrappers (`renderMermaidCached`, `renderMscgenCached`) used by both the HTML and DOCX pipelines.
- **`diagramCache.js`** (`lib/common/diagramCache.js`) — Shared caching infrastructure for all diagram types: cache directory resolution, SHA-256 cache key computation, executable discovery, SVG dimension extraction, `renderCached`/`renderCachedAsync` pipelines, unified `cleanupDiagramCache()`, and `scopeSvgIds()` to prevent ID collisions when multiple SVGs are embedded in the same HTML page.
- **`export-html-diff.js` CLI** (`lib/cli/export-html-diff.js`) — New CLI script for generating tracked-changes HTML output between two git versions, with correct image copying to a `media/` directory.
- **LibreOffice merge backend** — Cross-platform alternative to MS Word for DOCX DIFF generation.
- **Automatic author derivation** — When `--authors` is omitted and `--cr-cover-page-data` is provided, the author name is derived automatically from the CR JSON (e.g. `CR0042_Ericsson`).
- **`htmldiff-js` dependency** — Added for word-level HTML diffing in `htmlDiff()`.
- **CI templates** — Individual GitLab CI templates for CR validation (blocks merges with missing/invalid CR metadata) and CR finalization (renames `CRxxxx.json` to `CR####.json` after merge).
- **Architecture documentation** (`documentation/html-export-architecture.md`) — Documents the HTML export call graph and the design rationale for `exportHtml()`.

### Changed

- **Test framework migrated to `node:test`** — All 26 `.test.js` files and the RAN4 TypeScript tests migrated from a custom mini-framework (`let passed/failed`, manual `try/catch`) to Node.js built-in `node:test` (`test()`, `describe()`, `before()`, `after()`). All JS and RAN4 tests now run in a single unified `node --test --import tsx` invocation, producing one combined summary (907 tests). Conditional tests (msc-gen not installed, LibreOffice not installed, Word not installed) use `{ skip: '...' }` instead of silent early returns. `docxExport-e2e.test.js` (fires up MS Word) is excluded from `--quick` mode.

- **`MarkdownToDocxConverter` renamed to `Md2Docx`** — The DOCX converter class is now exported as `Md2Docx` from `lib/md2docx/md2docx.js` and `lib/index.js`. The old name is no longer exported.
- **Mermaid renderer extracted to `lib/common/mermaidRenderer.js`** — `renderMermaidBatch`, `renderMermaidToSvg`, `ensureMermaidBundle`, `findBrowser`, and `buildMermaidPageScript()` moved from `md2docx/handlers/mermaidHandler.js` into a VS Code-free common module. Still exported from `lib/index.js`. `renderMermaidViaWebview`, `renderWithCache`, and `cleanupMermaidCache` removed from the public API (caching is now handled by `diagramRenderers.js`; `renderMermaidViaWebview` lives in SpecPressExt).
- **MSC-Gen renderer extracted to `lib/common/mscgenRenderer.js`** — CLI-based MSC-Gen rendering in a standalone VS Code-free module.
- **`export-docx-diff.js` CLI** — Renamed from `lib/cli/docx-diff.js` for consistency with the other CLI scripts.
- **`lib/cli/docx-export-utils.js` renamed to `lib/cli/cli-utils.js`** — Internal CLI utility module renamed for clarity.
- **HTML export no longer embeds mermaid from CDN** — Mermaid diagrams are rendered to SVG/PNG at export time and referenced as external files, eliminating the CDN dependency and SVG ID collision issues.
- **`Md2Html` constructor** — Now accepts a `fileResolver` option (a `FileResolver` instance) instead of a `resolveImageUri` callback. The resolver's `resolveImageUri` property is set externally by the caller.
- **`getFileFromCommit`, `getBinaryFileFromCommit`, `extractFilesFromCommit` removed** from `lib/common/gitHelpers.js` — superseded by `FileResolver`.
- **`package.json` exports trimmed to single entry point** — All deep-path `exports` entries (e.g. `./lib/common/...`, `./lib/md2docx/...`) removed. Only `"."`, `"./lib/css/*"`, and `"./lib/ran4/*"` remain. All public API is accessed via `require('specpress')` / `lib/index.js`.
- **`export-document` CI job** — The unified CI pipeline now exports both DOCX and HTML (plain or diff) in a single job, sharing all CR detection and version resolution logic. HTML artifact is exposed as a browsable link on the MR/pipeline page via `expose_as`. The job was previously named `export-docx`.

### Removed

- **Individual CI templates** — `ci_templates/individual/` deleted. The unified `ci_templates/.gitlab-ci.yml` covers all use cases; users who need a subset can remove jobs from it directly.

### Fixed

- **Scroll sync with change tracking** — Fixed scroll sync breaking when change tracking was enabled in the live preview.
- **Double front page injection** — Fixed front page being injected twice in certain export paths.
- **vscode-resource URIs leaking into HTML export** — Fixed webview-specific URIs appearing in exported HTML files.
- **Tar parser** — `FileResolver` correctly handles GNU long-name headers, pax headers, ustar prefix, and directory entries when unpacking git commits.
- **File filtering** — DOCX DIFF no longer includes non-spec files (.json, .png) in generated documents.
- **Process hang** — Fixed `setTimeout` never cleared in merge backends, keeping Node.js alive after completion.
- **CR cover page path** — Use `path.resolve()` before passing to loader to fix Windows path normalization.

## [3.2.6] - 2025-07-02

### Added

- **RAN4 Band Combinations library** (`lib/ran4/`) - Library for loading, validating, and rendering 3GPP TS 38.101 band combination data
  - Parse and validate Band (`n*.json`), CA (`CA_*.json`), and DC (`DC_*.json`) JSON files
  - BC_ID parser with properties: intra/inter-band, FR1/FR2, contiguous/non-contiguous, NR only, SUL
  - Schema and content validation with detailed error reporting
  - HTML table rendering for band combinations
  - JSON normalization (canonical key ordering, consistent formatting)
  - CLI tools: `validate-38101.js` and `normalize-json-file.js`

## [3.2.4] - 2026-06-12

### Added

- **CI template** - DOCX export pipeline now automatically includes a cover page:
  - Includes CR cover page when `CRxxxx.json` is detected in the spec root's `history/` folder
  - Includes standard front page when `FRONT_PAGE_DATA` variable is configured
  - No configuration needed for CR cover page — auto-detected from repository content

### Security

- Updated dependencies to fix 4 vulnerabilities: `follow-redirects` (moderate), `linkify-it` (high), `markdown-it` (moderate), `qs` (moderate)

## [3.2.3] - 2026-06-01

### Added

- **.vscode/settings.json** - Settings for indentation and JSON formatting.

### Changed

- **CR Cover Page Schema** - Updated CR cover page JSON schema
  - `Release` field changed from string to integer (minimum: 8)
  - Release number is now displayed with "Rel-" prefix (e.g., 18 → "Rel-18")
  - `CR` field is now optional (shows "-" when absent for draft CRs)
  - CR number shows "-" instead of "0000" when not set
  - `Clauses affected` field now accepts free text (pattern constraint removed)
  - `Work item code` field now accepts any work item codes (enum constraint removed)
  - Work item code descriptions moved to field description for reference
- **CR Cover Page Rendering** - Improved formatting
  - CR number and revision number are now centered in their cells (HTML and DOCX)

## [3.2.2] - 2026-05-28

### Added

- **CR Cover Page** - Automatic Change Request cover page for DOCX and HTML exports
  - Explicit API via `--cr-cover-page-data` CLI parameter or `crCoverPageData` option
  - Draft CR detection: looks for `CRxxxx.json` in `history/` folder
  - Approved CR collection: `collectApprovedCRs()` finds all `CR####.json` files (for future history table)
  - Template-based rendering with placeholder substitution
  - 10-column grid layout for consistent formatting
  - Support for all 3GPP CR metadata fields (CR number, revision, work item codes, etc.)
  - HTML rendering via `lib/md2html/crCoverPageRenderer.js`
  - DOCX rendering via `lib/md2docx/crCoverPageRenderer.js`
  - Clean HTML template in `lib/templates/cr_cover_template.htm`
  - JSON schema for VS Code autocomplete in `lib/templates/CR_COVER_PAGE_SCHEMA.json`
  - Comprehensive validation with detailed error messages
  - Validation function in `lib/common/crCoverPageLoader.js`
  - Data loading helpers with type and range validation
  - New DOCX styles: `CRCoverPage` (Arial 10pt) and `CRSeparator` (Times New Roman 18pt, blue)
  - Takes precedence over standard front page when provided

### Changed

- **Front Page Terminology** - Renamed "cover page" to "front page" throughout codebase
  - `lib/md2html/frontPage.js` (renamed from coverPage.js)
  - `lib/md2docx/frontPage.js` (renamed from coverPage.js)
  - Configuration parameter `frontPageTemplate` and `frontPageData` (old names still work)
  - Backward compatible with existing configurations

## [3.1.2] - 2024-01-10

### Fixed

- Mermaid diagram caching improvements
- Section numbering edge cases

## [3.1.0] - 2024-01-05

### Added

- Mermaid diagram caching with SHA-256 hash-based filenames
- Automatic cleanup of unused cached SVG files
- Front page support with HTML template and JSON data
- CLI commands for HTML and DOCX export
- GitLab CI templates for automated builds

### Changed

- Improved section numbering algorithm
- Better handling of auto-generated folder headings
- Updated dependencies (docx 9.6.1, markdown-it 14.1.1)

### Fixed

- Image scaling in DOCX export (preserve aspect ratio, no upscaling beyond 125 DPI)
- ASN.1 syntax highlighting edge cases
- JsonTable rendering with merged cells

## [3.0.0] - 2023-11-15

### Added

- CommonJS exports for VS Code extension compatibility
- Dual module support (ESM and CommonJS)
- Comprehensive test suite with 50+ tests

### Changed

- **BREAKING**: Reorganized lib/ directory structure
  - `lib/common/` - Shared utilities
  - `lib/md2html/` - HTML renderer
  - `lib/md2docx/` - DOCX converter
  - `lib/cli/` - Command-line tools
- **BREAKING**: Renamed configuration parameters for consistency
- Improved performance with better caching

### Removed

- **BREAKING**: Dropped Node.js 14 support (now requires Node.js 16+)

## [2.5.0] - 2023-10-01

### Added

- JsonTable support with markdown in cells
- LaTeX equation rendering with KaTeX
- ASN.1 file auto-inclusion in multi-file mode
- Figure and table caption detection

### Changed

- Improved bullet list parsing and rendering
- Better handling of nested lists

### Fixed

- Whitespace handling in code blocks
- Hyperlink rendering in DOCX

## [2.0.0] - 2023-08-15

### Added

- Initial public release
- Markdown to HTML conversion with 3GPP styling
- Markdown to DOCX conversion with 3GPP paragraph styles
- Section numbering from folder/file hierarchy
- Mermaid diagram rendering
- ASN.1 syntax highlighting
- PlantUML diagram generation (optional)

### Changed

- Complete rewrite from original internal tool
- Modular architecture with separate HTML and DOCX paths

[3.4.12]: https://github.com/Ericsson/specpress/compare/v3.4.11...v3.4.12
[3.4.11]: https://github.com/Ericsson/specpress/compare/v3.4.10...v3.4.11
[3.4.8]: https://github.com/Ericsson/specpress/compare/v3.4.7...v3.4.8
[3.4.7]: https://github.com/Ericsson/specpress/compare/v3.4.6...v3.4.7
[3.4.6]: https://github.com/Ericsson/specpress/compare/v3.4.5...v3.4.6
[3.4.4]: https://github.com/Ericsson/specpress/compare/v3.4.0...3.4.4
[3.4.0]: https://github.com/Ericsson/specpress/compare/v3.2.6...v3.4.0
[3.2.6]: https://github.com/Ericsson/specpress/compare/v3.2.4...v3.2.6
[3.2.4]: https://github.com/Ericsson/specpress/compare/v3.2.3...v3.2.4
[3.2.3]: https://github.com/Ericsson/specpress/releases/tag/v3.2.3
[3.2.2]: https://github.com/Ericsson/specpress/releases/tag/v3.2.2
[3.1.2]: https://github.com/Ericsson/specpress/releases/tag/v3.1.2
[3.1.0]: https://github.com/Ericsson/specpress/releases/tag/v3.1.0
[3.0.0]: https://github.com/Ericsson/specpress/releases/tag/v3.0.0
[2.5.0]: https://github.com/Ericsson/specpress/releases/tag/v2.5.0
[2.0.0]: https://github.com/Ericsson/specpress/releases/tag/v2.0.0
