const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Ensure UTF-8 output on Windows
if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'ignore' }) } catch (e) {}
}

const testDir = path.join(__dirname, '..', 'test')
let totalPassed = 0
let totalFailed = 0
const results = []

function findTests(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...findTests(full))
    else if (entry.name.endsWith('.test.js')) files.push(full)
  }
  return files
}

const testFiles = findTests(testDir)

for (const file of testFiles) {
  const rel = path.relative(testDir, file)
  console.log(`\n\n── ${rel} ──\n`)
  try {
    const output = execSync(`node "${file}"`, { encoding: 'utf8', cwd: path.dirname(file) })
    process.stdout.write(output)
    const match = output.match(/(\d+) passed, (\d+) failed/)
    if (match) {
      totalPassed += parseInt(match[1])
      totalFailed += parseInt(match[2])
    }
    results.push({ file: rel, ok: true })
  } catch (e) {
    process.stdout.write(e.stdout || '')
    process.stderr.write(e.stderr || '')
    const match = (e.stdout || '').match(/(\d+) passed, (\d+) failed/)
    if (match) {
      totalPassed += parseInt(match[1])
      totalFailed += parseInt(match[2])
    } else {
      totalFailed++
    }
    results.push({ file: rel, ok: false })
  }
}

console.log('\n\n════════════════════════════════════════')
const failedFiles = results.filter(r => !r.ok)
console.log(`${testFiles.length} test file(s), ${failedFiles.length} failed`)
if (totalPassed || totalFailed) {
  console.log(`${totalPassed} passed, ${totalFailed} failed (total)`)
}
if (failedFiles.length > 0) {
  console.log('\nFailed test files:')
  for (const r of failedFiles) {
    console.log(`  node "test/${r.file.replace(/\\/g, '/')}"`)
  }
}

// Run RAN4 TypeScript tests if tsx is available
let ran4Ok = true
try {
  const tsTestDir = path.join(__dirname, '..', 'test', 'lib', 'ran4')
  if (fs.existsSync(tsTestDir)) {
    console.log('\n\n── RAN4 TypeScript tests ──\n')
    try {
      const output = execSync('node --import tsx --test test/lib/ran4/*.test.ts', {
        encoding: 'utf8',
        cwd: path.join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe']
      })
      process.stdout.write(output)
    } catch (e) {
      if (e.stdout) process.stdout.write(e.stdout)
      if (e.stderr) process.stderr.write(e.stderr)
      ran4Ok = false
      totalFailed++
    }
  }
} catch (e) {
  console.log('  (skipped — tsx not installed)')
}

process.exit((totalFailed > 0 || !ran4Ok) ? 1 : 0)
