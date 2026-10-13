const fs = require('fs')
const path = require('path')
const { Md2Html } = require('./md2html')
const { diffHtml } = require('./htmlDiff')
const { collectFiles, concatenateFiles, formatExportMessage, insertOmittedMarkers } = require('../common/specProcessor')
const { collectFilesFromCommit } = require('../common/gitHelpers')
const { createCommitResolver, createLocalResolver } = require('../common/fileResolver')
const { getRepoRoot } = require('../common/gitHelpers')
const { loadMermaidConfig } = require('../common/mermaidConfig')

/**
 * Exports a set of spec files to a standalone HTML file (plain or diff).
 *
 * This is the single shared implementation used by both the CLI scripts and
 * the SpecPressExt VS Code command. It handles:
 *   - Local files or any git commit/branch/tag as source
 *   - Optional diff between two versions (base vs compare)
 *   - Image copying to a media/ directory (resolver-aware for git sources)
 *   - Two-pass image copy for diffs (deleted images get _old suffix)
 *   - Omitted-section markers when a partial selection is exported
 *
 * @param {object} opts
 * @param {string[]} opts.inputPaths - Absolute paths to files/folders to export.
 * @param {string} opts.outputPath - Absolute path to the output .html file.
 * @param {string} [opts.specRoot=''] - Absolute path to the spec root (for section numbering).
 * @param {string|null} [opts.repoRoot=null] - Absolute path to the git repo root. Required when baseCommit or compareCommit is set.
 * @param {string|null} [opts.baseCommit=null] - Git commit for the base (old) version. 'local' or null = working copy.
 * @param {string|null} [opts.compareCommit=null] - Git commit for the compare (new) version. When set, a diff is produced. 'local' = working copy.
 * @param {string} [opts.css=''] - CSS content to embed.
 * @param {string} [opts.mermaidConfig='{}'] - Mermaid config JSON string.
 * @param {string|null} [opts.mscgenConfig=null] - MSC-Gen config JSON string.
 * @param {object|null} [opts.frontPageData=null] - Front page JSON data.
 * @param {object|null} [opts.crCoverPageData=null] - CR cover page JSON data.
 * @param {boolean} [opts.insertOmitted=false] - Insert omitted-section markers when exporting a partial selection.
 * @param {boolean} [opts.embedImages=true] - Embed images as base64 data URIs instead of copying to media/.
 * @returns {{ fileCount: number, imageCount: number, message: string }}
 */
