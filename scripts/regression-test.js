#!/usr/bin/env node
/**
 * Regression test for HTML and DOCX export.
 *
 * Clones a spec repository, exports its content to HTML and DOCX,
 * and either stores the result as baseline ("generate") or compares
 * against a previously stored baseline ("validate").
 *
 * Usage:
 *   node scripts/regression-test.js generate
 *   node scripts/regression-test.js validate
 *
 * Configuration (edit the constants below or override via env vars):
 *   SPEC_REPO    — git URL of the specification repository
 *   SPEC_SUBDIR  — subfolder inside the repo that contains the spec files
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')
const { Md2Html } = require('../lib/md2html/md2html')
const { collectFiles, concatenateFiles, formatExportMessage } = require('../lib/common/specProcessor')
const { MarkdownToDocxConverter } = require('../lib/md2docx/md2docx')

// ── Configuration ──────────────────────────────────────────────────
const SPEC_REPO = process.env.SPEC_REPO || 'https://forge.3gpp.org/rep/fs_6gspecs_new/ericsson_multifiletypes_onem2m_example.git'
const SPEC_SUBDIR = process.env.SPEC_SUBDIR || 'specification'
// ───────────────────────────────────────────────────────────────────

const ROOT = path.join(os.tmpdir(), 'specpress-regression')
const REPO_DIR = path.join(ROOT, 'repo')
const BASELINE_DIR = path.join(ROOT, 'baseline')
const CURRENT_DIR = path.join(ROOT, 'current')

const mode = process.argv[2]
if (mode !== 'generate' && mode !== 'validate') {
  console.error('Usage: node scripts/regression-test.js <generate|validate>')
  process.exit(1)
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

function cloneRepo() {
  if (fs.existsSync(REPO_DIR)) {
    console.log('Repo already cloned, pulling latest...')
    execSync('git pull', { cwd: REPO_DIR, stdio: 'inherit' })
  } else {
    ensureDir(ROOT)
    console.log(`Cloning ${SPEC_REPO}...`)
    execSync(`git clone --depth 1 "${SPEC_REPO}" "${REPO_DIR}"`, { stdio: 'inherit' })
  }
}

function loadDefaults() {
  const libDir = path.join(__dirname, '..', 'lib')
  const cssPath = path.join(libDir, 'css', '3gpp.css')
  const mermaidPath = path.join(libDir, 'css', 'mermaid-config.json')
  return {
    css: fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '',
    mermaidConfig: fs.existsSync(mermaidPath) ? fs.readFileSync(mermaidPath, 'utf8') : '{}'
  }
}

function exportHtml(inputDir, outputDir) {
  const { css, mermaidConfig } = loadDefaults()
  const processor = new Md2Html({ css, mermaidConfig })
  return processor.exportHtmlFromDirectory(inputDir, outputDir)
}

async function exportDocx(inputDir, outputDir) {
  const { mermaidConfig } = loadDefaults()
  const files = collectFiles([inputDir])
  if (files.length === 0) throw new Error(`No spec files found in ${inputDir}`)

  const content = concatenateFiles(files)
  const tempMd = path.join(outputDir, '.~regression.md')
  const docxPath = path.join(outputDir, 'export.docx')
  fs.writeFileSync(tempMd, content)

  let mermaidConfigPath = null
  if (mermaidConfig !== '{}') {
    mermaidConfigPath = path.join(outputDir, '.~mermaid.json')
    fs.writeFileSync(mermaidConfigPath, mermaidConfig)
  }

  try {
    const converter = new MarkdownToDocxConverter(mermaidConfigPath)
    await converter.convert(tempMd, docxPath, path.dirname(files[0]))
    return {
      fileCount: files.length,
      imageCount: converter.imageCount,
      message: formatExportMessage('DOCX', files.length, converter.imageCount)
    }
  } finally {
    if (fs.existsSync(tempMd)) fs.unlinkSync(tempMd)
    if (mermaidConfigPath && fs.existsSync(mermaidConfigPath)) fs.unlinkSync(mermaidConfigPath)
  }
}

async function runExport(outputDir) {
  rmDir(outputDir)
  ensureDir(outputDir)

  const inputDir = path.join(REPO_DIR, SPEC_SUBDIR)
  if (!fs.existsSync(inputDir)) {
    console.error(`Spec directory not found: ${inputDir}`)
    process.exit(1)
  }

  const htmlDir = path.join(outputDir, 'html')
  ensureDir(htmlDir)
  console.log('Exporting HTML...')
  const htmlResult = exportHtml(inputDir, htmlDir)
  console.log(`  ${htmlResult.message}`)

  const docxDir = path.join(outputDir, 'docx')
  ensureDir(docxDir)
  console.log('Exporting DOCX...')
  const docxResult = await exportDocx(inputDir, docxDir)
  console.log(`  ${docxResult.message}`)
}

// ── Comparison helpers ─────────────────────────────────────────────

function compareFiles(fileA, fileB) {
  const a = fs.readFileSync(fileA)
  const b = fs.readFileSync(fileB)
  return { sizeA: a.length, sizeB: b.length, identical: a.equals(b) }
}

function listFilesRecursive(dir, base) {
  base = base || dir
  let results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...listFilesRecursive(full, base))
    else results.push(path.relative(base, full))
  }
  return results.sort()
}

function unzipDocx(docxPath, destDir) {
  ensureDir(destDir)
  const zipCopy = docxPath + '.zip'
  fs.copyFileSync(docxPath, zipCopy)
  try {
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${destDir}' -Force"`, { stdio: 'pipe' })
    } else {
      execSync(`unzip -o "${zipCopy}" -d "${destDir}"`, { stdio: 'pipe' })
    }
  } finally {
    fs.unlinkSync(zipCopy)
  }
}

/**
 * Normalizes XML content to remove non-deterministic parts:
 * - Timestamps in core.xml
 * - Mermaid SVG hashes in .rels files (mermaid rendering is non-deterministic)
 */
