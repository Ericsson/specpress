#!/usr/bin/env node
/**
 * CLI wrapper for MarkdownToDocxConverter.
 *
 * Usage:
 *   node cli/export-docx.js <inputDir> <outputFile> [--spec-root <dir>] [--mermaid-config <file>]
 *
 * Options:
 *   --spec-root <dir>        Specification root for section numbering (enables x-placeholder resolution).
 *   --mermaid-config <file>  Path to a mermaid configuration JSON file.
 *
 * When --spec-root is provided, section numbers are derived from the folder/file
 * hierarchy and x-placeholders in headings and captions are resolved.
 *
 * Mermaid diagrams are rendered via a headless Chromium browser (Chrome or Edge
 * must be installed). This is the fallback path used when VS Code is not available.
 */
const fs = require('fs')
const path = require('path')
const { MarkdownToDocxConverter } = require('../md2docx/md2docx')
const { collectFiles, concatenateFiles } = require('../common/specProcessor')

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(name)
  if (i === -1) return null
  const val = args[i + 1]
  args.splice(i, 2)
  return val
}

const specRoot = flag('--spec-root') || ''
const mermaidFile = flag('--mermaid-config')
const inputDir = args[0]
const outputFile = args[1]

if (!inputDir || !outputFile) {
  console.error('Usage: node cli/export-docx.js <inputDir> <outputFile> [--spec-root <dir>] [--mermaid-config <file>]')
  process.exit(1)
}

const absInput = path.resolve(inputDir)
const absOutput = path.resolve(outputFile)
const absSpecRoot = specRoot ? path.resolve(specRoot) : ''

if (!fs.existsSync(absInput)) {
  console.error(`Input directory not found: ${absInput}`)
  process.exit(1)
}

const files = collectFiles(absInput)
if (files.length === 0) {
  console.error(`No .md / .markdown / .asn files found in ${absInput}`)
  process.exit(1)
}

const content = concatenateFiles(files, undefined, absSpecRoot)

// Write concatenated content to a temp file for the converter
const tmpDir = require('os').tmpdir()
const ts = Date.now()
const tempMd = path.join(tmpDir, `.~cli_export_${ts}.md`)
fs.writeFileSync(tempMd, content)

// Resolve mermaid config
let mermaidConfigPath = null
if (mermaidFile && fs.existsSync(mermaidFile)) {
  mermaidConfigPath = path.resolve(mermaidFile)
} else {
  const defaultMermaidPath = path.join(__dirname, '../css/mermaid-config.json')

  if (fs.existsSync(defaultMermaidPath)) {
    mermaidConfigPath = defaultMermaidPath
  }
}

async function run() {
  try {
    const converter = new MarkdownToDocxConverter(mermaidConfigPath, absSpecRoot)
    await converter.convert(tempMd, absOutput, path.dirname(files[0]))
    const imageCount = converter.imageCount
    console.log(`Exported ${files.length} file(s) → ${absOutput} (${imageCount} image(s))`)
  } catch (e) {
    console.error(`DOCX export failed: ${e.message}`)
    process.exit(1)
  } finally {
    if (fs.existsSync(tempMd)) fs.unlinkSync(tempMd)
  }
}

run()
