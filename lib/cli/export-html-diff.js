#!/usr/bin/env node
/**
 * CLI for generating a tracked-changes HTML from two git versions.
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
const { loadMermaidConfig } = require('../common/mermaidConfig')
const { loadMscgenConfig } = require('../common/mscgenConfig')
const { exportHtml } = require('../md2html/exportHtml')
const { getRepoRoot } = require('../common/gitHelpers')
const { checkBrowser, loadCrCoverPage, loadFrontPage, loadCss } = require('./cli-utils')

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
  const outputPath = path.resolve(opts.output)
  const specRoot = opts.specRoot ? path.resolve(opts.specRoot) : ''
  const repoRoot = (() => { try { return getRepoRoot(inputPaths[0]) } catch (e) { return null } })()

  const crCoverPageData = loadCrCoverPage(opts.crCoverPageData, { strict: true })
  const frontPageData = crCoverPageData ? null : loadFrontPage(opts.frontPageData, { strict: true })

  try {
    console.log(`Loading base from "${opts.base}"...`)
    console.log(`Loading revision from "${opts.revision}"...`)
    console.log('Computing HTML diff...')

    const result = exportHtml({
      inputPaths,
      outputPath,
      specRoot,
      repoRoot,
      baseCommit: opts.base,
      compareCommit: opts.revision,
      css: loadCss(opts.css),
      mermaidConfig: loadMermaidConfig(opts.mermaidConfig),
      mscgenConfig: loadMscgenConfig(opts.mscgenConfig),
      frontPageData,
      crCoverPageData,
    })
    console.log(`✓ Output: ${outputPath} (${result.fileCount} file(s), ${result.imageCount} image(s))`)
  } catch (e) {
    console.error(`HTML DIFF failed: ${e.message}`)
    process.exit(1)
  }
}

module.exports = { parseArgs }
if (require.main === module) run()
