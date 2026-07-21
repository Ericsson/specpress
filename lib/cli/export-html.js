#!/usr/bin/env node
/**
 * CLI for exporting a specification directory to a standalone HTML file.
 *
 * Usage:
 *   node lib/cli/export-html.js <inputDir> <outputFile>
 *     [--spec-root <dir>]
 *     [--commit <ref>]
 *     [--css <file>]
 *     [--mermaid-config <file>]
 *     [--mscgen-config <file>]
 *     [--front-page-data <file>]
 *     [--cr-cover-page-data <file>]
 *
 * Use --commit to export from a specific git commit/branch/tag instead of
 * the local working copy.
 */
const fs = require('fs')
const path = require('path')
const { loadMermaidConfig } = require('../common/mermaidConfig')
const { loadMscgenConfig } = require('../common/mscgenConfig')
const { exportHtml } = require('../md2html/exportHtml')
const { getRepoRoot } = require('../common/gitHelpers')
const { checkBrowser, checkMscgen, loadCrCoverPage, loadFrontPage, loadCss } = require('./cli-utils')

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = { inputPaths: [] }
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '--spec-root') { opts.specRoot = args[++i]; i++; continue }
    if (a === '--commit') { opts.commit = args[++i]; i++; continue }
    if (a === '--css') { opts.css = args[++i]; i++; continue }
    if (a === '--mermaid-config') { opts.mermaidConfig = args[++i]; i++; continue }
    if (a === '--mscgen-config') { opts.mscgenConfig = args[++i]; i++; continue }
    if (a === '--front-page-data') { opts.frontPageData = args[++i]; i++; continue }
    if (a === '--cr-cover-page-data') { opts.crCoverPageData = args[++i]; i++; continue }
    if (!a.startsWith('--')) { opts.inputPaths.push(a); i++; continue }
    console.error(`Unknown option: ${a}`)
    process.exit(1)
  }
  opts.inputDir = opts.inputPaths[0] || null
  opts.output = opts.inputPaths[1] || null
  return opts
}

function validate(opts) {
  const errors = []
  if (!opts.inputDir) errors.push('Input directory is required')
  if (!opts.output) errors.push('Output file is required')
  if (opts.inputDir && !fs.existsSync(path.resolve(opts.inputDir))) {
    errors.push(`Input directory not found: ${path.resolve(opts.inputDir)}`)
  }
  return errors
}

function run() {
  const opts = parseArgs(process.argv)
  const errors = validate(opts)
  if (errors.length) {
    console.error('Usage: node lib/cli/export-html.js <inputDir> <outputFile> [--spec-root <dir>] [--commit <ref>] [--css <file>] [--mermaid-config <file>] [--mscgen-config <file>] [--front-page-data <file>] [--cr-cover-page-data <file>]')
    errors.forEach(e => console.error(`  ERROR: ${e}`))
    process.exit(1)
  }

  checkBrowser()
  checkMscgen()

  const inputDir = path.resolve(opts.inputDir)
  const outputPath = path.resolve(opts.output)
  const specRoot = opts.specRoot ? path.resolve(opts.specRoot) : inputDir
  const baseCommit = opts.commit || 'local'
  const repoRoot = (() => { try { return getRepoRoot(inputDir) } catch (e) { return null } })()

  const crCoverPageData = loadCrCoverPage(opts.crCoverPageData, { strict: true })
  const frontPageData = crCoverPageData ? null : loadFrontPage(opts.frontPageData, { strict: true })

  try {
    const result = exportHtml({
      inputPaths: [inputDir],
      outputPath,
      specRoot,
      repoRoot,
      baseCommit,
      css: loadCss(opts.css),
      mermaidConfig: loadMermaidConfig(opts.mermaidConfig),
      mscgenConfig: loadMscgenConfig(opts.mscgenConfig),
      frontPageData,
      crCoverPageData,
    })
    if (result.fileCount === 0) {
      console.error(`No .md / .markdown / .asn files found in ${inputDir}`)
      process.exit(1)
    }
    console.log(`Exported ${result.fileCount} file(s) → ${outputPath} (${result.imageCount} image(s))`)
  } catch (e) {
    console.error(`HTML export failed: ${e.message}`)
    process.exit(1)
  }
}

module.exports = { parseArgs }
if (require.main === module) run()
