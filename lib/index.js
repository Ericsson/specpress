/**
 * SpecPress core library — CJS entry point.
 *
 * Exposes the markdown-to-HTML and markdown-to-DOCX converters,
 * shared utilities, and style definitions for use by the VS Code
 * extension and CLI tools.
 */

const { Md2Html } = require('./md2html/md2html')
const { Md2Docx, buildInlineRuns } = require('./md2docx/md2docx')
const { buildFrontPageDocx } = require('./md2docx/frontPage')
const { buildFrontPageHtml } = require('./md2html/frontPage')
const { HEADING_LEVELS, paragraphStyles, characterStyles, docxStyles } = require('./md2docx/styles/docxStyles')
const { latexToMathML, latexToDocxMath, createEquationParagraph, addEquationToDocOptions } = require('./md2docx/handlers/latexEquationHandler')
const { renderMermaidToSvg, renderMermaidBatch, ensureMermaidBundle, getSvgDimensions, findBrowser } = require('./common/mermaidRenderer')
const { asnToDocxParagraphs, processAsnText, processAsnComment } = require('./md2docx/handlers/asnHandler')
const { jsonToDocxTable, jsonFileToDocxTable } = require('./md2docx/handlers/jsonTableHandler')
const { highlightAsn, extractFirstAsnWord, extractAsnLeadingComments, asnToMarkdown } = require('./md2html/handlers/asnHandler')
const { jsonToHtmlTable, jsonFileToHtmlTable } = require('./md2html/handlers/jsonTableHandler')
const { PARA, DEFAULT_BULLET, ERROR_MARKER, extractText, isJsonTableLink, buildJsonTableIndices, classifyParagraph, collectFiles, concatenateFiles, formatExportMessage, extractSectionNumber, parsePlaceholder, parseCaptionPlaceholder, injectSectionNumbers, injectAllSectionNumbers, insertBreakAfterColon, parseTocRange } = require('./common/specProcessor')
const { VALID_BULLETS, parseBullet } = require('./common/bullets')
const { buildSpanMap, normalizeJsonTable } = require('./common/buildSpanMap')
const { preprocessLatex } = require('./common/latexHelpers')
const { getRepoRoot, collectFilesFromCommit, getGitLog } = require('./common/gitHelpers')

module.exports = {
  // HTML conversion
  Md2Html,
  buildFrontPageHtml,

  // DOCX conversion
  Md2Docx,
  buildInlineRuns,
  buildFrontPageDocx,
  HEADING_LEVELS,
  paragraphStyles,
  characterStyles,
  docxStyles,

  // DOCX handlers
  latexToMathML,
  latexToDocxMath,
  createEquationParagraph,
  addEquationToDocOptions,
  renderMermaidToSvg,
  renderMermaidBatch,
  ensureMermaidBundle,
  getSvgDimensions,
  findBrowser,
  asnToDocxParagraphs,
  processAsnText,
  processAsnComment,
  jsonToDocxTable,
  jsonFileToDocxTable,

  // HTML handlers
  highlightAsn,
  extractFirstAsnWord,
  extractAsnLeadingComments,
  asnToMarkdown,
  jsonToHtmlTable,
  jsonFileToHtmlTable,

  // Common utilities
  PARA,
  DEFAULT_BULLET,
  VALID_BULLETS,
  ERROR_MARKER,
  extractText,
  isJsonTableLink,
  buildJsonTableIndices,
  classifyParagraph,
  collectFiles,
  concatenateFiles,
  formatExportMessage,
  extractSectionNumber,
  parsePlaceholder,
  parseCaptionPlaceholder,
  injectSectionNumbers,
  injectAllSectionNumbers,
  insertBreakAfterColon,
  parseTocRange,
  parseBullet,
  buildSpanMap,
  normalizeJsonTable,
  preprocessLatex,
  getRepoRoot,
  collectFilesFromCommit,
  getGitLog,
}