function normalizeXml(content, relPath) {
  if (relPath.endsWith('core.xml')) {
    content = content.replace(/<dcterms:created[^>]*>.*?<\/dcterms:created>/g, '<dcterms:created/>')
    content = content.replace(/<dcterms:modified[^>]*>.*?<\/dcterms:modified>/g, '<dcterms:modified/>')
  }
  content = content.replace(/media\/[0-9a-f]{40}\.svg/g, 'media/MERMAID.svg')
  return content
}

function compareXmlFiles(dirA, dirB) {
  const filesA = listFilesRecursive(dirA).filter(f => f.endsWith('.xml') || f.endsWith('.rels'))
  const filesB = listFilesRecursive(dirB).filter(f => f.endsWith('.xml') || f.endsWith('.rels'))

  const allFiles = [...new Set([...filesA, ...filesB])].sort()
  const results = []

  for (const rel of allFiles) {
    const pathA = path.join(dirA, rel)
    const pathB = path.join(dirB, rel)
    if (!fs.existsSync(pathA)) {
      results.push({ file: rel, status: 'removed' })
    } else if (!fs.existsSync(pathB)) {
      results.push({ file: rel, status: 'added' })
    } else {
      const a = normalizeXml(fs.readFileSync(pathA, 'utf8'), rel)
      const b = normalizeXml(fs.readFileSync(pathB, 'utf8'), rel)
      if (a === b) {
        results.push({ file: rel, status: 'identical' })
      } else {
        results.push({ file: rel, status: 'changed', sizeA: a.length, sizeB: b.length })
      }
    }
  }
  return results
}

