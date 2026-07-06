const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

/**
 * Git utility functions for specification processing.
 *
 * These are VSCode-independent and can be used in CLI tools and CI pipelines.
 */

/**
 * Returns the git repository root for a given path.
 *
 * @param {string} filePath - Any path inside the repository.
 * @returns {string} Absolute path to the repository root.
 */
function getRepoRoot(filePath) {
  return execSync('git rev-parse --show-toplevel', { cwd: filePath, encoding: 'utf8' }).trim()
}

/**
 * Reads a file's content from a specific git commit as a UTF-8 string.
 *
 * @param {string} repoRoot - Absolute path to the repository root.
 * @param {string} absPath - Absolute path to the file.
 * @param {string} commit - Git commit reference (hash, HEAD, tag, etc.).
 * @returns {string} File content at that commit.
 */
function getFileFromCommit(repoRoot, absPath, commit) {
  const rel = path.relative(repoRoot, absPath).replace(/\\/g, '/')
  return execSync(`git show "${commit}:${rel}"`, { cwd: repoRoot, encoding: 'utf8' })
}

/**
 * Reads a file's content from a specific git commit as a Buffer (binary-safe).
 *
 * @param {string} repoRoot - Absolute path to the repository root.
 * @param {string} absPath - Absolute path to the file.
 * @param {string} commit - Git commit reference (hash, HEAD, tag, etc.).
 * @returns {Buffer} File content at that commit.
 */
function getBinaryFileFromCommit(repoRoot, absPath, commit) {
  const rel = path.relative(repoRoot, absPath).replace(/\\/g, '/')
  return execSync(`git show "${commit}:${rel}"`, { cwd: repoRoot, maxBuffer: 50 * 1024 * 1024 })
}

/**
 * Collects spec files that exist in a git commit, filtered to the given paths.
 *
 * For each path, lists tracked files under that path at the given commit.
 * Filters for .md, .markdown, and .asn extensions.
 *
 * @param {string} repoRoot - Absolute path to the repository root.
 * @param {string[]} paths - Absolute paths to files or directories.
 * @param {string} commit - Git commit reference.
 * @returns {string[]} Sorted array of absolute file paths that exist in the commit.
 */
function collectFilesFromCommit(repoRoot, paths, commit) {
  const files = []
  for (const p of paths) {
    const rel = path.relative(repoRoot, p).replace(/\\/g, '/')
    const isDir = fs.existsSync(p) && fs.statSync(p).isDirectory()
    const prefix = isDir ? (rel ? rel + '/' : '') : rel
    try {
      const listing = execSync(`git ls-tree -r --name-only ${commit} -- "${prefix}"`, { cwd: repoRoot, encoding: 'utf8' })
      listing.trim().split('\n').filter(Boolean).forEach(f => {
        if (f.endsWith('.md') || f.endsWith('.markdown') || f.endsWith('.asn')) {
          files.push(path.join(repoRoot, f))
        }
      })
    } catch (e) {
      // path may not exist in that commit — skip
    }
  }
  return [...new Set(files)].sort()
}

/**
 * Returns recent git log entries.
 *
 * @param {string} repoRoot - Absolute path to the repository root.
 * @param {number} [maxCount=200] - Maximum number of entries to return.
 * @returns {{hash: string, shortHash: string, subject: string, refNames: string}[]}
 */
function getGitLog(repoRoot, maxCount = 200) {
  const raw = execSync(
    `git log --all --format="%H%x09%h%x09%s%x09%D" -n ${maxCount}`,
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  )
  return raw.trim().split('\n').filter(Boolean).map(line => {
    const [hash, shortHash, subject, refNames] = line.split('\t')
    return { hash, shortHash, subject, refNames: refNames || '' }
  })
}

/**
 * Bulk-extracts spec-relevant files from a git commit using git archive + tar parsing.
 * Returns a Map of absolute path to content (Buffer for binary files, string for text).
 *
 * @param {string} repoRoot - Absolute path to the repository root.
 * @param {string} commit - Git commit reference.
 * @param {string[]} searchPaths - Absolute paths to directories to extract from.
 * @returns {Map<string, Buffer|string>} Map of absolute file path to content.
 */
function extractFilesFromCommit(repoRoot, commit, searchPaths) {
  const cache = new Map()
  for (const p of searchPaths) {
    const rel = path.relative(repoRoot, p).replace(/\\/g, '/')
    const prefix = rel ? rel + '/' : ''
    try {
      const tar = execSync(`git archive ${commit} -- "${prefix}"`, {
        cwd: repoRoot, maxBuffer: 50 * 1024 * 1024
      })
      let offset = 0
      while (offset < tar.length - 512) {
        const header = tar.slice(offset, offset + 512)
        const name = header.slice(0, 100).toString().replace(/\0/g, '').trim()
        if (!name) break
        const sizeStr = header.slice(124, 136).toString().replace(/\0/g, '').trim()
        const size = parseInt(sizeStr, 8) || 0
        offset += 512
        if (size > 0 && /\.(md|markdown|asn|json|png|jpg|jpeg|gif|bmp|svg)$/.test(name)) {
          const isImage = /\.(png|jpg|jpeg|gif|bmp|svg)$/.test(name)
          const content = isImage
            ? tar.slice(offset, offset + size)
            : tar.slice(offset, offset + size).toString('utf8')
          cache.set(path.join(repoRoot, name), content)
        }
        offset += Math.ceil(size / 512) * 512
      }
    } catch (e) { /* path may not exist in that commit */ }
  }
  return cache
}

/**
 * Creates a file resolver from a pre-extracted cache.
 * Falls back to the local filesystem if the file isn't in the cache.
 *
 * @param {Map<string, Buffer|string>} cache - Map from extractFilesFromCommit.
 * @returns {function(string): Buffer|string} File resolver function.
 */
function makeCachedFileResolver(cache) {
  const normPath = (p) => p.replace(/\\/g, '/').toLowerCase()
  return (filePath) => {
    if (cache.has(filePath)) return cache.get(filePath)
    const target = normPath(filePath)
    for (const [key, val] of cache) {
      if (normPath(key) === target) return val
    }
    return fs.readFileSync(filePath)
  }
}

/**
 * Creates a text file reader from a pre-extracted cache (for concatenateFiles).
 * Falls back to the local filesystem if the file isn't in the cache.
 *
 * @param {Map<string, Buffer|string>} cache - Map from extractFilesFromCommit.
 * @returns {function(string): string} Text reader function.
 */
function makeCachedTextReader(cache) {
  const normPath = (p) => p.replace(/\\/g, '/').toLowerCase()
  return (filePath) => {
    if (cache.has(filePath)) {
      const content = cache.get(filePath)
      return Buffer.isBuffer(content) ? content.toString('utf8') : content
    }
    const target = normPath(filePath)
    for (const [key, val] of cache) {
      if (normPath(key) === target) {
        return Buffer.isBuffer(val) ? val.toString('utf8') : val
      }
    }
    return fs.readFileSync(filePath, 'utf8')
  }
}

module.exports = {
  getRepoRoot,
  getFileFromCommit,
  getBinaryFileFromCommit,
  collectFilesFromCommit,
  getGitLog,
  extractFilesFromCommit,
  makeCachedFileResolver,
  makeCachedTextReader
}
