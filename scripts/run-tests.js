const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

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
console.log(`${testFiles.length} test file(s), ${results.filter(r => !r.ok).length} failed`)
if (totalPassed || totalFailed) {
  console.log(`${totalPassed} passed, ${totalFailed} failed (total)`)
}
process.exit(totalFailed > 0 ? 1 : 0)
