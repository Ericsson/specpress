const fs = require('fs')
const path = require('path')
const os = require('os')

/**
 * Unified file resolver for spec files — works identically for local files
 * and git commits.
 *
 * For local files, reads directly from the filesystem.
 * For git commits, unpacks the commit to a persistent temp directory once
 * and serves all subsequent reads from there.
 *
 * All read methods accept absolute paths as they appear on the local
 * filesystem (i.e. the same paths returned by collectFiles / collectFilesFromCommit).
 * For git commits, the resolver maps those local absolute paths into the
 * unpacked temp directory transparently.
 *
 * Constructor parameters:
 * @param {string} rootDir - Absolute path to the root of the file tree.
 *   For local: the repo root (parent of specRoot).
 *   For git commits: the temp directory where the commit will be unpacked,
 *   typically `os.tmpdir()/specpress-cache/<commitHash>/`.
 * @param {object} [opts]
 * @param {string} [opts.relSpecRoot] - Spec root relative to rootDir (e.g. 'spec').
 *   Used to expose `resolver.specRoot` as an absolute path.
 * @param {string} [opts.relCacheDir='cached'] - Diagram cache dir relative to rootDir.
 *   Defaults to 'cached' (a sibling of the spec root at the repo root level).
 * @param {string|null} [opts.commit] - Git commit hash. When set, the commit is
 *   unpacked to rootDir on first use.
 * @param {string|null} [opts.repoRoot] - Git repo root (required when commit is set).
 *   Used as the anchor for mapping local absolute paths into the temp dir.
 */

const SPEC_BODY_FILE_TYPES = ["md", "markdown", "asn", "asn1"]

class FileResolver {
  constructor(rootDir, opts = {}) {
    this.rootDir = rootDir
    this.relSpecRoot = opts.relSpecRoot || ''
    this.relCacheDir = opts.relCacheDir || 'cached'
    this.commit = opts.commit || null
    this.repoRoot = opts.repoRoot || null

    if (this.commit) {
      this._unpackIfNeeded()
    }
  }

  /** Absolute path to the spec root within this resolver's file tree which could be the regular local file system or a temporary folder to which the git commit has been unpacked. */
  get specRoot() {
    return this.relSpecRoot ? path.join(this.rootDir, this.relSpecRoot) : this.rootDir
  }

  /** Absolute path to the diagram cache directory. */
  get cacheDir() {
    return path.join(this.rootDir, this.relCacheDir)
  }

  /** Absolute path to the spec root in local filesystem coordinate space. */
  get specRootAbsLocal() {
    return this.commit ? path.join(this.repoRoot, this.relSpecRoot) : this.specRoot
  }

  /** Whether this resolver represents local files (not a git commit). */
  get isLocal() {
    return !this.commit
  }

  /**
   * Optional callback set by the caller to convert a local absolute path to
   * a URI suitable for the output context (e.g. a VS Code webview URI).
   * Left null for CLI/export use — the export pipeline handles image paths itself.
   * Set externally after construction: `resolver.resolveImageUri = (absPath) => ...`
   * @type {Function|null}
   */
  // resolveImageUri is intentionally not set in the constructor — assigned externally.

  /**
   * Reads a file by its local absolute path.
   * @param {string} absPath - Absolute path as it appears on the local filesystem.
   * @param {string} [encoding] - e.g. 'utf8'. Omit for Buffer.
   * @returns {Buffer|string}
   */
  readFile(absPath, encoding) {
    const p = this._resolve(absPath)
    return encoding ? fs.readFileSync(p, encoding) : fs.readFileSync(p)
  }

  /**
   * Reads a file, returning null if it does not exist.
   * @param {string} absPath
   * @param {string} [encoding]
   * @returns {Buffer|string|null}
   */
  readFileOrNull(absPath, encoding) {
    const p = this._resolve(absPath)
    if (!fs.existsSync(p)) return null
    return encoding ? fs.readFileSync(p, encoding) : fs.readFileSync(p)
  }

  /**
   * Returns true if the file exists.
   * @param {string} absPath
   * @returns {boolean}
   */
  exists(absPath) {
    return fs.existsSync(this._resolve(absPath))
  }

  /**
   * Returns the resolved absolute path for a file within this resolver's tree.
   * For local: returns absPath unchanged.
   * For git commits: returns the path within the unpacked temp dir.
   * @param {string} absPath
   * @returns {string}
   */
  getAbsPath(absPath) {
    return this._resolve(absPath)
  }

