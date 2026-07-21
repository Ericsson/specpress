#!/usr/bin/env node
/**
 * CLI for generating a tracked-changes HTML from multiple git versions.
 *
 * Usage:
 *   node lib/cli/export-html-diff.js <inputPaths...> --output <file>
 *     --base <commit>
 *     --revision <commit>
 *     [--spec-root <dir>]
 *     [--css <file>]
 *     [--mermaid-config <file>]
 *     [--mscgen-config <file>]
 *     [--front-page-data <file>]
 *     [--cr-cover-page-data <file>]
 *
 * Use "local" as a commit identifier to use the current working copy.
 */
const fs = require('fs')
const path = require('path')
const { Md2Html } = require('../md2html/md2html')
const { diffHtml } = require('../md2html/htmlDiff')
const { collectFiles, concatenateFiles } = require('../common/specProcessor')
const { getRepoRoot, extractFilesFromCommit, collectFilesFromCommit } = require('../common/gitHelpers')
const { createCommitResolver } = require('../common/fileResolver')
const { loadMermaidConfig, checkBrowser, loadCrCoverPage, loadFrontPage } = require('./docx-export-utils')
const { loadMscgenConfig } = require('../common/mscgenConfig')

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = { inputPaths: [] }

  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '--output') { opts.output = args[++i]; i++; continue }
    if (a === '--base') { opts.base = args[++i]; i++; continue }
    if (a === '--revision') { opts.revision = args[++i]; i++; continue }
    if (a === '--spec-root') { opts.specRoot = args[++i]; i++; continue }
    if (a === '--css') { opts.css = args[++i]; i++; continue }
    if (a === '--mermaid-config') { opts.mermaidConfig = args[++i]; i++; continue }
    if (a === '--mscgen-config') { opts.mscgenConfig = args[++i]; i++; continue }
    if (a === '--front-page-data') { opts.frontPageData = args[++i]; i++; continue }
    if (a === '--cr-cover-page-data') { opts.crCoverPageData = args[++i]; i++; continue }
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
  if (!opts.revision) errors.push('--revision is required')
  return errors
}

/**
 * Collects and concatenates spec files from a git commit or the local working copy.
 * Returns { content, cache } where cache is the raw git archive Map (for fileResolver).
 */
function getContent(commit, inputPaths, specRoot) {
  if (commit === 'local') {
    const files = collectFiles(inputPaths)
    return { content: concatenateFiles(files, undefined, specRoot), resolver: null }
  }

  const repoRoot = getRepoRoot(inputPaths[0])
  const resolver = specRoot ? createCommitResolver(repoRoot, specRoot, commit) : null
  const files = collectFilesFromCommit(repoRoot, inputPaths, commit)
  const content = concatenateFiles(files, (f) => resolver ? resolver.readFile(f, 'utf8') : fs.readFileSync(f, 'utf8'), specRoot)
  return { content, resolver }
}

function run() {
  const opts = parseArgs(process.argv)
  const errors = validate(opts)
  if (errors.length) {
    console.error('Usage: node lib/cli/export-html-diff.js <inputPaths...> --output <file> --base <commit> --revision <commit>')
    errors.forEach(e => console.error(`  ERROR: ${e}`))
    process.exit(1)
  }

  checkBrowser()

  const inputPaths = opts.inputPaths.map(p => path.resolve(p))
  const specRoot = opts.specRoot ? path.resolve(opts.specRoot) : ''
  const outputPath = path.resolve(opts.output)
  const mermaidConfig = loadMermaidConfig(opts.mermaidConfig)
  const mscgenConfig = loadMscgenConfig(opts.mscgenConfig)

  // Load cover pages
  const crCoverPageData = loadCrCoverPage(opts.crCoverPageData, { strict: true })
  const frontPageData = crCoverPageData ? null : loadFrontPage(opts.frontPageData, { strict: true })

  // Load CSS
  const defaultCssPath = path.join(__dirname, '../css/3gpp.css')
  const css = opts.css && fs.existsSync(opts.css)
    ? fs.readFileSync(opts.css, 'utf8')
    : (fs.existsSync(defaultCssPath) ? fs.readFileSync(defaultCssPath, 'utf8') : '')

  // Load diff CSS
  const diffCssPath = path.join(__dirname, '../css/diff.css')
  const diffCss = fs.existsSync(diffCssPath) ? fs.readFileSync(diffCssPath, 'utf8') : ''

  try {
    // Get content from both versions
    console.log(`Loading baseline from "${opts.base}"...`)
    const { content: baselineContent, resolver: baselineResolver } = getContent(opts.base, inputPaths, specRoot)

    console.log(`Loading revision from "${opts.revision}"...`)
    const { content: currentContent } = getContent(opts.revision, inputPaths, specRoot)

    if (!baselineContent) {
      console.error('No files found in baseline commit')
      process.exit(1)
    }
    if (!currentContent) {
      console.error('No files found in revision')
      process.exit(1)
    }

    // Create handler and run diff
    const handler = new Md2Html({ css: css + '\n' + diffCss, mermaidConfig, mscgenConfig, specRootPath: specRoot })
    console.log('Computing HTML diff...')
    const diffBody = diffHtml({
      baselineContent,
      currentContent,
      handler,
      specRoot,
      frontPageData,
      crCoverPageData,
      baselineFileResolver: baselineResolver
    })

    // Wrap in complete HTML document and write
    const html = handler.wrapHtml(diffBody)

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

    fs.writeFileSync(outputPath, html)
    console.log(`✓ Output: ${outputPath}`)
  } catch (e) {
    console.error(`HTML DIFF failed: ${e.message}`)
    process.exit(1)
  }
}

module.exports = { parseArgs }
if (require.main === module) run()