function exportHtml(opts) {
  const {
    inputPaths,
    outputPath,
    specRoot = '',
    repoRoot = null,
    baseCommit = null,
    compareCommit = null,
    css = '',
    mermaidConfig = loadMermaidConfig(null) || '{}',
    mscgenConfig = null,
    frontPageData = null,
    crCoverPageData = null,
    insertOmitted = false,
    embedImages = true,
  } = opts

  const isDiff = compareCommit !== null && compareCommit !== undefined

  // -- Resolvers --
  // baseResolver: reads the base (old) version — a git commit or local files
  // compareResolver: reads the compare (new) version — only set for diffs
  let baseResolver = null
  if (baseCommit && baseCommit !== 'local' && specRoot && repoRoot) {
    baseResolver = createCommitResolver(repoRoot, specRoot, baseCommit)
  } else if (specRoot && repoRoot) {
    baseResolver = createLocalResolver(repoRoot, specRoot)
  }

  let compareResolver = null
  if (isDiff) {
    if (compareCommit && compareCommit !== 'local' && specRoot && repoRoot) {
      compareResolver = createCommitResolver(repoRoot, specRoot, compareCommit)
    } else if (specRoot && repoRoot) {
      compareResolver = createLocalResolver(repoRoot, specRoot)
    }
  }

  // -- Collect and concatenate base files --
  const baseFiles = (baseCommit && baseCommit !== 'local' && repoRoot)
    ? collectFilesFromCommit(repoRoot, inputPaths, baseCommit)
    : collectFiles(inputPaths)

  const baseReadFile = baseResolver ? (f) => baseResolver.readFile(f, 'utf8') : undefined
  let baseContent = concatenateFiles(baseFiles, baseReadFile, specRoot)

  if (insertOmitted && specRoot) {
    const allSpecFiles = collectFiles([specRoot])
    if (baseFiles.length < allSpecFiles.length) {
      baseContent = insertOmittedMarkers(baseContent, baseFiles, allSpecFiles)
    }
  }

  // -- Build handler --
  // fileResolver is set to baseResolver so a single-commit (non-diff) export of
  // historical content caches its rendered mermaid/mscgen diagrams into that
  // resolver's own cacheDir (local, or a commit's unpacked temp directory) rather
  // than the real local cached/ folder. For diffs, diffHtml() overrides the
  // resolver per-side (baseline vs current) on each renderBody() call anyway.
  const handler = new Md2Html({ css, mermaidConfig, mscgenConfig, specRootPath: specRoot, fileResolver: baseResolver })

  // -- Render HTML --
  const outputDir = path.dirname(outputPath)
  const mediaDir = path.join(outputDir, 'media')
  if (!embedImages) fs.mkdirSync(mediaDir, { recursive: true })

  let html
  let compareFiles = []
  if (isDiff) {
    compareFiles = (compareCommit && compareCommit !== 'local' && repoRoot)
      ? collectFilesFromCommit(repoRoot, inputPaths, compareCommit)
      : collectFiles(inputPaths)
    const compareReadFile = (compareResolver && compareCommit && compareCommit !== 'local')
      ? (f) => compareResolver.readFile(f, 'utf8') : undefined
    let compareContent = concatenateFiles(compareFiles, compareReadFile, specRoot)

    // Apply the same omitted-section markers to the compare (new) version as the base
    // (old) version. Omitting this on one side only (a prior bug) makes diffHtml see an
    // "=== unmodified sections omitted ===" block present on one side with no
    // counterpart on the other, which htmldiff-js then renders as a spurious
    // deletion/insertion unrelated to the user's actual edits — most noticeable when a
    // partial selection also contains genuinely new content (e.g. a newly added
    // subsection with new images), since the omitted-marker artifact gets tangled up
    // with the real insertion in the diff output.
    if (insertOmitted && specRoot) {
      const allSpecFiles = collectFiles([specRoot])
      if (compareFiles.length < allSpecFiles.length) {
        compareContent = insertOmittedMarkers(compareContent, compareFiles, allSpecFiles)
      }
    }

    html = handler.renderMarkdownForExport(compareContent, specRoot, frontPageData, crCoverPageData)
    const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/)
    if (bodyMatch) {
      const diffBody = diffHtml({
        baselineContent: baseContent,
        currentContent: compareContent,
        handler,
        baselineFileResolver: baseResolver,
        currentFileResolver: compareResolver,
        frontPageData,
        crCoverPageData,
      })
      html = html.replace(bodyMatch[0], '<body>' + diffBody + '</body>')
    }
  } else {
    html = handler.renderMarkdownForExport(baseContent, specRoot, frontPageData, crCoverPageData)
  }

  html = html.replace(/\s*data-source-line="\d+"/g, '')
  html = html.replace(/\s*data-source-file="[^"]*"/g, '')

  // -- Copy images to media/ --
  // Resolves image paths relative to spec root parent first (covers cached/ SVGs),
  // then falls back to each source file's directory.
  const copiedImages = new Map()

  const resolveImagePath = (src) => {
    if (path.isAbsolute(src)) return src
    if (specRoot) {
      const c = path.join(path.dirname(specRoot), src)
      if (fs.existsSync(c) ||
          (baseResolver && baseResolver.exists(c)) ||
          (compareResolver && compareResolver.exists(c))) return c
    }
    // Fall back to resolving the image relative to each source file's own
    // directory (the common convention of a co-located `assets/` folder next
    // to the markdown file). Must check the resolvers here too, not just
    // fs.existsSync — otherwise an image that was renamed/moved/deleted in the
    // local working copy, but still exists at this path in a git-commit
    // resolver (e.g. the baseline side of a diff), is never found: the local
    // file no longer exists there, so fs.existsSync fails, and without the
    // resolver check the <img> tag is left completely unresolved (shown as an
    // empty figure box instead of the actual baseline image).
    for (const f of [...baseFiles, ...compareFiles]) {
      const c = path.join(path.dirname(f), src)
      if (fs.existsSync(c) ||
          (baseResolver && baseResolver.exists(c)) ||
          (compareResolver && compareResolver.exists(c))) return c
    }
    return null
  }

  const mimeType = (imagePath) => {
    const ext = path.extname(imagePath).toLowerCase()
    return { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
             '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[ext] || 'image/png'
  }

  const copyImage = (imagePath, resolver, suffix) => {
    const key = imagePath + suffix
    if (copiedImages.has(key)) return copiedImages.get(key)
    try {
      const data = (resolver && resolver.exists(imagePath))
        ? resolver.readFile(imagePath)
        : fs.readFileSync(imagePath)
      if (embedImages) {
        const dataUri = `data:${mimeType(imagePath)};base64,${Buffer.from(data).toString('base64')}`
        copiedImages.set(key, dataUri)
        return dataUri
      }
      const ext = path.extname(imagePath)
      const rel = specRoot
        ? path.relative(path.dirname(specRoot), imagePath)
        : path.basename(imagePath)
      const safeName = rel.slice(0, -ext.length).replace(/[\\/.]+/g, '_').replace(/^_+/, '') + suffix + ext
      fs.writeFileSync(path.join(mediaDir, safeName), data)
      copiedImages.set(key, safeName)
      return safeName
    } catch (e) { return null }
  }

  // Pass 1: images inside diff-del-block → read from baseResolver, suffix '_old'
  html = html.replace(/(<div class="diff-del-block"[^>]*>)([\s\S]*?)(<\/div>)/g, (block, open, inner, close) => {
    const newInner = inner.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (match, before, src, after) => {
      if (/^(https?:|data:)/.test(src)) return match
      const imagePath = resolveImagePath(src)
      if (!imagePath) return match
      const safeName = copyImage(imagePath, baseResolver, '_old')
      const srcVal = embedImages ? safeName : `media/${safeName}`
      return safeName ? `<img${before}src="${srcVal}"${after}>` : match
    })
    return open + newInner + close
  })

  // Pass 2: all remaining images → read from compareResolver (or fs), no suffix
  html = html.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (match, before, src, after) => {
    if (/^(https?:|data:)/.test(src)) return match
    const imagePath = resolveImagePath(src)
    if (!imagePath) return match
    const resolver = (compareResolver && compareResolver.exists(imagePath)) ? compareResolver
      : (baseResolver && baseResolver.exists(imagePath)) ? baseResolver : null
    const safeName = copyImage(imagePath, resolver, '')
    const srcVal = embedImages ? safeName : `media/${safeName}`
    return safeName ? `<img${before}src="${srcVal}"${after}>` : match
  })

  html = html.replace(/<!-- FILE: [^>]+ -->/g, '')
  fs.writeFileSync(outputPath, html)

  const imageCount = copiedImages.size
  const exportLabel = isDiff ? 'HTML diff' : 'HTML'
  return {
    fileCount: baseFiles.length,
    imageCount,
    message: formatExportMessage(exportLabel, baseFiles.length, imageCount)
  }
}

module.exports = { exportHtml }
