#!/usr/bin/env node
/**
 * CLI for generating a tracked-changes DOCX from multiple git versions.
 *
 * Usage:
 *   node lib/cli/export-docx-diff.js <inputPaths...> --output <file>
 *     --base <commit>
 *     --revisions <commit1> [<commit2> ...]
 *     --authors <author1> [<author2> ...]
 *     [--spec-root <dir>]
 *     [--omitted-markers]
 *     [--backend auto|word|libreoffice]
 *     [--mermaid-config <file>]
 *     [--front-page-data <file>]
 *     [--cr-cover-page-data <file>]
 *
 * Use "local" as a commit identifier to use the current working copy.
 */
const fs = require('fs')
const path = require('path')
const { loadMermaidConfig, checkBrowser, loadCrCoverPage, loadFrontPage, convertToDocx, createTempDir } = require('./docx-export-utils')
const { loadMscgenConfig } = require('../common/mscgenConfig')

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = { inputPaths: [], revisions: [], authors: [] }

  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '--output') { opts.output = args[++i]; i++; continue }
    if (a === '--base') { opts.base = args[++i]; i++; continue }
    if (a === '--spec-root') { opts.specRoot = args[++i]; i++; continue }
    if (a === '--backend') { opts.backend = args[++i]; i++; continue }
    if (a === '--mermaid-config') { opts.mermaidConfig = args[++i]; i++; continue }
    if (a === '--mscgen-config') { opts.mscgenConfig = args[++i]; i++; continue }
    if (a === '--front-page-data') { opts.frontPageData = args[++i]; i++; continue }
    if (a === '--cr-cover-page-data') { opts.crCoverPageData = args[++i]; i++; continue }
    if (a === '--omitted-markers') { opts.omittedMarkers = true; i++; continue }
    if (a === '--revisions') {
      i++
      while (i < args.length && !args[i].startsWith('--')) opts.revisions.push(args[i++])
      continue
    }
    if (a === '--authors') {
      i++
      while (i < args.length && !args[i].startsWith('--')) opts.authors.push(args[i++])
      continue
    }
    if (!a.startsWith('--')) { opts.inputPaths.push(a); i++; continue }
    console.error(`Unknown option: ${a}`)
    process.exit(1)
  }
  return opts
}

function validate(opts) {
  const errors = []
  if (!opts.inputPaths.length) errors.push('At least one input path is required')
  if (!opts.output) errors.push('--output is required')
  if (!opts.base) errors.push('--base is required')
  if (!opts.revisions.length) errors.push('At least one --revisions entry is required')
  if (opts.authors.length && opts.authors.length !== opts.revisions.length) {
    errors.push(`--authors count (${opts.authors.length}) must match --revisions count (${opts.revisions.length})`)
  }
  return errors
}

function deriveCRAuthor(crCoverPageDataFile) {
  if (!crCoverPageDataFile) return null
  const absPath = path.resolve(crCoverPageDataFile)
  if (!fs.existsSync(absPath)) return null
  try {
    const data = JSON.parse(fs.readFileSync(absPath, 'utf8'))
    const crNum = data.CR ? 'CR' + String(data.CR).padStart(4, '0') : 'CRxxxx'
    const sources = data['Source to WG'] || data['Source to TSG']
    if (Array.isArray(sources) && sources.length > 0) return `${crNum}_${sources[0]}`
    return crNum
  } catch (e) {
    return null
  }
}

async function run() {
  const opts = parseArgs(process.argv)
  const errors = validate(opts)
  if (errors.length) {
    console.error('Usage: node lib/cli/export-docx-diff.js <inputPaths...> --output <file> --base <commit> --revisions <commit...> --authors <name...>')
    errors.forEach(e => console.error(`  ERROR: ${e}`))
    process.exit(1)
  }

  checkBrowser()

  // Default authors: derive from CR data if available, else use revision identifiers
  if (!opts.authors.length) {
    const crAuthor = deriveCRAuthor(opts.crCoverPageData)
    opts.authors = opts.revisions.map(() => crAuthor || 'Author')
  }

  const inputPaths = opts.inputPaths.map(p => path.resolve(p))
  const specRoot = opts.specRoot ? path.resolve(opts.specRoot) : ''
  const outputPath = path.resolve(opts.output)
  const mermaidConfig = loadMermaidConfig(opts.mermaidConfig)
  const mscgenConfig = loadMscgenConfig(opts.mscgenConfig)

  // Load cover pages (CLI layer: lenient mode logs warnings, doesn't exit)
  const crCoverPageData = loadCrCoverPage(opts.crCoverPageData, { strict: false })
  const frontPageData = crCoverPageData ? null : loadFrontPage(opts.frontPageData, { strict: false })

  const tempDir = createTempDir('docx-diff')

  try {
    // Generate base DOCX
    console.log(`Generating base DOCX from "${opts.base}"...`)
    const baseResult = await convertToDocx({
      commit: opts.base,
      inputPaths,
      specRoot,
      mermaidConfig,
      mscgenConfig,
      tempDir,
      crCoverPageData,
      frontPageData
    })
    console.log(`  ${opts.base === 'local' ? 'local' : opts.base.slice(0, 8)}: ${baseResult.fileCount} file(s), ${baseResult.imageCount} image(s)`)

    // Generate revision DOCX files
    const revisions = []
    for (let i = 0; i < opts.revisions.length; i++) {
      const rev = opts.revisions[i]
      console.log(`Generating revision DOCX from "${rev}"...`)
      const revResult = await convertToDocx({
        commit: rev,
        inputPaths,
        specRoot,
        mermaidConfig,
        mscgenConfig,
        tempDir: path.join(tempDir, `rev${i + 1}`),
        crCoverPageData,
        frontPageData
      })
      console.log(`  ${rev === 'local' ? 'local' : rev.slice(0, 8)}: ${revResult.fileCount} file(s), ${revResult.imageCount} image(s)`)
      revisions.push({ docxPath: revResult.docxPath, authorName: opts.authors[i] })
    }

    // Copy intermediate DOCX files next to the output for diagnostics
    const outDir = path.dirname(outputPath)
    const outBase = path.basename(outputPath, '.docx')
    fs.copyFileSync(baseResult.docxPath, path.join(outDir, `${outBase}_base.docx`))
    for (let i = 0; i < revisions.length; i++) {
      fs.copyFileSync(revisions[i].docxPath, path.join(outDir, `${outBase}_rev${i + 1}.docx`))
    }

    // Merge
    console.log(`Merging ${revisions.length} revision(s) with backend "${opts.backend || 'auto'}"...`)
    const { mergeDocxVersions } = require('../common/docxMerge')
    await mergeDocxVersions(baseResult.docxPath, revisions, outputPath, {
      backend: opts.backend || 'auto',
      onProgress: (msg) => console.log(`  ${msg}`)
    })

    console.log(`\u2713 Output: ${outputPath}`)
  } catch (e) {
    console.error(`DOCX DIFF failed: ${e.message}`)
    process.exit(1)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

module.exports = { parseArgs }
if (require.main === module) run()
