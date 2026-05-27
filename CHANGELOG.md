# Changelog

All notable changes to the SpecPress library will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Ericsson/specpress/compare/v3.1.2...HEAD
[3.1.2]: https://github.com/Ericsson/specpress/releases/tag/v3.1.2
[3.1.0]: https://github.com/Ericsson/specpress/releases/tag/v3.1.0
[3.0.0]: https://github.com/Ericsson/specpress/releases/tag/v3.0.0
[2.5.0]: https://github.com/Ericsson/specpress/releases/tag/v2.5.0
[2.0.0]: https://github.com/Ericsson/specpress/releases/tag/v2.0.0
