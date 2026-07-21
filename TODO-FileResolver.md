# Implementation Plan: FileResolver Redesign

## Goal

Replace the scattered `fileResolver` function, `cacheDir` option, in-memory Maps,
and normPath loops with a single **FileResolver** class that always exists and
provides uniform read/write access to spec files and the diagram cache.

## Current state (what we're removing)

### In-memory Map pattern (6+ locations)
```js
const cache = extractFilesFromCommit(repoRoot, commit, paths)  // → Map<absPath, Buffer|string>
const textReader = makeCachedTextReader(cache)                  // → (path) => string
const fileResolver = makeCachedFileResolver(cache)              // → (path) => Buffer|string
// + normPath loops everywhere for case-insensitive Windows matching
```

### Separate concepts that should be one
- `fileResolver` (function) — reads files from git cache Map
- `makeCachedTextReader` — same but text-only (for concatenateFiles)
- `cacheDir` option — where diagrams get cached
- `svgCacheDir(specRoot)` — default cache location
- `cleanupDiagramCache(specRoot)` — cleanup orphans

### Where normPath matching loops exist
- `gitHelpers.js`: `makeCachedFileResolver`, `makeCachedTextReader`
- `SpecPressExt/diffRenderer.js`: 3 loops for baseline content lookup
- `SpecPressExt/exportDocx.js`: inline fileResolver with loop
- `SpecPressExt/multiFilePreviewBuilder.js`: imageCache lookup loop

## New design

### FileResolver class (`lib/common/fileResolver.js`)