function validate() {
  if (!fs.existsSync(BASELINE_DIR)) {
    console.error('No baseline found. Run "generate" first.')
    process.exit(1)
  }
  if (!fs.existsSync(CURRENT_DIR)) {
    console.error('No current export found. Something went wrong during export.')
    process.exit(1)
  }

  let allPassed = true

  // ── HTML comparison ──
  console.log('\n═══ HTML Comparison ═══')
  const baseHtml = path.join(BASELINE_DIR, 'html')
  const currHtml = path.join(CURRENT_DIR, 'html')
  const baseHtmlFiles = listFilesRecursive(baseHtml)
  const currHtmlFiles = listFilesRecursive(currHtml)

  const allHtmlFiles = [...new Set([...baseHtmlFiles, ...currHtmlFiles])].sort()
  for (const rel of allHtmlFiles) {
    const bPath = path.join(baseHtml, rel)
    const cPath = path.join(currHtml, rel)
    if (!fs.existsSync(bPath)) {
      console.log(`  + ${rel} (added)`)
      allPassed = false
    } else if (!fs.existsSync(cPath)) {
      console.log(`  - ${rel} (removed)`)
      allPassed = false
    } else {
      const cmp = compareFiles(bPath, cPath)
      if (cmp.identical) {
        console.log(`  ✓ ${rel}`)
      } else {
        console.log(`  ✗ ${rel} (size: ${cmp.sizeA} → ${cmp.sizeB})`)
        allPassed = false
      }
    }
  }

  // ── DOCX comparison ──
  console.log('\n═══ DOCX Comparison ═══')
  const baseDocx = path.join(BASELINE_DIR, 'docx', 'export.docx')
  const currDocx = path.join(CURRENT_DIR, 'docx', 'export.docx')

  console.log('\n── Binary (informational) ──')
  const binCmp = compareFiles(baseDocx, currDocx)
  if (binCmp.identical) {
    console.log('  ✓ Files are identical')
  } else {
    console.log(`  ~ Files differ (size: ${binCmp.sizeA} → ${binCmp.sizeB}) — expected due to timestamps/mermaid`)
  }

  console.log('\n── XML content ──')
  const baseUnzip = path.join(BASELINE_DIR, 'docx', '_extracted')
  const currUnzip = path.join(CURRENT_DIR, 'docx', '_extracted')
  rmDir(baseUnzip)
  rmDir(currUnzip)

  try {
    unzipDocx(baseDocx, baseUnzip)
    unzipDocx(currDocx, currUnzip)

    const xmlResults = compareXmlFiles(baseUnzip, currUnzip)
    let xmlChanged = 0
    for (const r of xmlResults) {
      if (r.status === 'identical') {
        console.log(`  ✓ ${r.file}`)
      } else if (r.status === 'changed') {
        console.log(`  ✗ ${r.file} (size: ${r.sizeA} → ${r.sizeB})`)
        xmlChanged++
      } else {
        console.log(`  ${r.status === 'added' ? '+' : '-'} ${r.file} (${r.status})`)
        xmlChanged++
      }
    }
    if (xmlChanged > 0) allPassed = false
  } catch (e) {
    console.log(`  ⚠ Could not extract DOCX for XML comparison: ${e.message}`)
    allPassed = false
  }

  // ── Summary ──
  console.log('\n═══ Result ═══')
  if (allPassed) {
    console.log('✓ All outputs match the baseline.')
  } else {
    console.log('✗ Differences detected — see above.')
    process.exit(1)
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  if (mode === 'generate') {
    cloneRepo()
    console.log('\nGenerating baseline...')
    await runExport(BASELINE_DIR)
    console.log(`\nBaseline stored in ${BASELINE_DIR}`)
    console.log('Run "validate" after refactoring to compare.')
  } else {
    if (!fs.existsSync(REPO_DIR)) {
      console.error('Spec repo not found. Run "generate" first.')
      process.exit(1)
    }
    console.log('\nGenerating current output...')
    await runExport(CURRENT_DIR)
    validate()
  }
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
