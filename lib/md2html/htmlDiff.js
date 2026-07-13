/**
 * HTML diff engine — produces word-level tracked changes between two versions
 * of a markdown specification.
 *
 * Renders both baseline and current markdown to HTML, replaces images and
 * diagrams with stable placeholders, runs htmldiff-js for word-level diffing,
 * and restores placeholders with appropriate diff visualization.
 */
const crypto = require('crypto')
const HtmlDiff = require('htmldiff-js')

/**
 * Produces an HTML diff (tracked changes) between baseline and current content.
 *
 * @param {object} opts - Options.
 * @param {string} opts.baselineContent - Baseline markdown content (old version).
 * @param {string} opts.currentContent - Current markdown content (new version).
 * @param {object} opts.handler - Md2Html instance for rendering.
 * @param {string} [opts.specRoot=''] - Specification root for section numbering.
 * @param {object|null} [opts.frontPageData=null] - Front page JSON data.
 * @param {object|null} [opts.crCoverPageData=null] - CR cover page JSON data.
 * @param {string|null} [opts.baseDir=null] - Base directory for resolving paths.
 * @param {string|null} [opts.currentBody=null] - Pre-rendered current HTML body (skips re-rendering if provided).
 * @returns {string} HTML body content with <ins>/<del> tracked changes.
 */
function diffHtml(opts) {
  const {
    baselineContent = '',
    currentContent = '',
    handler,
    specRoot = '',
    frontPageData = null,
    crCoverPageData = null,
    baseDir = null,
    currentBody = null
  } = opts

  // Render baseline to HTML body
  const baselineBody = handler.renderBody(
    baselineContent, false, baseDir, null, specRoot, frontPageData, crCoverPageData
  )

  // Render current — use pre-rendered body if provided, otherwise render from markdown
  let renderedCurrentBody = currentBody
  if (!renderedCurrentBody) {
    renderedCurrentBody = handler.renderBody(
      currentContent, false, baseDir, null, specRoot, frontPageData, crCoverPageData
    )
  }

  // Replace images and diagrams with stable placeholders before diffing.
  // This prevents htmldiff-js from producing garbled diffs of SVG/img markup.
  const placeholders = new Map()
  const hashContent = (data) => crypto.createHash('md5').update(data).digest('hex').substring(0, 12)

  function replaceBlocks(html, version) {
    // Replace diagram figures (mermaid/mscgen rendered SVGs referenced as <img>)
    html = html.replace(/<div class="(mermaid|mscgen)-figure"[^>]*>[\s\S]*?<\/div>/g, (match) => {
      const hash = hashContent(match)
      const id = `DIAGRAM_${hash}`
      if (!placeholders.has(id)) placeholders.set(id, {})
      placeholders.get(id)[version] = match
      return ` ${id} `
    })

    // Replace mermaid/mscgen raw code fallbacks
    html = html.replace(/<pre class="(mermaid|mscgen)"[^>]*>[\s\S]*?<\/pre>/g, (match) => {
      const hash = hashContent(match)
      const id = `DIAGRAM_${hash}`
      if (!placeholders.has(id)) placeholders.set(id, {})
      placeholders.get(id)[version] = match
      return ` ${id} `
    })

    // Replace regular images
    html = html.replace(/<img[^>]*>/g, (match) => {
      const src = (match.match(/src="([^"]+)"/) || [])[1] || ''
      const filename = src.split('/').pop().split('?')[0]
      const id = `IMG_${filename.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
      if (!placeholders.has(id)) placeholders.set(id, { filename })
      placeholders.get(id)[version] = match
      return ` ${id} `
    })

    return html
  }

  const processedBaseline = replaceBlocks(baselineBody, 'baseline')
  const processedCurrent = replaceBlocks(renderedCurrentBody, 'current')

  // Run word-level HTML diff
  let diffedBody = HtmlDiff.default.execute(processedBaseline, processedCurrent)

  // Restore placeholders with appropriate diff visualization
  for (const [id, entry] of placeholders) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // Placeholder wrapped in <del> → content was removed
    const delRe = new RegExp(`<del[^>]*>[^<]*?${escaped}[^<]*?</del>`, 'g')
    diffedBody = diffedBody.replace(delRe, () => {
      const html = entry.baseline || ''
      if (!html) return ''
      const label = id.startsWith('DIAGRAM_') ? 'Deleted figure:' : 'Deleted image:'
      return `<div class="diff-del-block"><p class="diff-label">${label}</p>${html}</div>`
    })

    // Placeholder wrapped in <ins> → content was added
    const insRe = new RegExp(`<ins[^>]*>[^<]*?${escaped}[^<]*?</ins>`, 'g')
    diffedBody = diffedBody.replace(insRe, () => {
      const html = entry.current || ''
      if (!html) return ''
      const label = id.startsWith('DIAGRAM_') ? 'New figure:' : 'New image:'
      return `<div class="diff-ins-block"><p class="diff-label">${label}</p>${html}</div>`
    })

    // Placeholder not wrapped (unchanged) — restore original, but check for modifications
    const plainRe = new RegExp(` ${escaped} `, 'g')
    diffedBody = diffedBody.replace(plainRe, () => {
      // Check if the content changed between versions
      if (entry.baseline && entry.current && entry.baseline !== entry.current) {
        const delLabel = id.startsWith('DIAGRAM_') ? 'Old figure:' : 'Old image:'
        const insLabel = id.startsWith('DIAGRAM_') ? 'New figure:' : 'New image:'
        return `<div class="diff-del-block"><p class="diff-label">${delLabel}</p>${entry.baseline}</div>` +
               `<div class="diff-ins-block"><p class="diff-label">${insLabel}</p>${entry.current}</div>`
      }
      return entry.current || entry.baseline || ''
    })
  }

  return diffedBody
}

module.exports = { diffHtml }