```js
const fs = require('fs')
const path = require('path')
const os = require('os')

class FileResolver {
  /**
   * @param {string} specRoot - Absolute path to the specification root.
   * @param {object} [opts]
   * @param {string|null} [opts.commit] - Git commit hash. When set, unpacks
   *   the commit to a persistent temp directory and serves files from there.
   * @param {string|null} [opts.repoRoot] - Git repo root (required when commit is set).
   * @param {string[]} [opts.searchPaths] - Paths to extract from commit (default: [specRoot]).
   */
  constructor(specRoot, opts = {}) {
    this.specRoot = specRoot
    this.commit = opts.commit || null
    this.repoRoot = opts.repoRoot || null

    if (this.commit) {
      // Unpack git commit to persistent temp dir named by commit hash
      this.rootDir = path.join(os.tmpdir(), 'specpress-cache', this.commit)
      this._unpackIfNeeded(opts.searchPaths || [specRoot])
    } else {
      // Local filesystem — rootDir is the repo root (parent of specRoot)
      this.rootDir = path.dirname(specRoot)
    }
  }

  /** Absolute path to the diagram cache directory. */
  get cacheDir() {
    return path.join(this.rootDir, 'cached')
  }

  /** Absolute path to the spec root within this resolver's tree. */
  get resolvedSpecRoot() {
    if (this.commit) {
      // Spec root relative to repo root, remapped into rootDir
      const relSpec = path.relative(path.dirname(this.specRoot), this.specRoot)
      return path.join(this.rootDir, relSpec)
    }
    return this.specRoot
  }

  /**
   * Reads a file by absolute path.
   * For git commits, maps the absolute path into the unpacked temp dir.
   * For local, reads directly from disk.
   */
  readFile(absPath, encoding) {
    const filePath = this._resolve(absPath)
    return encoding ? fs.readFileSync(filePath, encoding) : fs.readFileSync(filePath)
  }

  /**
   * Reads a file, returning null if it doesn't exist (no throw).
   */
  readFileOrNull(absPath, encoding) {
    const filePath = this._resolve(absPath)
    if (!fs.existsSync(filePath)) return null
    return encoding ? fs.readFileSync(filePath, encoding) : fs.readFileSync(filePath)
  }

  /**
   * Checks if a file exists.
   */
  exists(absPath) {
    return fs.existsSync(this._resolve(absPath))
  }

  /**
   * Returns the resolved absolute path for a file.
   * For local: returns absPath unchanged.
   * For git commit: returns the path within the unpacked temp dir.
   */
  getAbsPath(absPath) {
    return this._resolve(absPath)
  }

  /**
   * Whether this resolver represents local files (not a git commit).
   */
  get isLocal() {
    return !this.commit
  }

  // -- Private --

  _resolve(absPath) {
    if (!this.commit) return absPath
    // Map the original absolute path into our unpacked directory
    const rel = path.relative(path.dirname(this.specRoot), absPath)
    return path.join(this.rootDir, rel)
  }

  _unpackIfNeeded(searchPaths) {
    // If already unpacked (persistent across exports), skip
    if (fs.existsSync(this.rootDir)) return
    fs.mkdirSync(this.rootDir, { recursive: true })

    const { execFileSync } = require('child_process')
    // Use git archive + tar extraction to unpack files
    for (const p of searchPaths) {
      const rel = path.relative(this.repoRoot, p).replace(/\\/g, '/')
      const prefix = rel ? rel + '/' : ''
      try {
        const tar = execFileSync('git', ['archive', this.commit, '--', prefix], {
          cwd: this.repoRoot, maxBuffer: 50 * 1024 * 1024
        })
        this._extractTar(tar, this.rootDir)
      } catch (e) { /* path may not exist in that commit */ }
    }
    // Also unpack the cached/ directory if it exists in the commit
    try {
      const tar = execFileSync('git', ['archive', this.commit, '--', 'cached/'], {
        cwd: this.repoRoot, maxBuffer: 50 * 1024 * 1024
      })
      this._extractTar(tar, this.rootDir)
    } catch (e) { /* cached/ may not exist in that commit */ }
  }

  _extractTar(tar, destDir) {
    // Minimal tar extraction (same logic as current extractFilesFromCommit,
    // but writes to disk instead of a Map)
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

      if (typeFlag === 76) { // GNU long name
        longName = tar.slice(offset, offset + size).toString().replace(/\0/g, '').trim()
        offset += Math.ceil(size / 512) * 512
        continue
      }
      if (typeFlag === 120 || typeFlag === 103) { // pax headers
        offset += Math.ceil(size / 512) * 512
        continue
      }

      const name = longName || (prefixField ? prefixField + '/' + nameField : nameField)
      longName = ''

      if (typeFlag === 53 || name.endsWith('/')) { // directory
        const dirPath = path.join(destDir, name)
        fs.mkdirSync(dirPath, { recursive: true })
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
}

module.exports = { FileResolver }
```

### Key properties

| Aspect | Local | Git commit |
|--------|-------|------------|
| `rootDir` | `path.dirname(specRoot)` (repo root) | `os.tmpdir()/specpress-cache/<commitHash>/` |
| `cacheDir` | `rootDir/cached/` (git-tracked) | `rootDir/cached/` (inside temp, persists) |
| `readFile(abs)` | `fs.readFileSync(abs)` | `fs.readFileSync(mapped path in temp)` |
| `exists(abs)` | `fs.existsSync(abs)` | `fs.existsSync(mapped)` |
| Cleanup | runs `cleanupDiagramCache` | never (temp dir is self-contained) |
| Persistence | permanent (committed) | persists in OS temp until cleaned |

## Changes per file

### specpress/lib/common/fileResolver.js (NEW)
- The class above.

### specpress/lib/common/gitHelpers.js
- **Remove**: `makeCachedFileResolver`, `makeCachedTextReader`, `normPath`
- **Keep**: `getRepoRoot`, `getGitLog`, `collectFilesFromCommit`,
  `extractFilesFromCommit` (still useful for change tracking in SpecPressExt
  where we need the Map for diffing — OR we could use FileResolver there too)

Actually — for change tracking, SpecPressExt reads baseline text to diff against
current. It reads individual file contents by path. A FileResolver for the
baseline commit would work perfectly: `resolver.readFile(filePath, 'utf8')`.
The Map goes away entirely.

