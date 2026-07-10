const fs = require('fs')
const path = require('path')
const os = require('os')
const { collectFiles, concatenateFiles } = require('../common/specProcessor')
const { MarkdownToDocxConverter } = require('./md2docx')

/**
 * Converts a set of spec files (local or from a git commit) into a DOCX file.
 *
 * This is the high-level conversion pipeline that handles:
 * - Collecting files from the local filesystem or from a git commit
 * - Concatenating them into a single markdown document
 * - Loading CR cover page or front page data
 * - Converting to DOCX via MarkdownToDocxConverter
 *
 * @param {object} opts - Conversion options.
 * @param {string} opts.commit - Git commit ref, or 'local' for working copy.
 * @param {string[]} opts.inputPaths - Absolute paths to spec files/directories.
 * @param {string} opts.specRoot - Absolute spec root path ('' to disable numbering).
 * @param {string|null} opts.mermaidConfig - Mermaid config JSON string.
 * @param {string} opts.tempDir - Directory for temporary files.
 * @param {object|null} [opts.crCoverPageData] - Pre-loaded CR cover page data, or null.
 * @param {object|null} [opts.frontPage] - Pre-built front page DOCX object, or null.
 * @returns {Promise<{docxPath: string, fileCount: number, imageCount: number}>}
 */
async function convertToDocx(opts) {
  let files, content, fileResolver

  if (opts.commit === 'local') {
    files = collectFiles(opts.inputPaths)
    content = concatenateFiles(files, undefined, opts.specRoot)
    fileResolver = null
  } else {
    const { getRepoRoot, extractFilesFromCommit, makeCachedFileResolver, makeCachedTextReader } = require('../common/gitHelpers')
    const repoRoot = getRepoRoot(opts.inputPaths[0])
    const cache = extractFilesFromCommit(repoRoot, opts.commit, opts.inputPaths)

    files = [...cache.keys()]
      .filter(f => f.endsWith('.md') || f.endsWith('.markdown') || f.endsWith('.asn'))
      .sort()
    const textReader = makeCachedTextReader(cache)
    content = concatenateFiles(files, textReader, opts.specRoot)
    fileResolver = makeCachedFileResolver(cache)
  }

  if (!content || !files.length) {
    throw new Error(`No files found for commit "${opts.commit}" in paths: ${opts.inputPaths.join(', ')}`)
  }

  // Write concatenated markdown to a temp file
  fs.mkdirSync(opts.tempDir, { recursive: true })
  const label = opts.commit === 'local' ? 'local' : opts.commit.slice(0, 8)
  const tempMd = path.join(opts.tempDir, `${label}.md`)
  fs.writeFileSync(tempMd, content)

  // Convert to DOCX
  const docxPath = tempMd.replace('.md', '.docx')
  const converter = new MarkdownToDocxConverter(opts.mermaidConfig, opts.specRoot)
  const baseDir = opts.commit === 'local' ? path.dirname(files[0]) : opts.tempDir
  const frontPage = opts.crCoverPageData ? null : (opts.frontPage || null)

  await converter.convert(tempMd, docxPath, baseDir, frontPage, {
    crCoverPageData: opts.crCoverPageData || null,
    fileResolver
  })

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
