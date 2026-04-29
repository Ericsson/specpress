/**
 * Shared type definitions for the SpecPress extension.
 *
 * This file contains JSDoc @typedef declarations used across modules.
 * Import with: const Types = require('./types') (for documentation only).
 */

/**
 * @typedef {Object} SpecPressConfig
 * @property {string} css - CSS content for HTML preview/export.
 * @property {string} mermaidConfig - Mermaid config JSON string.
 * @property {string} coverPageHtml - Rendered cover page HTML.
 * @property {Object} customRenderers - Map of token type to renderer function string.
 * @property {string} coverPageTemplate - Path to cover page template file.
 * @property {string} coverPageData - Path to cover page data JSON file.
 * @property {string} defaultExportFolder - Default folder for export dialogs.
 * @property {string} multiPagePreviewDefaultPath - Default path for multi-page preview.
 * @property {boolean} deriveSectionNumbers - Whether to derive section numbers.
 * @property {string[]} specRoots - Resolved absolute spec root paths.
 */

/**
 * @typedef {Object} ExtensionState
 * @property {import('vscode').WebviewPanel|null} panel - Singleton webview panel.
 * @property {Object|null} handler - Lazily initialized Md2Html handler.
 * @property {import('vscode').TextEditor|null} currentEditor - Currently previewed editor.
 * @property {import('vscode').Disposable|null} updatePreview - Document change listener.
 * @property {import('vscode').Disposable|null} scrollSync - Scroll position listener.
 * @property {boolean} isMultiFilePreview - Whether current preview shows multiple files.
 * @property {boolean} isEditorScrolling - Guard flag for editor scroll feedback.
 * @property {boolean} isPreviewScrolling - Guard flag for preview scroll feedback.
 * @property {string|null} multiFileContent - Concatenated markdown for multi-file export.
 * @property {string|null} multiFileBaseDir - Base directory of first file in multi-file preview.
 * @property {string[]|null} multiFilePaths - Markdown file paths for image resolution.
 * @property {string[]|null} multiFileAllFiles - All source file paths in multi-file preview.
 * @property {boolean} lastFocusedIsEditor - Whether editor or preview was last focused.
 * @property {import('vscode').Uri[]|null} lastMultiFileUris - URIs from most recent multi-file preview.
 * @property {boolean} isSpecRootPreview - Whether current multi-file preview covers a spec root.
 * @property {{file: string, line: number}|null} restoreScrollTarget - Last single-file position for scroll restore.
 * @property {{file: string|null, line: number}|null} lastContextTarget - Last right-clicked element's source info.
 * @property {string|null} lastExportFolder - Last folder chosen for export in this session.
 * @property {boolean} autoPreviewActive - Whether auto-preview is active.
 */

/**
 * @typedef {Object} WalkContext
 * @property {Set<number>} skipIndices - Token indices to skip during walking.
 * @property {Map<number, string>} fileDirByIndex - Maps token index to file directory.
 * @property {Set<number>} jsonTableIndices - Indices of JsonTable link inline tokens.
 * @property {string} baseDir - Base directory for resolving relative paths.
 * @property {Map<number, string>} [svgByIndex] - Pre-rendered mermaid SVGs by token index.
 * @property {Map<number, Object[]>} [jsonTableByIndex] - Pre-converted JsonTable elements by token index.
 */

/**
 * @typedef {Object} RenderOptions
 * @property {boolean} [forPreview=false] - If true, adds preview-specific annotations.
 * @property {string|null} [baseDir=null] - Base directory for resolving relative image paths.
 * @property {string|null} [filePath=null] - Source file path for section numbering.
 * @property {string|null} [specRootPath=null] - Override spec root for this render.
 * @property {boolean} [includeCoverPage=false] - Whether to include the cover page.
 */

/**
 * @typedef {Object} ExportOptions
 * @property {string} format - Export format ('HTML' or 'DOCX').
 * @property {string} outputPath - Absolute path for the output file.
 * @property {string|null} [commitRef] - Git commit reference, or null for local files.
 * @property {string|null} [shortHash] - Short git hash for labeling.
 */

/**
 * @typedef {Object} InlineRunOptions
 * @property {boolean} [replaceFirstSpace=false] - Replace the first space with a tab.
 * @property {boolean} [replaceFirstColonSpace=false] - Replace the first ": " with ":\t".
 * @property {string} [color] - Text colour for all runs.
 * @property {boolean} [bold] - Inherited bold state from parent context.
 * @property {boolean} [italics] - Inherited italic state from parent context.
 * @property {string} [style] - Character style name.
 * @property {string} [font] - Font family name.
 * @property {number} [size] - Font size in half-points.
 */

module.exports = {}