### specpress/lib/common/diagramCache.js
- `renderCached`: remove `opts.cacheDir`, use `opts.specRoot` only to derive
  the default. Callers pass the resolver's `cacheDir` directly.
  OR: pass the whole resolver and let renderCached use `resolver.cacheDir`.
  Simplest: just pass `cacheDir` string (already done, keep it).
- **Remove** the `cacheDir` option name confusion — rename parameter from
  specRoot to just accept the cacheDir directly. Actually no — `specRoot` is
  still needed for the "no specRoot → skip caching" short-circuit.
  Keep: `renderCached({ ..., specRoot, cacheDir })` where cacheDir overrides.

### specpress/lib/md2docx/md2docx.js
- Constructor: replace `fileResolver` (function) with `FileResolver` instance
  (or keep accepting it as a duck-type with `.readFile()` method).
- `readFile(filePath, encoding)`: call `this.fileResolver.readFile(filePath, encoding)`
  (when resolver exists) — minimal change since method already exists.
- `this.cacheDir`: read from `this.fileResolver.cacheDir` (when resolver exists)
  or fall back to `svgCacheDir(this.specRootPath)`.
- Remove the separate `options.cacheDir` constructor param.

### specpress/lib/md2html/md2html.js
- `_fileExists(absPath)`: call `this.fileResolver.exists(absPath)` when set.
- Minimal change — just adapt from function call to method call.

### specpress/lib/md2html/htmlDiff.js
- `baselineFileResolver`: accepts a FileResolver instance instead of a function.
- Swaps `handler.fileResolver` temporarily (same pattern, just an object now).

### specpress/lib/cli/export-html-diff.js
- Create `new FileResolver(specRoot, { commit, repoRoot })` for baseline.
- Pass `resolver` instead of `makeCachedFileResolver(cache)`.

### specpress/lib/md2docx/convertToDocx.js
- Create `new FileResolver(specRoot, { commit, repoRoot, searchPaths })`
  for git commits. For local: `new FileResolver(specRoot)`.
- Remove `makeCachedFileResolver`, `makeCachedTextReader` imports.
- `concatenateFiles(files, resolver.readFile.bind(resolver), specRoot)` — 
  or better: `concatenateFiles(files, (f) => resolver.readFile(f, 'utf8'), specRoot)`
- Remove separate `cacheDir` option — it comes from the resolver.

### SpecPressExt/src/vscode/exportDocx.js
- Create `new FileResolver(specRoot, { commit: commitInput, repoRoot })`.
- Remove inline fileResolver function with normPath loop.
- Pass resolver to converter.

### SpecPressExt/src/vscode/compareDocx.js
- Same pattern — one FileResolver per version.

### SpecPressExt/src/vscode/diffRenderer.js
- `state.changeTrackingBaseline` becomes a `FileResolver` instance.
- Replace all normPath + Map iteration with `resolver.readFile(path, 'utf8')`.
- Significantly simpler code.

### SpecPressExt/src/extension.js
- When enabling change tracking: create `new FileResolver(specRoot, { commit, repoRoot })`
  instead of `extractFilesFromCommit → Map`.
- Store `state.changeTrackingResolver` instead of `state.changeTrackingBaseline`.

### SpecPressExt/src/vscode/multiFilePreviewBuilder.js
- Replace `imageCache = extractFilesFromCommit(...)` + normPath loop
  with `imageResolver = new FileResolver(specRoot, { commit, repoRoot })`.
- `resolveImageUri` becomes: `const imgPath = imageResolver.getAbsPath(absPath); return toDataUri(imgPath)`.

## What gets removed

