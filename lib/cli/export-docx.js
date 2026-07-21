#!/usr/bin/env node
/**
 * CLI wrapper for MarkdownToDocxConverter.
 *
 * Usage:
 *   node lib/cli/export-docx.js <inputDir> <outputFile>
 *     [--spec-root <dir>]
 *     [--mermaid-config <file>]
 *     [--front-page-data <file>]
 *     [--cr-cover-page-data <file>]
 *
 * When --spec-root is provided, section numbers are derived from the folder/file
 * hierarchy and x-placeholders in headings and captions are resolved.
 *
 * Mermaid diagrams are rendered via a headless Chromium browser (Chrome or Edge
 * must be installed). This is the fallback path used when VS Code is not available.
 */
const fs = require('fs')
const path = require('path')
const { loadMermaidConfig } = require('../common/mermaidConfig')
const { loadMscgenConfig } = require('../common/mscgenConfig')
const { convertToDocx, createTempDir } = require('../md2docx/convertToDocx')
const { checkBrowser, checkMscgen, loadCrCoverPage, loadFrontPage } = require('./cli-utils')

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = { inputPaths: [] }

  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '--spec-root') { opts.specRoot = args[++i]; i++; continue }
    if (a === '--mermaid-config') { opts.mermaidConfig = args[++i]; i++; continue }
    if (a === '--mscgen-config') { opts.mscgenConfig = args[++i]; i++; continue }
    if (a === '--front-page-data') { opts.frontPageData = args[++i]; i++; continue }
    if (a === '--cr-cover-page-data') { opts.crCoverPageData = args[++i]; i++; continue }
    if (!a.startsWith('--')) { opts.inputPaths.push(a); i++; continue }
    console.error(`Unknown option: ${a}`)
    process.exit(1)
  }

  // First positional arg is input dir, second is output file
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

async function run() {
  const opts = parseArgs(process.argv)
  const errors = validate(opts)
  if (errors.length) {
    console.error('Usage: node lib/cli/export-docx.js <inputDir> <outputFile> [--spec-root <dir>] [--mermaid-config <file>] [--front-page-data <file>] [--cr-cover-page-data <file>]')
    errors.forEach(e => console.error(`  ERROR: ${e}`))
    process.exit(1)
  }

  checkBrowser()
  checkMscgen()

  const inputPaths = [path.resolve(opts.inputDir)]
  const specRoot = opts.specRoot ? path.resolve(opts.specRoot) : ''
  const outputPath = path.resolve(opts.output)
  const mermaidConfig = loadMermaidConfig(opts.mermaidConfig)
  const mscgenConfig = loadMscgenConfig(opts.mscgenConfig)

  // Load cover pages (CLI layer: strict mode exits on error)
  const crCoverPageData = loadCrCoverPage(opts.crCoverPageData, { strict: true })
  const frontPageData = crCoverPageData ? null : loadFrontPage(opts.frontPageData, { strict: true })

  const tempDir = createTempDir('export')

  try {
    const result = await convertToDocx({
      commit: 'local',
      inputPaths,
      specRoot,
      mermaidConfig,
      mscgenConfig,
      tempDir,
      crCoverPageData,
      frontPageData
    })

    // Move the generated DOCX to the final output location
    fs.copyFileSync(result.docxPath, outputPath)
    console.log(`Exported ${result.fileCount} file(s) → ${outputPath} (${result.imageCount} image(s))`)
  } catch (e) {
    console.error(`DOCX export failed: ${e.message}`)
    process.exit(1)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

module.exports = { parseArgs }
if (require.main === module) run()
