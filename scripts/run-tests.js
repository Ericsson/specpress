const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Ensure UTF-8 output on Windows
if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'ignore' }) } catch (e) {}
}

const repoRoot = path.join(__dirname, '..')
const testDir = path.join(repoRoot, 'test')
const quick = process.argv.includes('--quick')

// Tests excluded from the node --test batch: they manage their own skip/exit
// logic (process.exit). docxExport-e2e also fires up MS Word so it is skipped
// in --quick mode.
const SLOW_E2E_TESTS = new Set([
  path.join(testDir, 'lib', 'md2docx', 'docxExport-e2e.test.js'),
])
const OTHER_E2E_TESTS = new Set([
  path.join(testDir, 'lib', 'docx-diff', 'docx-diff-e2e.test.js'),
  path.join(testDir, 'lib', 'docx-diff', 'docx-diff-libre-e2e.test.js'),
  path.join(testDir, 'lib', 'md2docx', 'handlers', 'mermaidBrowserKill.test.js'),
])
const ALL_E2E_TESTS = new Set([...SLOW_E2E_TESTS, ...OTHER_E2E_TESTS])

function findTests(dir, exts) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...findTests(full, exts))
    else if (exts.some(ext => entry.name.endsWith(ext))) files.push(full)
  }
  return files
}

const jsTests = findTests(testDir, ['.test.js']).filter(f => !ALL_E2E_TESTS.has(f))
const tsTests = findTests(path.join(testDir, 'lib', 'ran4'), ['.test.ts'])
const allUnitTests = [...jsTests, ...tsTests]

// e2e tests run individually after the main batch; slow ones skipped in --quick
const e2eTests = quick ? [] : [
  ...findTests(testDir, ['.test.js']).filter(f => OTHER_E2E_TESTS.has(f)),
  ...findTests(testDir, ['.test.js']).filter(f => SLOW_E2E_TESTS.has(f)),
]

console.log('Running tests...\n')

// Single node --test invocation for all unit tests (JS + RAN4 TypeScript)
const result = spawnSync(
  `"${process.execPath}"`,
  ['--import', 'tsx', '--test', '--test-reporter=spec', ...allUnitTests],
  { encoding: 'utf8', cwd: repoRoot, stdio: 'inherit', shell: true }
)

// Run e2e/integration tests individually
let e2eExitCode = 0
for (const file of e2eTests) {
  const rel = path.relative(testDir, file).replace(/\\/g, '/')
  console.log(`\n── ${rel} ──\n`)
  const r = spawnSync(process.execPath, [file], {
    encoding: 'utf8', cwd: path.dirname(file), stdio: 'inherit'
  })
  if (r.status !== 0) e2eExitCode = 1
}

process.exit((result.status || 0) + e2eExitCode > 0 ? 1 : 0)
