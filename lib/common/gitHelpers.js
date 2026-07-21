const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

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
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: filePath, encoding: 'utf8' }).trim()
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
  return execFileSync('git', ['show', `${commit}:${rel}`], { cwd: repoRoot, encoding: 'utf8' })
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
  return execFileSync('git', ['show', `${commit}:${rel}`], { cwd: repoRoot, maxBuffer: 50 * 1024 * 1024 })
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
    const prefix = isDir ? (rel ? rel + '/' : '.') : (rel || '.')
    try {
      const listing = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', prefix], { cwd: repoRoot, encoding: 'utf8' })
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
  const raw = execFileSync(
    'git', ['log', '--all', `--format=%H%x09%h%x09%s%x09%D`, '-n', String(maxCount)],
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
      const tar = execFileSync('git', ['archive', commit, '--', prefix], {
        cwd: repoRoot, maxBuffer: 50 * 1024 * 1024
      })
      let offset = 0
      let longName = ''
      while (offset < tar.length - 512) {
        const header = tar.slice(offset, offset + 512)
        // Two consecutive zero blocks mark end of archive
        if (header.every(b => b === 0)) break
        const nameField = header.slice(0, 100).toString().replace(/\0/g, '').trim()
        const sizeStr = header.slice(124, 136).toString().replace(/\0/g, '').trim()
        const size = parseInt(sizeStr, 8) || 0
        const typeFlag = header[156]  // ASCII char: '0'=file, '5'=dir, 'L'=GNU long name, 'x'/'g'=pax
        // GNU ustar prefix (bytes 345-500) for paths > 100 chars
        const prefixField = header.slice(345, 500).toString().replace(/\0/g, '').trim()
        offset += 512

        // Handle GNU long name extension
        if (typeFlag === 76 /* 'L' */) {
          longName = tar.slice(offset, offset + size).toString().replace(/\0/g, '').trim()
          offset += Math.ceil(size / 512) * 512
          continue
        }

        // Skip pax extended headers
        if (typeFlag === 120 /* 'x' */ || typeFlag === 103 /* 'g' */) {
          offset += Math.ceil(size / 512) * 512
          continue
        }

        // Resolve actual file name
        const name = longName || (prefixField ? prefixField + '/' + nameField : nameField)
        longName = ''

        // Skip directories (type '5' or name ending with '/')
        if (typeFlag === 53 /* '5' */ || name.endsWith('/')) {
          offset += Math.ceil(size / 512) * 512
          continue
        }

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

module.exports = {
  getRepoRoot,
  getFileFromCommit,
  getBinaryFileFromCommit,
  collectFilesFromCommit,
  getGitLog
}
