#!/usr/bin/env node
/**
 * CLI for exporting a specification directory to a standalone HTML file.
 *
 * Usage:
 *   node lib/cli/export-html.js <inputDir> <outputDir>
 *     [--spec-root <dir>]
 *     [--css <file>]
 *     [--mermaid-config <file>]
 *     [--mscgen-config <file>]
 *     [--front-page-data <file>]
 *     [--cr-cover-page-data <file>]
 *
 * Collects all .md, .markdown, and .asn files from <inputDir> (recursively),
 * converts them to a single HTML file at <outputDir>/index.html, and copies
 * referenced images into a media/ subdirectory.
 */
const fs = require('fs')
const path = require('path')
const { Md2Html } = require('../md2html/md2html')
const { loadMermaidConfig, checkBrowser, loadCrCoverPage, loadFrontPage } = require('./docx-export-utils')
const { loadMscgenConfig } = require('../common/mscgenConfig')

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = { inputPaths: [] }

  let i = 0
  while (i < args.length) {
    const a = args[i]
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

  opts.inputDir = opts.inputPaths[0] || null
  opts.output = opts.inputPaths[1] || null
  return opts
}

function validate(opts) {
  const errors = []
  if (!opts.inputDir) errors.push('Input directory is required')
  if (!opts.output) errors.push('Output directory is required')
  if (opts.inputDir && !fs.existsSync(path.resolve(opts.inputDir))) {
    errors.push(`Input directory not found: ${path.resolve(opts.inputDir)}`)
  }
  return errors
}

function run() {
  const opts = parseArgs(process.argv)
  const errors = validate(opts)
  if (errors.length) {
    console.error('Usage: node lib/cli/export-html.js <inputDir> <outputDir> [--spec-root <dir>] [--css <file>] [--mermaid-config <file>] [--mscgen-config <file>] [--front-page-data <file>] [--cr-cover-page-data <file>]')
    errors.forEach(e => console.error(`  ERROR: ${e}`))
    process.exit(1)
  }

  checkBrowser()

  const inputDir = path.resolve(opts.inputDir)
  const outputDir = path.resolve(opts.output)
  const specRoot = opts.specRoot ? path.resolve(opts.specRoot) : inputDir
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

  const processor = new Md2Html({
    css,
    mermaidConfig,
    mscgenConfig,
    specRootPath: specRoot
  })

  const result = processor.exportHtmlFromDirectory(inputDir, outputDir, { frontPageData, crCoverPageData })
  if (result.fileCount === 0) {
    console.error(`No .md / .markdown / .asn files found in ${inputDir}`)
    process.exit(1)
  }
  console.log(`Exported ${result.fileCount} file(s) → ${path.join(outputDir, 'index.html')} (${result.imageCount} image(s))`)
}

module.exports = { parseArgs }
if (require.main === module) run()
