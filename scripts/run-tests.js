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

function findTests(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'ran4') files.push(...findTests(full))
    else if (entry.name.endsWith('.test.js')) files.push(full)
  }
  return files
}

function parseJsOutput(output, cb) {
  let passed = 0, failed = 0
  const failureLines = []
  for (const line of output.split('\n')) {
    const m = line.match(/(\d+) passed, (\d+) failed/)
    if (m) { passed = parseInt(m[1]); failed = parseInt(m[2]); continue }
    if (/^\s*✗/.test(line) || (/^\s/.test(line) && failureLines.length && !/^\s*✓/.test(line))) {
      failureLines.push(line)
    }
  }
  cb(passed, failed, failureLines)
}

// Run a .test.js file, suppress ✓ lines, print only failures + summary
function runJsTest(file) {
  const rel = path.relative(testDir, file).replace(/\\/g, '/')
  let passed = 0, failed = 0, failureLines = []
  try {
    const output = execSync(`node "${file}"`, { encoding: 'utf8', cwd: path.dirname(file), stdio: ['pipe', 'pipe', 'pipe'] })
    parseJsOutput(output, (p, f, lines) => { passed = p; failed = f; failureLines = lines })
  } catch (e) {
    parseJsOutput(e.stdout || '', (p, f, lines) => { passed = p; failed = f; failureLines = lines })
    if (!passed && !failed) failed = 1
  }
  totalPassed += passed
  totalFailed += failed
  if (failed === 0) {
    console.log(`  ${rel} ... ok (${passed})`)
  } else {
    console.log(`  ${rel} ... FAILED (${failed}/${passed + failed})`)
    for (const l of failureLines) console.log(l)
  }
}

// Parse TAP output from node:test runner, return { passed, failed, failures[] }
function parseTap(tap) {
  let passed = 0, failed = 0
  const failures = []
  let lastTestName = ''
  for (const line of tap.split('\n')) {
    const nameMatch = line.match(/^# Subtest: (.+)/)
    if (nameMatch) { lastTestName = nameMatch[1]; continue }
    if (/^ok \d+/.test(line) && !line.includes('# SKIP')) { passed++; continue }
    if (/^not ok \d+/.test(line)) {
      failed++
      const m = line.match(/^not ok \d+ - (.+)/)
      failures.push(`    ✗ ${m ? m[1] : lastTestName}`)
      continue
    }
    // capture error message lines inside failure blocks
    if (failures.length && /^\s+message:/.test(line)) {
      failures.push(`      ${line.trim()}`)
    }
  }
  return { passed, failed, failures }
}

// Run RAN4 TypeScript tests via node:test + TAP reporter
function runRan4Tests() {
  const tsTestDir = path.join(testDir, 'lib', 'ran4')
  if (!fs.existsSync(tsTestDir)) return
  let passed = 0, failed = 0, failures = []
  try {
    const output = execSync(
      'node --import tsx --test --test-reporter=tap test/lib/ran4/*.test.ts',
      { encoding: 'utf8', cwd: path.join(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] }
    );({ passed, failed, failures } = parseTap(output))
  } catch (e) {
    ;({ passed, failed, failures } = parseTap(e.stdout || ''))
    if (!passed && !failed) failed = 1
  }
  totalPassed += passed
  totalFailed += failed
  if (failed === 0) {
    console.log(`  ran4/*.test.ts ... ok (${passed})`)
  } else {
    console.log(`  ran4/*.test.ts ... FAILED (${failed}/${passed + failed})`)
    for (const l of failures) console.log(l)
  }
}

console.log('Running tests...\n')

const testFiles = findTests(testDir)
for (const file of testFiles) runJsTest(file)
runRan4Tests()

console.log(`\n${'─'.repeat(48)}`)
if (totalFailed === 0) {
  console.log(`✓ All ${totalPassed} tests passed`)
} else {
  console.log(`✗ ${totalFailed} failed, ${totalPassed} passed (${totalPassed + totalFailed} total)`)
}

process.exit(totalFailed > 0 ? 1 : 0)
