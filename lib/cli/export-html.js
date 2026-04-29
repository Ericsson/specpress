#!/usr/bin/env node
/**
 * CLI wrapper for SpecViewProcessor.exportHtmlFromDirectory().
 *
 * Usage:
 *   node cli/export-html.js <inputDir> <outputDir> [--css <file>] [--mermaid-config <file>]
 */
const fs = require('fs')
const path = require('path')
const { Md2Html } = require('../md2html/md2html')

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(name)
  if (i === -1) return null
  const val = args[i + 1]
  args.splice(i, 2)
  return val
}

const cssFile = flag('--css')
const mermaidFile = flag('--mermaid-config')
const inputDir = args[0]
const outputDir = args[1]

if (!inputDir || !outputDir) {
  console.error('Usage: node cli/export-html.js <inputDir> <outputDir> [--css <file>] [--mermaid-config <file>]')
  process.exit(1)
}

function loadFile(p, fallback) {
  if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8')
  return fallback
}

const defaultCssPath = path.join(__dirname, '../css/3gpp.css')
const defaultMermaidPath = path.join(__dirname, '../css/mermaid-config.json')

const processor = new Md2Html({
  css: loadFile(cssFile, loadFile(defaultCssPath, '')),
  mermaidConfig: loadFile(mermaidFile, loadFile(defaultMermaidPath, '{}'))
})

const { fileCount, imageCount } = processor.exportHtmlFromDirectory(inputDir, outputDir)
if (fileCount === 0) {
  console.error(`No .md / .markdown / .asn files found in ${path.resolve(inputDir)}`)
  process.exit(1)
}
console.log(`Exported ${fileCount} file(s) → ${path.resolve(outputDir, 'index.html')} (${imageCount} image(s))`)
