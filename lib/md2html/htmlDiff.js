/**
 * HTML diff engine — produces word-level tracked changes between two versions
 * of a markdown specification.
 *
 * Renders both baseline and current markdown to HTML, replaces images and
 * diagrams with stable placeholders, runs htmldiff-js for word-level diffing,
 * and restores placeholders with appropriate diff visualization.
 */
const path = require('path')
const crypto = require('crypto')
const HtmlDiff = require('htmldiff-js')

/**
 * Produces an HTML diff (tracked changes) between baseline and current content.
 *
 * @param {object} opts - Options.
 * @param {string} opts.baselineContent - Baseline markdown content (old version).
 * @param {string} opts.currentContent - Current markdown content (new version).
 * @param {object} opts.handler - Md2Html instance for rendering. Its specRootPath,
 *   css, mermaidConfig, resolveImageUri etc. are used for both renders.
 * @param {object|null} [opts.baselineFileResolver=null] - FileResolver for the baseline
 *   version. Its resolveImageUri property is used for URI mapping when restoring placeholders.
 *   When null, falls back to the handler's own fileResolver.
 * @param {object|null} [opts.frontPageData=null] - Front page JSON data.
 * @param {object|null} [opts.crCoverPageData=null] - CR cover page JSON data.
 * @returns {string} HTML body content with <ins>/<del> tracked changes.
 */
