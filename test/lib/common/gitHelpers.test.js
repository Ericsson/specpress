const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')
const {
  extractFilesFromCommit,
  makeCachedFileResolver,
  makeCachedTextReader
} = require('../../../lib/common/gitHelpers')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

// ── Setup: create a temporary git repo with known files ──

const tmpBase = path.join(os.tmpdir(), 'specpress-git-test-' + Date.now())
const repoDir = path.join(tmpBase, 'repo')
fs.mkdirSync(path.join(repoDir, 'spec', 'sub'), { recursive: true })

fs.writeFileSync(path.join(repoDir, 'spec', '01.md'), '# Section 1\nHello')
fs.writeFileSync(path.join(repoDir, 'spec', '02.asn'), 'MODULE DEFINITIONS ::= BEGIN\nEND')
fs.writeFileSync(path.join(repoDir, 'spec', 'data.json'), '{"key": "value"}')
fs.writeFileSync(path.join(repoDir, 'spec', 'sub', 'nested.md'), '## Nested\nContent')
fs.writeFileSync(path.join(repoDir, 'spec', 'image.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47]))
fs.writeFileSync(path.join(repoDir, 'spec', 'ignored.txt'), 'should not be extracted')
fs.writeFileSync(path.join(repoDir, 'spec', 'ignored.js'), 'console.log("skip")')

execSync('git init', { cwd: repoDir, stdio: 'pipe' })
execSync('git config commit.gpgsign false', { cwd: repoDir, stdio: 'pipe' })
execSync('git add -A', { cwd: repoDir, stdio: 'pipe' })
execSync('git -c user.email="test@test.com" -c user.name="Test" commit -m "initial"', { cwd: repoDir, stdio: 'pipe' })

const commitHash = execSync('git rev-parse HEAD', { cwd: repoDir, encoding: 'utf8' }).trim()

// ── extractFilesFromCommit ──

console.log('extractFilesFromCommit')

test('extracts .md files from commit', () => {
  const cache = extractFilesFromCommit(repoDir, commitHash, [path.join(repoDir, 'spec')])
  const keys = [...cache.keys()]
  const mdFiles = keys.filter(k => k.endsWith('.md'))
  assert.strictEqual(mdFiles.length, 2, `Expected 2 .md files, got ${mdFiles.length}`)
})

test('extracts .asn files from commit', () => {
  const cache = extractFilesFromCommit(repoDir, commitHash, [path.join(repoDir, 'spec')])
  const keys = [...cache.keys()]
  const asnFiles = keys.filter(k => k.endsWith('.asn'))
  assert.strictEqual(asnFiles.length, 1)
})

test('extracts .json files from commit', () => {
  const cache = extractFilesFromCommit(repoDir, commitHash, [path.join(repoDir, 'spec')])
  const keys = [...cache.keys()]
  const jsonFiles = keys.filter(k => k.endsWith('.json'))
  assert.strictEqual(jsonFiles.length, 1)
})

test('extracts image files as Buffer', () => {
  const cache = extractFilesFromCommit(repoDir, commitHash, [path.join(repoDir, 'spec')])
  const keys = [...cache.keys()]
  const pngFile = keys.find(k => k.endsWith('.png'))
  assert.ok(pngFile, 'should find .png file')
  assert.ok(Buffer.isBuffer(cache.get(pngFile)), 'image should be a Buffer')
})

test('extracts text files as string', () => {
  const cache = extractFilesFromCommit(repoDir, commitHash, [path.join(repoDir, 'spec')])
  const keys = [...cache.keys()]
  const mdFile = keys.find(k => k.endsWith('01.md'))
  assert.ok(mdFile)
  assert.strictEqual(typeof cache.get(mdFile), 'string')
  assert.ok(cache.get(mdFile).includes('# Section 1'))
})

test('does not extract .txt or .js files', () => {
  const cache = extractFilesFromCommit(repoDir, commitHash, [path.join(repoDir, 'spec')])
  const keys = [...cache.keys()]
  const txtFiles = keys.filter(k => k.endsWith('.txt') || k.endsWith('.js'))
  assert.strictEqual(txtFiles.length, 0, `Should not extract .txt/.js, got: ${txtFiles}`)
})

test('extracts files from subdirectories', () => {
  const cache = extractFilesFromCommit(repoDir, commitHash, [path.join(repoDir, 'spec')])
  const keys = [...cache.keys()]
  const nested = keys.find(k => k.includes('nested.md'))
  assert.ok(nested, 'should find nested.md in subdirectory')
  assert.ok(cache.get(nested).includes('## Nested'))
})

test('handles non-existent path gracefully', () => {
  const cache = extractFilesFromCommit(repoDir, commitHash, [path.join(repoDir, 'nonexistent')])
  assert.strictEqual(cache.size, 0)
})

test('returns absolute paths as keys', () => {
  const cache = extractFilesFromCommit(repoDir, commitHash, [path.join(repoDir, 'spec')])
  for (const key of cache.keys()) {
    assert.ok(path.isAbsolute(key), `Key should be absolute: ${key}`)
  }
})

// ── makeCachedFileResolver ──

console.log('\nmakeCachedFileResolver')

test('returns cached content on exact match', () => {
  const cache = new Map()
  cache.set('/repo/file.png', Buffer.from('image data'))
  const resolver = makeCachedFileResolver(cache)
  const result = resolver('/repo/file.png')
  assert.ok(Buffer.isBuffer(result))
  assert.strictEqual(result.toString(), 'image data')
})

test('returns cached content on case-insensitive match', () => {
  const cache = new Map()
  cache.set('C:\\Repo\\File.md', 'content')
  const resolver = makeCachedFileResolver(cache)
  const result = resolver('c:\\repo\\file.md')
  assert.strictEqual(result, 'content')
})

test('returns cached content with slash normalization', () => {
  const cache = new Map()
  cache.set('C:\\Repo\\sub\\file.md', 'hello')
  const resolver = makeCachedFileResolver(cache)
  const result = resolver('C:/Repo/sub/file.md')
  assert.strictEqual(result, 'hello')
})

test('falls back to filesystem when not in cache', () => {
  const cache = new Map()
  const resolver = makeCachedFileResolver(cache)
  // Read a file we know exists
  const thisFile = __filename
  const result = resolver(thisFile)
  assert.ok(Buffer.isBuffer(result) || typeof result === 'string')
  assert.ok(result.length > 0)
})

// ── makeCachedTextReader ──

console.log('\nmakeCachedTextReader')

test('returns string content on exact match', () => {
  const cache = new Map()
  cache.set('/repo/file.md', '# Hello')
  const reader = makeCachedTextReader(cache)
  assert.strictEqual(reader('/repo/file.md'), '# Hello')
})

test('converts Buffer to string', () => {
  const cache = new Map()
  cache.set('/repo/file.md', Buffer.from('buffer content'))
  const reader = makeCachedTextReader(cache)
  assert.strictEqual(reader('/repo/file.md'), 'buffer content')
})

test('returns string on case-insensitive match', () => {
  const cache = new Map()
  cache.set('C:\\Repo\\File.md', 'upper case path')
  const reader = makeCachedTextReader(cache)
  assert.strictEqual(reader('c:\\repo\\file.md'), 'upper case path')
})

test('converts Buffer on case-insensitive match', () => {
  const cache = new Map()
  cache.set('C:\\Repo\\File.md', Buffer.from('buf'))
  const reader = makeCachedTextReader(cache)
  assert.strictEqual(reader('c:\\repo\\file.md'), 'buf')
})

test('falls back to filesystem when not in cache', () => {
  const cache = new Map()
  const reader = makeCachedTextReader(cache)
  const result = reader(__filename)
  assert.strictEqual(typeof result, 'string')
  assert.ok(result.includes('makeCachedTextReader'))
})

// ── Cleanup ──

try {
  fs.rmSync(tmpBase, { recursive: true, force: true })
} catch (e) { /* ignore */ }

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
