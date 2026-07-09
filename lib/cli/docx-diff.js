#!/usr/bin/env node
/**
 * CLI for generating a tracked-changes DOCX from multiple git versions.
 *
 * Usage:
 *   node lib/cli/docx-diff.js <inputPaths...> --output <file>
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
const os = require('os')

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

function deriveCRAuthor(crCoverPageData) {
  if (!crCoverPageData) return null
  const absPath = path.resolve(crCoverPageData)
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

async function generateDocx(commit, inputPaths, specRoot, mermaidConfig, tempDir, frontPageData, crCoverPageData) {
  const { collectFiles, concatenateFiles } = require('../common/specProcessor')
  const { insertOmittedMarkers } = require('../common/specProcessor')
  const { MarkdownToDocxConverter } = require('../md2docx/md2docx')
  const { getRepoRoot, extractFilesFromCommit, makeCachedFileResolver, makeCachedTextReader } = require('../common/gitHelpers')

  let files, content, fileResolver

  if (commit === 'local') {
    // Use current working copy
    const allFiles = []
    for (const p of inputPaths) {
      const abs = path.resolve(p)
      if (fs.statSync(abs).isDirectory()) {
        allFiles.push(...collectFiles(abs))
      } else {
        allFiles.push(abs)
      }
    }
    files = allFiles
    content = concatenateFiles(files, undefined, specRoot || '')
    fileResolver = null
  } else {
    // Extract from git commit
    const repoRoot = getRepoRoot(path.resolve(inputPaths[0]))
    const searchPaths = inputPaths.map(p => path.resolve(p))
    const cache = extractFilesFromCommit(repoRoot, commit, searchPaths)

    // Collect spec file paths from cache (sorted, filtered to spec extensions)
    files = [...cache.keys()]
      .filter(f => f.endsWith('.md') || f.endsWith('.markdown') || f.endsWith('.asn'))
      .sort()
    const textReader = makeCachedTextReader(cache)
    content = concatenateFiles(files, textReader, specRoot || '')
    fileResolver = makeCachedFileResolver(cache)
  }

  if (!content || !files.length) {
    throw new Error(`No files found for commit "${commit}" in paths: ${inputPaths.join(', ')}`)
  }

  // Write temp markdown
  const tempMd = path.join(tempDir, `${commit === 'local' ? 'local' : commit.slice(0, 8)}.md`)
  fs.writeFileSync(tempMd, content)

  // Convert to DOCX
  const docxPath = tempMd.replace('.md', '.docx')
  const converter = new MarkdownToDocxConverter(mermaidConfig, specRoot || '')

  let frontPage = null
  let crData = null

  if (crCoverPageData) {
    const absPath = path.resolve(crCoverPageData)
    if (fs.existsSync(absPath)) {
      const { loadCRCoverPageData } = require('../common/crCoverPageLoader')
      const result = loadCRCoverPageData(absPath)
      if (result.valid) {
        crData = result.data
      } else {
        console.error(`Warning: CR cover page not loaded: ${result.errors.join(', ')}`)
      }
    } else {
      console.error(`Warning: CR cover page file not found: ${absPath}`)
    }
  }

  if (!crData && frontPageData && fs.existsSync(frontPageData)) {
    try {
      const { buildFrontPageDocx } = require('../md2docx/frontPage')
      const data = JSON.parse(fs.readFileSync(frontPageData, 'utf8'))
      frontPage = buildFrontPageDocx(data)
    } catch (e) { /* skip front page on error */ }
  }

  const baseDir = commit === 'local' ? path.dirname(files[0]) : tempDir
  await converter.convert(tempMd, docxPath, baseDir, frontPage, {
    crCoverPageData: crData,
    fileResolver
  })
  console.log(`  ${commit === 'local' ? 'local' : commit.slice(0, 8)}: ${files.length} file(s), ${converter.imageCount} image(s)`)
  return docxPath
}

async function run() {
  const opts = parseArgs(process.argv)
  const errors = validate(opts)
  if (errors.length) {
    console.error('Usage: node lib/cli/docx-diff.js <inputPaths...> --output <file> --base <commit> --revisions <commit...> --authors <name...>')
    errors.forEach(e => console.error(`  ERROR: ${e}`))
    process.exit(1)
  }

  const { findBrowser } = require('../md2docx/handlers/mermaidHandler')
  if (!findBrowser()) {
    console.warn('Warning: No Chromium-based browser found. Mermaid diagrams will not be rendered.')
    console.warn('  Install Chrome/Chromium or set the CHROME_BIN environment variable.')
  }

  // Default authors: derive from CR data if available, else use revision identifiers
  if (!opts.authors.length) {
    const crAuthor = deriveCRAuthor(opts.crCoverPageData)
    opts.authors = opts.revisions.map(() => crAuthor || 'Author')
  }

  const specRoot = opts.specRoot ? path.resolve(opts.specRoot) : ''
  const outputPath = path.resolve(opts.output)

  // Load mermaid config
  let mermaidConfig = null
  if (opts.mermaidConfig && fs.existsSync(opts.mermaidConfig)) {
    mermaidConfig = fs.readFileSync(path.resolve(opts.mermaidConfig), 'utf8')
  } else {
    const defaultPath = path.join(__dirname, '../css/mermaid-config.json')
    if (fs.existsSync(defaultPath)) mermaidConfig = fs.readFileSync(defaultPath, 'utf8')
  }

  const tempDir = path.join(os.tmpdir(), `specpress-docx-diff-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    // Generate base DOCX
    console.log(`Generating base DOCX from "${opts.base}"...`)
    const baseDocx = await generateDocx(opts.base, opts.inputPaths, specRoot, mermaidConfig, tempDir, opts.frontPageData, opts.crCoverPageData)

    // Generate revision DOCX files
    const revisions = []
    for (let i = 0; i < opts.revisions.length; i++) {
      const rev = opts.revisions[i]
      console.log(`Generating revision DOCX from "${rev}"...`)
      const docxPath = await generateDocx(rev, opts.inputPaths, specRoot, mermaidConfig, tempDir, opts.frontPageData, opts.crCoverPageData)
      revisions.push({ docxPath, authorName: opts.authors[i] })
    }

    // Copy intermediate DOCX files next to the output for diagnostics
    const outDir = path.dirname(outputPath)
    const outBase = path.basename(outputPath, '.docx')
    fs.copyFileSync(baseDocx, path.join(outDir, `${outBase}_base.docx`))
    for (let i = 0; i < revisions.length; i++) {
      fs.copyFileSync(revisions[i].docxPath, path.join(outDir, `${outBase}_rev${i + 1}.docx`))
    }

    // Merge
    console.log(`Merging ${revisions.length} revision(s) with backend "${opts.backend || 'auto'}"...`)
    const { mergeDocxVersions } = require('../common/docxMerge')
    await mergeDocxVersions(baseDocx, revisions, outputPath, {
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
