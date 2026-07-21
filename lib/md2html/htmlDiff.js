/**
 * HTML diff engine — produces word-level tracked changes between two versions
 * of a markdown specification.
 */
const path = require('path')
const crypto = require('crypto')
const HtmlDiff = require('htmldiff-js')

/**
 * Produces an HTML diff (tracked changes) between baseline and current content.
 *
 * @param {object} opts
 * @param {string} opts.baselineContent - Baseline markdown content (old version).
 * @param {string} opts.currentContent - Current markdown content (new version).
 * @param {object} opts.handler - Md2Html instance for rendering.
 * @param {object|null} [opts.baselineFileResolver=null] - FileResolver for the baseline version.
 * @param {object|null} [opts.currentFileResolver=null] - FileResolver for the current version.
 * @param {object|null} [opts.frontPageData=null] - Front page JSON data.
 * @param {object|null} [opts.crCoverPageData=null] - CR cover page JSON data.
 * @returns {string} HTML body content with ins/del tracked changes.
 */
function diffHtml(opts) {
  const {
    baselineContent = '',
    currentContent = '',
    handler,
    baselineFileResolver = null,
    currentFileResolver: currentFileResolverOpt = null,
    frontPageData = null,
    crCoverPageData = null,
  } = opts

  const currentFileResolver = currentFileResolverOpt || handler.fileResolver || null

  // Render both versions with resolveUris=true using a pass-through resolver
  // (returns absolute path as-is). This gives absolute src paths in rendered HTML
  // so we can read file content for stable content-hash placeholders.
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

  // Rewrite absolute src paths using the original resolver's resolveImageUri.
  // For preview: resolveImageUri converts to webview URIs.
  // For export: resolveImageUri is the pass-through (returns absolute path), which
  // the export pipeline then copies to media/ and rewrites to relative paths.
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
      return hashContent(absPath)
    }
  }

  // Extract content hash from a cached SVG filename (e.g. "cached_abc123def456.svg").
  const svgHashFromSrc = (src) => {
    const m = (src || '').match(/[/\\]?(?:cached[_/])?([0-9a-f]{16,})\.[^.]+$/)
    return m ? m[1] : null
  }

  // Replace all images and diagram blocks with stable content-hash placeholders.
  // Store the raw HTML with absolute paths — the original resolver's resolveImageUri
  // is applied at restore time so preview (webview URIs) and export (absolute paths)
  // both work correctly.
  const placeholders = new Map()

  function replaceBlocks(html, version, hashResolver) {
    // Replace mermaid/mscgen figure blocks first
    html = html.replace(/(<(?:div|pre) class="(?:mermaid|mscgen)[^"]*"[^>]*>)([\s\S]*?)(<\/(?:div|pre)>)/g,
      (match, open, inner) => {
        const srcMatch = inner.match(/src="([^"]+)"/)
        const src = srcMatch ? srcMatch[1] : ''
        const svgHash = svgHashFromSrc(src) || hashContent(inner)
        const id = `DIAG_${svgHash}`
        if (!placeholders.has(id)) placeholders.set(id, {})
        placeholders.get(id)[version] = match  // raw HTML with absolute paths
        return ` ${id} `
      }
    )
    // Replace remaining standalone <img> tags
    html = html.replace(/<img[^>]*>/g, (imgTag) => {
      const src = (imgTag.match(/src="([^"]+)"/) || [])[1] || ''
      const contentHash = src ? hashFile(src, hashResolver) : hashContent(imgTag)
      const id = `IMG_${contentHash}`
      if (!placeholders.has(id)) placeholders.set(id, {})
      placeholders.get(id)[version] = imgTag  // raw HTML with absolute paths
      return ` ${id} `
    })
    return html
  }

  const processedBaseline = replaceBlocks(baselineBody, 'baseline', baselineFileResolver || currentFileResolver)
  const processedCurrent = replaceBlocks(renderedCurrentBody, 'current', currentFileResolver)

  // Run word-level HTML diff
  let diffedBody = HtmlDiff.default.execute(processedBaseline, processedCurrent)

  // Restore placeholders. htmldiff-js may batch multiple adjacent placeholder tokens
  // into a single <ins>/<del> block, so we match sequences of tokens.
  const allIds = [...placeholders.keys()]
  if (allIds.length === 0) return diffedBody

  const escapedIds = allIds.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const tokenSeq = `(?:\\s*(?:${escapedIds.join('|')})\\s*)+`

  const extractIds = (tokenStr) => tokenStr.match(new RegExp(`(?:${escapedIds.join('|')})`, 'g')) || []
  const isDiagramTokens = (tokenStr) => extractIds(tokenStr).some(id => id.startsWith('DIAG_'))

  const restoreTokens = (tokenStr, version, resolver) =>
    extractIds(tokenStr).map(id => {
      const entry = placeholders.get(id)
      const raw = entry && entry[version]
      return raw ? resolveImgSrc(raw, resolver) : ''
    }).join('')

  const wrapDel = (html, isDiag) =>
    `<div class="diff-del-block"><p class="diff-label">${isDiag ? 'Deleted figure:' : 'Deleted image:'}</p>${html}</div>`
  const wrapIns = (html, isDiag) =>
    `<div class="diff-ins-block"><p class="diff-label">${isDiag ? 'New figure:' : 'New image:'}</p>${html}</div>`
  const wrapReplDel = (html, isDiag) =>
    `<div class="diff-del-block"><p class="diff-label">${isDiag ? 'Replaced figure:' : 'Deleted image:'}</p>${html}</div>`
  const wrapReplIns = (html, isDiag) =>
    `<div class="diff-ins-block"><p class="diff-label">${isDiag ? 'Revised figure:' : 'New image:'}</p>${html}</div>`

  // 1. Replaced: <del>tokens</del><ins>tokens</ins>
  diffedBody = diffedBody.replace(
    new RegExp(`<del[^>]*>(${tokenSeq})<\\/del>\\s*<ins[^>]*>(${tokenSeq})<\\/ins>`, 'g'),
    (_, delTokens, insTokens) => {
      const isDiag = isDiagramTokens(delTokens) || isDiagramTokens(insTokens)
      return wrapReplDel(restoreTokens(delTokens, 'baseline', baselineFileResolver || currentFileResolver), isDiag) +
             wrapReplIns(restoreTokens(insTokens, 'current', currentFileResolver), isDiag)
    }
  )
  // Also ins+del order
  diffedBody = diffedBody.replace(
    new RegExp(`<ins[^>]*>(${tokenSeq})<\\/ins>\\s*<del[^>]*>(${tokenSeq})<\\/del>`, 'g'),
    (_, insTokens, delTokens) => {
      const isDiag = isDiagramTokens(delTokens) || isDiagramTokens(insTokens)
      return wrapReplDel(restoreTokens(delTokens, 'baseline', baselineFileResolver || currentFileResolver), isDiag) +
             wrapReplIns(restoreTokens(insTokens, 'current', currentFileResolver), isDiag)
    }
  )

  // 2. Deleted only
  diffedBody = diffedBody.replace(
    new RegExp(`<del[^>]*>(${tokenSeq})<\\/del>`, 'g'),
    (_, tokens) => {
      const isDiag = isDiagramTokens(tokens)
      const html = restoreTokens(tokens, 'baseline', baselineFileResolver || currentFileResolver)
      return html ? wrapDel(html, isDiag) : ''
    }
  )

  // 3. Added only
  diffedBody = diffedBody.replace(
    new RegExp(`<ins[^>]*>(${tokenSeq})<\\/ins>`, 'g'),
    (_, tokens) => {
      const isDiag = isDiagramTokens(tokens)
      const html = restoreTokens(tokens, 'current', currentFileResolver)
      return html ? wrapIns(html, isDiag) : ''
    }
  )

  // 4. Unchanged: plain placeholder — restore with current resolver
  for (const id of allIds) {
    const e = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    diffedBody = diffedBody.replace(new RegExp(` ${e} `, 'g'), () => {
      const entry = placeholders.get(id)
      const raw = entry && (entry.current || entry.baseline)
      return raw ? resolveImgSrc(raw, currentFileResolver) : ''
    })
  }

  return diffedBody
}

module.exports = { diffHtml }
