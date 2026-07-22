/**
 * SpecPress core library — CJS entry point.
 *
 * Exposes all symbols used by the SpecPress VS Code extension (SpecPressExt).
 * Internal library modules (CLI scripts, handlers, converters) import directly
 * from their respective files and do not go through this entry point.
 */

const { Md2Html } = require('./md2html/md2html')
const { Md2Docx } = require('./md2docx/md2docx')
const { ensureMermaidBundle } = require('./md2docx/handlers/mermaidHandler')
const { exportHtml } = require('./md2html/exportHtml')
const { diffHtml } = require('./md2html/htmlDiff')
const { renderCRCoverPageHTML } = require('./md2html/crCoverPageRenderer')
const { exportCRCoverPageDocx } = require('./md2docx/crCoverPageRenderer')
const { buildMermaidPageScript } = require('./common/mermaidRenderer')
const { renderMermaidCached } = require('./common/diagramRenderers')
const { findMscgen } = require('./common/mscgenRenderer')
const { cleanupDiagramCache } = require('./common/diagramCache')
const { createLocalResolver, createCommitResolver } = require('./common/fileResolver')
const { mergeDocxVersions, detectBackends, findWinword } = require('./common/docxMerge')
const { detectCRCoverPage } = require('./common/crCoverPageDetector')
const { loadCRCoverPageData } = require('./common/crCoverPageLoader')
const { insertOmittedMarkers, collectFiles, concatenateFiles, formatExportMessage, extractSectionNumber, parsePlaceholder, parseCaptionPlaceholder } = require('./common/specProcessor')
const { collectFilesFromCommit, getRepoRoot, getGitLog } = require('./common/gitHelpers')
const { buildSpanMap, normalizeJsonTable } = require('./common/buildSpanMap')
const { preprocessLatex } = require('./common/latexHelpers')

module.exports = {
  // HTML conversion
  Md2Html,
  exportHtml,
  diffHtml,
  renderCRCoverPageHTML,

  // DOCX conversion
  Md2Docx,
  ensureMermaidBundle,
  exportCRCoverPageDocx,

  // Diagram rendering
  buildMermaidPageScript,
  renderMermaidCached,
  findMscgen,
  cleanupDiagramCache,

  // File access
  createLocalResolver,
  createCommitResolver,

  // DOCX merge
  mergeDocxVersions,
  detectBackends,
  findWinword,

  // CR cover page
  detectCRCoverPage,
  loadCRCoverPageData,

  // Common utilities
  insertOmittedMarkers,
  collectFiles,
  concatenateFiles,
  formatExportMessage,
  extractSectionNumber,
  parsePlaceholder,
  parseCaptionPlaceholder,
  buildSpanMap,
  normalizeJsonTable,
  preprocessLatex,
  getRepoRoot,
  collectFilesFromCommit,
  getGitLog,
}
