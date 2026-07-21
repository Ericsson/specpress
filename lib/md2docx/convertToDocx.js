const fs = require('fs')
const path = require('path')
const os = require('os')
const { collectFiles, concatenateFiles } = require('../common/specProcessor')
const { Md2Docx } = require('./md2docx')
const { createLocalResolver, createCommitResolver } = require('../common/fileResolver')

/**
 * Converts a set of spec files (local or from a git commit) into a DOCX file.
 *
 * This is the high-level conversion pipeline that handles:
 * - Collecting files from the local filesystem or from a git commit
 * - Concatenating them into a single markdown document
 * - Loading CR cover page or front page data
 * - Converting to DOCX via Md2Docx
 *
 * @param {object} opts - Conversion options.
 * @param {string} opts.commit - Git commit ref, or 'local' for working copy.
 * @param {string[]} opts.inputPaths - Absolute paths to spec files/directories.
 * @param {string} opts.specRoot - Absolute spec root path ('' to disable numbering).
 * @param {string|null} opts.mermaidConfig - Mermaid config JSON string.
 * @param {string|null} [opts.mscgenConfig] - MSC-Gen config JSON string.
 * @param {string} opts.tempDir - Directory for temporary files.
 * @param {object|null} [opts.crCoverPageData] - Pre-loaded CR cover page data, or null.
 * @param {object|null} [opts.frontPageData] - Front page JSON data, or null.
 * @returns {Promise<{docxPath: string, fileCount: number, imageCount: number}>}
 */
async function convertToDocx(opts) {
  let files, content

  let resolver
  if (opts.commit === 'local') {
    files = collectFiles(opts.inputPaths)
    content = concatenateFiles(files, undefined, opts.specRoot)
    resolver = null
  } else {
    const { getRepoRoot, collectFilesFromCommit } = require('../common/gitHelpers')
    const repoRoot = getRepoRoot(opts.inputPaths[0])
    resolver = opts.specRoot ? createCommitResolver(repoRoot, opts.specRoot, opts.commit) : null
    files = collectFilesFromCommit(repoRoot, opts.inputPaths, opts.commit)
    content = concatenateFiles(files, (f) => resolver ? resolver.readFile(f, 'utf8') : fs.readFileSync(f, 'utf8'), opts.specRoot)
  }

  if (!content || !files.length) {
    throw new Error(`No files found for commit "${opts.commit}" in paths: ${opts.inputPaths.join(', ')}`)
  }

  // Convert to DOCX
  const label = opts.commit === 'local' ? 'local' : opts.commit.slice(0, 8)
  const docxPath = path.join(opts.tempDir, `${label}.docx`)
  const converterOptions = { mermaidConfig: opts.mermaidConfig, specRootPath: opts.specRoot }
  if (opts.mscgenConfig) converterOptions.mscgenConfig = opts.mscgenConfig
  if (resolver) converterOptions.fileResolver = (f) => resolver.readFile(f)
  if (opts.mermaidRenderer) converterOptions.mermaidRenderer = opts.mermaidRenderer
  const baseDir = opts.commit === 'local' ? path.dirname(files[0]) : opts.tempDir
  const frontPageData = opts.crCoverPageData ? null : (opts.frontPageData || null)

  const converter = new Md2Docx(converterOptions)
  await converter.convert(content, docxPath, baseDir, frontPageData, {
    crCoverPageData: opts.crCoverPageData || null
  })

  // Clean up orphan cache files after local export only
  if (opts.commit === 'local' && opts.specRoot) {
    const { cleanupDiagramCache } = require('../common/diagramCache')
    cleanupDiagramCache(opts.specRoot, { mermaidConfig: opts.mermaidConfig, mscgenConfig: opts.mscgenConfig })
  }

  return { docxPath, fileCount: files.length, imageCount: converter.imageCount }
}

/**
 * Creates a temporary directory with a specpress prefix.
 *
 * @param {string} suffix - Identifier suffix (e.g. 'export', 'diff').
 * @returns {string} Absolute path to the created temp directory.
 */
function createTempDir(suffix) {
  const tempDir = path.join(os.tmpdir(), `specpress-${suffix}-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })
  return tempDir
}

module.exports = { convertToDocx, createTempDir }
