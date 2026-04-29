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
 * Reads a file's content from a specific git commit.
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

module.exports = { getRepoRoot, getFileFromCommit, collectFilesFromCommit, getGitLog }
