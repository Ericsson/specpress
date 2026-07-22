/**
 * Checks which symbols exported from lib/index.js are not imported anywhere
 * in the SpecPressExt src/ directory.
 *
 * Usage: node scripts/check-unused-exports.js <path-to-SpecPressExt>
 */
const fs = require('fs')
const path = require('path')

const extRoot = path.join(process.argv[2] || '../SpecPressExt', 'src')

// --- 1. Parse exports from index.js ---
const indexSrc = fs.readFileSync(path.join(__dirname, '../lib/index.js'), 'utf8')
const exportBlock = indexSrc.match(/module\.exports\s*=\s*\{([\s\S]+?)\n\}/)[1]
const exportedFromIndex = []
for (const line of exportBlock.split('\n')) {
  const m = line.match(/^\s{2}(\w+),?\s*(?:\/\/.*)?$/)
  if (m) exportedFromIndex.push(m[1])
}

// --- 2. Collect all symbols imported from specpress in SpecPressExt src/ ---
const allImported = new Set()
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.js')) {
      const src = fs.readFileSync(full, 'utf8')
      // Match: const { A, B: C } = require('specpress/...')
      for (const m of src.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\('specpress[^']*'\)/g)) {
        for (const sym of m[1].split(',')) {
          const name = sym.trim().split(/\s*:\s*/)[0].trim()
          if (name) allImported.add(name)
        }
      }
    }
  }
}
walk(extRoot)

// --- 3. Report ---
const unused = exportedFromIndex.filter(s => !allImported.has(s))
const used   = exportedFromIndex.filter(s =>  allImported.has(s))

console.log(`Scanned ${exportedFromIndex.length} exports from lib/index.js`)
console.log(`SpecPressExt src/ path: ${extRoot}\n`)

console.log(`=== Used by SpecPressExt (${used.length}) ===`)
used.forEach(s => console.log(`  ${s}`))

console.log(`\n=== NOT used by SpecPressExt (${unused.length}) ===`)
unused.forEach(s => console.log(`  ${s}`))

// Also flag anything SpecPressExt imports by path that bypasses index.js
const bypassImports = new Set()
function walk2(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk2(full)
    else if (entry.name.endsWith('.js')) {
      const src = fs.readFileSync(full, 'utf8')
      for (const m of src.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\('specpress\/lib\/[^']+'\)/g)) {
        for (const sym of m[1].split(',')) {
          const name = sym.trim().split(/\s*:\s*/)[0].trim()
          if (name) bypassImports.add(name)
        }
      }
    }
  }
}
walk2(extRoot)
const notInIndex = [...bypassImports].filter(s => !exportedFromIndex.includes(s)).sort()
if (notInIndex.length) {
  console.log(`\n=== Imported by SpecPressExt via direct path (not in index.js) (${notInIndex.length}) ===`)
  notInIndex.forEach(s => console.log(`  ${s}`))
}
