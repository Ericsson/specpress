# Changelog

All notable changes to the SpecPress library will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.5] - 2025-07-02

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

### Fixed

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

[Unreleased]: https://github.com/Ericsson/specpress/compare/v3.2.5...HEAD
[3.2.5]: https://github.com/Ericsson/specpress/compare/v3.2.4...v3.2.5
[3.2.4]: https://github.com/Ericsson/specpress/compare/v3.2.3...v3.2.4
[3.2.3]: https://github.com/Ericsson/specpress/releases/tag/v3.2.3
[3.2.2]: https://github.com/Ericsson/specpress/releases/tag/v3.2.2
[3.1.2]: https://github.com/Ericsson/specpress/releases/tag/v3.1.2
[3.1.0]: https://github.com/Ericsson/specpress/releases/tag/v3.1.0
[3.0.0]: https://github.com/Ericsson/specpress/releases/tag/v3.0.0
[2.5.0]: https://github.com/Ericsson/specpress/releases/tag/v2.5.0
[2.0.0]: https://github.com/Ericsson/specpress/releases/tag/v2.0.0