  /**
   * List files in the specification root directory.
   *
   * @param {boolean} isBodyFile - If set to true the returned array contains only files of file types the belong to the specification body, i.e., [md, markdown, asn, asn1]
   * @param {boolean} isRelative - If set to true, the returned paths are relative to the specification root directory.
   *
   * @returns absolute path names of files in spec root in a sorted array.
   */
  listSpecFiles(isBodyFile, isRelative) {
    const entries = fs.readdirSync(this.specRoot, { withFileTypes: true, recursive: true })
    let files = entries.filter(e => e.isFile()).map(e => path.join(e.parentPath, e.name))
    if (isBodyFile) {
      files = files.filter(f => SPEC_BODY_FILE_TYPES.includes(path.parse(f).ext.slice(1).toLowerCase()))
    }
    if (isRelative) {
      files = files.map(f => path.relative(this.specRoot, f))
    }
    return files
  }

  // -- Private --

  /**
   * Maps a local absolute path into this resolver's rootDir.
   * For local resolvers, returns the path unchanged.
   * For git resolvers, uses repoRoot as the anchor.
   */
  _resolve(absPath) {
    if (!this.commit) return absPath
    const anchor = this.repoRoot || path.dirname(this.specRoot)
    const rel = path.relative(anchor, absPath)
    return path.join(this.rootDir, rel)
  }

  _unpackIfNeeded() {
    if (fs.existsSync(this.rootDir)) return
    fs.mkdirSync(this.rootDir, { recursive: true })

    const { execFileSync } = require('child_process')
    const pathsToUnpack = []
    if (this.relSpecRoot) pathsToUnpack.push(this.relSpecRoot + '/')
    pathsToUnpack.push(this.relCacheDir + '/')

    for (const prefix of pathsToUnpack) {
      try {
        const tar = execFileSync('git', ['archive', this.commit, '--', prefix], {
          cwd: this.repoRoot, maxBuffer: 50 * 1024 * 1024
        })
        _extractTar(tar, this.rootDir)
      } catch (e) { /* path may not exist in that commit */ }
    }
  }
}

/**
 * Extracts a git archive tar buffer to a destination directory on disk.
 * Handles GNU long names and pax extended headers.
 * @param {Buffer} tar
 * @param {string} destDir
 */
function _extractTar(tar, destDir) {
  let offset = 0
  let longName = ''
  while (offset < tar.length - 512) {
    const header = tar.slice(offset, offset + 512)
    if (header.every(b => b === 0)) break
    const nameField = header.slice(0, 100).toString().replace(/\0/g, '').trim()
    const sizeStr = header.slice(124, 136).toString().replace(/\0/g, '').trim()
    const size = parseInt(sizeStr, 8) || 0
    const typeFlag = header[156]
    const prefixField = header.slice(345, 500).toString().replace(/\0/g, '').trim()
    offset += 512

    if (typeFlag === 76) { // GNU long name ('L')
      longName = tar.slice(offset, offset + size).toString().replace(/\0/g, '').trim()
      offset += Math.ceil(size / 512) * 512
      continue
    }
    if (typeFlag === 120 || typeFlag === 103) { // pax headers ('x', 'g')
      offset += Math.ceil(size / 512) * 512
      continue
    }

    const name = longName || (prefixField ? prefixField + '/' + nameField : nameField)
    longName = ''

    if (typeFlag === 53 || name.endsWith('/')) { // directory ('5')
      fs.mkdirSync(path.join(destDir, name), { recursive: true })
      offset += Math.ceil(size / 512) * 512
      continue
    }

    if (size > 0) {
      const filePath = path.join(destDir, name)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, tar.slice(offset, offset + size))
    }
    offset += Math.ceil(size / 512) * 512
  }
}

/**
 * Creates a FileResolver for local files.
 * @param {string} repoRoot - Absolute path to the repo root.
 * @param {string} specRoot - Absolute path to the spec root.
 * @returns {FileResolver}
 */
function createLocalResolver(repoRoot, specRoot) {
  const relSpecRoot = path.relative(repoRoot, specRoot)
  return new FileResolver(repoRoot, { relSpecRoot })
}

/**
 * Creates a FileResolver for a git commit.
 * Unpacks the commit to a persistent temp directory named by commit hash.
 * @param {string} repoRoot - Absolute path to the repo root.
 * @param {string} specRoot - Absolute path to the spec root (local filesystem).
 * @param {string} commit - Git commit hash or ref.
 * @returns {FileResolver}
 */
function createCommitResolver(repoRoot, specRoot, commit) {
  const relSpecRoot = path.relative(repoRoot, specRoot)
  const rootDir = path.join(os.tmpdir(), 'specpress-cache', commit)
  return new FileResolver(rootDir, { relSpecRoot, commit, repoRoot })
}

module.exports = { FileResolver, createLocalResolver, createCommitResolver }