1. **`makeCachedFileResolver`** — replaced by FileResolver
2. **`makeCachedTextReader`** — replaced by `(f) => resolver.readFile(f, 'utf8')`
3. **`normPath` helper** — path normalization handled inside FileResolver._resolve
4. **All `for (const [key, val] of cache)` loops** (~8 locations) — gone
5. **The in-memory Map from `extractFilesFromCommit`** — for DOCX/HTML export paths.
   (For change tracking preview, we still need it OR switch to FileResolver there too.)
6. **`options.cacheDir` on the converter** — lives in the resolver
7. **Inline fileResolver construction in SpecPressExt exportDocx** — one-liner now

## What gets simpler

1. **diffRenderer.js**: The 6 normPath loops (baseline lookup, JSON lookup, etc.)
   all become `resolver.readFile(path, 'utf8')` — the resolver handles path mapping.

2. **File listing for git commits**: Currently `[...cache.keys()].filter(...)`.
   With FileResolver writing to disk, we can use `collectFiles(resolver.resolvedSpecRoot)`
   — the same function used for local files. **Unified file listing.**

3. **Image resolution in multiFilePreviewBuilder**: Currently reads Buffer from Map,
   converts to data URI inline. With FileResolver, the file is on disk, so
   `resolveImageUri(resolver.getAbsPath(absPath))` works with the webview URI
   mechanism — no data URIs needed (webview can read from localResourceRoots
   if we add the resolver's rootDir).

4. **Tests**: Tests for `makeCachedFileResolver` and `makeCachedTextReader` become
   tests for `FileResolver`. The git-commit export tests can just check that
   the temp dir gets populated and the resolver reads from it.

## What about the existing `extractFilesFromCommit`?

Two options:
- **Keep it** as an internal implementation detail of FileResolver._unpackIfNeeded
  (reuse the tar parsing logic but write to disk instead of Map).
- **Replace it** with the _extractTar method in FileResolver (write to disk directly).

I recommend replacing it — writing to disk is one pass, no intermediate Map.
The only user that truly needs the Map is change tracking in SpecPressExt's
live preview (reads individual files by path for diffing). But FileResolver
replaces that too — `resolver.readFile(path, 'utf8')` reads from the unpacked dir.

## Migration strategy

1. Create `lib/common/fileResolver.js` with the class.
2. Update `convertToDocx.js` first (self-contained, has tests via docx-diff e2e).
3. Update `md2docx.js` to accept FileResolver (duck-typed: anything with `.readFile()`).
4. Update `export-html-diff.js`.
5. Update `md2html.js` (minimal — just the exists check).
6. Update SpecPressExt callers (exportDocx, compareDocx, diffRenderer, multiFilePreviewBuilder, extension.js).
7. Remove `makeCachedFileResolver`, `makeCachedTextReader` from gitHelpers.js.
8. Remove `extractFilesFromCommit` (or keep as deprecated if needed elsewhere).

## Tests that change

- `gitHelpers.test.js`: Remove tests for `makeCachedFileResolver`, `makeCachedTextReader`.
  Add tests for `FileResolver` (local mode, git commit mode, cacheDir, exists, readFile).
- `fileResolver.test.js` (existing in md2docx/handlers/): Already tests that DOCX
  converter reads images via fileResolver — just needs to pass a FileResolver
  instance instead of a plain function.
- `docx-diff-e2e.test.js`: Should work unchanged (uses convertToDocx internally).
- `htmlDiff-e2e.test.js`: May need update if baselineFileResolver type changes.

## Tests that become easier

- Any test that currently constructs a Map + makeCachedFileResolver can instead
  create a temp directory with files and pass `new FileResolver(specRoot)`.
  This is more realistic and tests the actual file I/O path.

## Open question

**Should FileResolver always exist (even for local)?** Yes — it simplifies
consumer code. No more `if (this.fileResolver) ... else fs.readFileSync(...)`.
The converter's `readFile` method becomes just `this.resolver.readFile(path, enc)`.

For local files, the resolver is trivially `{ readFile: fs.readFileSync, exists: fs.existsSync, cacheDir: svgCacheDir(specRoot) }`.