function diffHtml(opts) {
  const {
    baselineContent = '',
    currentContent = '',
    handler,
    baselineFileResolver = null,
    frontPageData = null,
    crCoverPageData = null,
  } = opts

  const currentFileResolver = handler.fileResolver || null

  // Render both versions with resolveUris=true but using a pass-through resolver
  // that returns the absolute path as-is (no webview URI conversion). This gives us
  // absolute src paths in the rendered HTML so we can read file content for hashing.
  const makeAbsResolver = (resolver) => {
    if (!resolver) return null
    return Object.assign(Object.create(Object.getPrototypeOf(resolver)), resolver, {
      resolveImageUri: (absPath) => absPath
    })
  }
  const baselineAbsResolver = makeAbsResolver(baselineFileResolver || currentFileResolver)
  const currentAbsResolver = makeAbsResolver(currentFileResolver)

  const baselineBody = handler.renderBody(
    baselineContent, false, null, null, null, frontPageData, crCoverPageData, true, baselineAbsResolver
  )
  const renderedCurrentBody = handler.renderBody(
    currentContent, false, null, null, null, frontPageData, crCoverPageData, true, currentAbsResolver
  )

  // Helper: rewrite absolute src paths to webview URIs using a resolver.
  const resolveImgSrc = (html, resolver) => {
    if (!resolver || !resolver.resolveImageUri) return html
    return html.replace(/ src="([^"]+)"/g, (match, src) => {
      if (/^(https?:|data:|vscode-)/.test(src)) return match
      return ` src="${resolver.resolveImageUri(src)}"`
    })
  }

  // Hash file content for stable image identity across versions.
  const hashContent = (data) => crypto.createHash('md5').update(data).digest('hex').substring(0, 12)
  const hashFile = (absPath, resolver) => {
    try {
      const buf = resolver ? resolver.readFile(absPath) : require('fs').readFileSync(absPath)
      return hashContent(buf)
    } catch (e) {
      return hashContent(absPath) // fall back to path hash if file unreadable
    }
  }

  // Replace standalone images with content-hash placeholders before diffing.
  // Mermaid/mscgen <div>/<pre> blocks are left untouched — htmldiff-js diffs them
  // naturally since their src filenames already encode the diagram content hash.
  // <img> tags inside mermaid/mscgen blocks are skipped to avoid double-handling.
  const placeholders = new Map()

  function replaceBlocks(html, version, resolver) {
    // Replace <img> tags that are NOT inside a mermaid/mscgen block.
    // Match either a mermaid/mscgen block (to skip) or a standalone <img>.
    html = html.replace(/(<(?:div|pre) class="(?:mermaid|mscgen)[^"]*"[^>]*>[\s\S]*?<\/(?:div|pre)>)|(<img[^>]*>)/g,
      (match, diagramBlock, imgTag) => {
        if (diagramBlock) return diagramBlock  // leave mermaid/mscgen blocks untouched
        const src = (imgTag.match(/src="([^"]+)"/) || [])[1] || ''
        const contentHash = src ? hashFile(src, resolver) : hashContent(imgTag)
        const id = `IMG_${contentHash}`
        if (!placeholders.has(id)) placeholders.set(id, {})
        placeholders.get(id)[version] = imgTag
        return ` ${id} `
      }
    )
    return html
  }

  const processedBaseline = replaceBlocks(baselineBody, 'baseline', baselineFileResolver || currentFileResolver)
  const processedCurrent = replaceBlocks(renderedCurrentBody, 'current', currentFileResolver)

  // Run word-level HTML diff
  let diffedBody = HtmlDiff.default.execute(processedBaseline, processedCurrent)

  // Post-process mermaid/mscgen blocks: htmldiff-js diffs their inner content at word
  // level, marking changed src filenames with inline <del>/<ins>. Detect such blocks
  // and replace them with proper diff-block presentation. Strip inline <del>/<ins> to
  // reconstruct the old and new versions of the block.
  diffedBody = diffedBody.replace(
    /<(div|pre) class="(mermaid|mscgen)[^"]*"[^>]*>[\s\S]*?<\/\1>/g,
    (match, tag) => {
      const hasDel = /<del[^>]*>/.test(match)
      const hasIns = /<ins[^>]*>/.test(match)
      if (!hasDel && !hasIns) {
        return resolveImgSrc(match, currentFileResolver)
      }
      // Reconstruct old block: keep <del> content, remove <ins> content
      const oldBlock = resolveImgSrc(
        match.replace(/<del[^>]*>([\s\S]*?)<\/del>/g, '$1').replace(/<ins[^>]*>[\s\S]*?<\/ins>/g, ''),
        baselineFileResolver
      )
      // Reconstruct new block: keep <ins> content, remove <del> content
      const newBlock = resolveImgSrc(
        match.replace(/<ins[^>]*>([\s\S]*?)<\/ins>/g, '$1').replace(/<del[^>]*>[\s\S]*?<\/del>/g, ''),
        currentFileResolver
      )
      if (hasDel && hasIns) {
        return `<div class="diff-del-block"><p class="diff-label">Replaced figure:</p>${oldBlock}</div>` +
               `<div class="diff-ins-block"><p class="diff-label">Revised figure:</p>${newBlock}</div>`
      }
      if (hasIns) return `<div class="diff-ins-block"><p class="diff-label">New figure:</p>${newBlock}</div>`
      return `<div class="diff-del-block"><p class="diff-label">Deleted figure:</p>${oldBlock}</div>`
    }
  )

  // Resolve URIs on remaining content (non-diagram images with absolute src paths).
  diffedBody = resolveImgSrc(diffedBody, currentFileResolver)

  for (const [id, entry] of placeholders) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // Placeholder wrapped in <del> → image was removed
    const delRe = new RegExp(`<del[^>]*>\\s*${escaped}\\s*</del>`, 'g')
    diffedBody = diffedBody.replace(delRe, () => {
      const html = resolveImgSrc(entry.baseline || '', baselineFileResolver)
      if (!html) return ''
      return `<div class="diff-del-block"><p class="diff-label">Deleted image:</p>${html}</div>`
    })

    // Placeholder wrapped in <ins> → image was added
    const insRe = new RegExp(`<ins[^>]*>\\s*${escaped}\\s*</ins>`, 'g')
    diffedBody = diffedBody.replace(insRe, () => {
      const html = resolveImgSrc(entry.current || '', currentFileResolver)
      if (!html) return ''
      return `<div class="diff-ins-block"><p class="diff-label">New image:</p>${html}</div>`
    })

    // Placeholder not wrapped — same content hash means same image; restore with URI
    const plainRe = new RegExp(` ${escaped} `, 'g')
    diffedBody = diffedBody.replace(plainRe, () =>
      resolveImgSrc(entry.current || entry.baseline || '', currentFileResolver)
    )
  }

  return diffedBody
}

module.exports = { diffHtml }
