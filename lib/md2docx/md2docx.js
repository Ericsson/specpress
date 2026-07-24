const { Document, Packer, Paragraph, TextRun, ImageRun, ExternalHyperlink, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, TableOfContents, SectionType } = require('docx')
const { writeFileSync, readFileSync } = require('fs')
const path = require('path')
const MarkdownIt = require('markdown-it')
const { extractText, classifyParagraph, buildJsonTableIndices, injectAllSectionNumbers, insertBreakAfterColon, parseTocRange, PARA } = require('../common/specProcessor')
const { latexToDocxMath } = require('./handlers/latexEquationHandler')
const { renderMermaidCached, renderCachedAsync } = require('../common/diagramRenderers')
const { getSvgDimensions } = require('../common/diagramCache')
const { prepareMscgenCode, loadMscgenConfig } = require('../common/mscgenConfig')
const { jsonToDocxTable, jsonFileToDocxTable } = require('./handlers/jsonTableHandler')
const { parseBullet, DEFAULT_BULLET } = require('../common/bullets')
const { buildInlineRuns } = require('./handlers/inlineRunBuilder')
const { asnToDocxParagraphs } = require('./handlers/asnHandler')
const { HEADING_LEVELS, docxStyles } = require('./styles/docxStyles')
const { detectCRCoverPage } = require('../common/crCoverPageDetector')
const { loadCRCoverPageData } = require('../common/crCoverPageLoader')
const { renderCRCoverPageDOCX } = require('./crCoverPageRenderer')
const { renderCRHistoryTableDOCX } = require('./crHistoryRenderer')

const MAX_IMAGE_WIDTH = 600
const MIN_IMAGE_DPI = 125
const DOCX_PPI = 96

/**
 * Reads image dimensions from a buffer by parsing file headers.
 * Supports PNG, JPEG, GIF, and BMP.
 *
 * @param {Buffer} buf - Image file buffer.
 * @param {string} ext - File extension (without dot).
 * @returns {{ width: number, height: number }}
 */
function getImageDimensions(buf, ext) {
  try {
    if (ext === 'png' && buf.length > 24 && buf.readUInt32BE(0) === 0x89504E47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
    if ((ext === 'jpg' || ext === 'jpeg') && buf[0] === 0xFF && buf[1] === 0xD8) {
      let i = 2
      while (i < buf.length - 1) {
        if (buf[i] !== 0xFF) break
        const marker = buf[i + 1]
        if (marker === 0xC0 || marker === 0xC2) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
        }
        const len = buf.readUInt16BE(i + 2)
        i += 2 + len
      }
    }
    if (ext === 'gif' && buf.length > 10) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    }
    if (ext === 'bmp' && buf.length > 26) {
      return { width: buf.readUInt32LE(18), height: Math.abs(buf.readInt32LE(22)) }
    }
  } catch (e) { /* fall through */ }
  return { width: MAX_IMAGE_WIDTH, height: 400 }
}

/**
 * Scales image dimensions for DOCX embedding.
 *
 * @param {number} width - Native pixel width.
 * @param {number} height - Native pixel height.
 * @returns {{ width: number, height: number }}
 */
function scaleToFit(width, height) {
  const maxByDpi = Math.round(width * DOCX_PPI / MIN_IMAGE_DPI)
  const targetWidth = Math.min(MAX_IMAGE_WIDTH, maxByDpi)
  if (width <= targetWidth) return { width, height }
  return { width: targetWidth, height: Math.round(height * (targetWidth / width)) }
}

/**
 * @typedef {object} WalkContext
 * @property {Set<number>}        skipIndices     - Token indices to skip during the walk loop.
 * @property {Map<number,string>} fileDirByIndex  - Maps token index → current source file directory.
 * @property {Set<number>}        jsonTableIndices - Indices of inline tokens that are JsonTable links.
 * @property {string}             baseDir         - Base directory for the conversion (fallback for path resolution).
 * @property {Map<number,object>} svgByIndex      - Maps fence token index → mermaid {svg,png} result.
 * @property {Map<number,object>} mscgenSvgByIndex - Maps fence token index → mscgen {svg,png} result.
 * @property {Map<number,object[]>} jsonTableByIndex - Maps inline token index → pre-built DOCX Table elements.
 */

/**
 * DOCX-specific specification processor.
 *
 * Walks markdown-it tokens and generates docx elements for each token type.
 * Uses classifyParagraph() from specProcessor for paragraph classification.
 *
 * Delegates to extracted modules:
 * - styles/docxStyles.js for style definitions
 * - handlers/inlineRunBuilder.js for inline token -> TextRun conversion
 * - handlers/asnHandler.js for ASN.1 syntax highlighting
 */
class Md2Docx {
  /**
   * @param {object} [options={}]
   * @param {string|null} [options.mermaidConfig=null] - Mermaid configuration JSON string.
   * @param {string} [options.specRootPath=''] - Absolute path to the specification root for section numbering.
   * @param {Function|null} [options.mermaidRenderer=null] - Optional async function `(codes) => {svg,png}[]`.
   *   When provided, used instead of the CLI headless-browser renderer (e.g. VS Code webview).
   * @param {Function|null} [options.fileResolver=null] - Optional function `(absolutePath) => Buffer|string`
   *   for reading external files (images, JsonTable JSON). When null, reads from the local filesystem.
   * @param {string|null} [options.mscgenConfig=null] - MSC-Gen configuration JSON string.
   * @param {boolean} [options.updateFields=true] - Whether to set updateFields on the DOCX.
   */
  constructor(options = {}) {
    this.mermaidConfig = options.mermaidConfig || null
    this.specRootPath = options.specRootPath || ''
    this.mermaidRenderer = options.mermaidRenderer || null
    this.fileResolver = options.fileResolver || null
    this.mscgenConfig = options.mscgenConfig || null
    this.updateFields = options.updateFields !== false
    this.md = new MarkdownIt({ html: true })
    /** @type {Object[]} Accumulated docx elements for the current conversion */
    this.docElements = []
    /** @type {number} Number of images embedded during conversion */
    this.imageCount = 0
  }

  /**
   * Reads a file using the fileResolver if available, otherwise from the filesystem.
   * @param {string} filePath - Absolute path to the file.
   * @param {string} [encoding] - Encoding (e.g. 'utf8'). Omit for Buffer.
   * @returns {Buffer|string}
   */
  readFile(filePath, encoding) {
    if (this.fileResolver) {
      const content = typeof this.fileResolver.readFile === 'function'
        ? this.fileResolver.readFile(filePath)
        : this.fileResolver(filePath)
      if (encoding && Buffer.isBuffer(content)) return content.toString(encoding)
      return content
    }
    return encoding ? readFileSync(filePath, encoding) : readFileSync(filePath)
  }

  // -- Token --

  /**
   * Walks the token array, classifies each element, and dispatches to
   * the appropriate export method.
   *
   * @param {Object[]} tokens - markdown-it token array.
   * @param {string} baseDir - Base directory for resolving relative paths.
   * @returns {Promise<void>}
   */
  async walkTokens(tokens, baseDir) {
    const skipIndices = new Set()
    let currentFileDir = baseDir

    const fileDirByIndex = new Map()
    const jsonTableIndices = buildJsonTableIndices(tokens)
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'html_block') {
        const m = tokens[i].content.match(/^<!--\s*FILE:\s*(.+?)\s*-->/)
        if (m) currentFileDir = path.dirname(m[1])
      }
      fileDirByIndex.set(i, currentFileDir)
    }

    const ctx = { skipIndices, fileDirByIndex, jsonTableIndices, baseDir }

    await this.beforeWalk(tokens, ctx)

    for (let i = 0; i < tokens.length; i++) {
      if (skipIndices.has(i)) continue
      const token = tokens[i]
      if (token.type === 'html_block' && /^<!--\s*FILE:/.test(token.content)) continue
      if (token.type === 'html_block' && /^<!--\s*OMITTED\s*-->/.test(token.content)) {
        this.docElements.push(new Paragraph({}))
        this.docElements.push(new Paragraph({
          children: [new TextRun({ text: '=== unmodified sections omitted ===', highlight: 'yellow' })],
          alignment: AlignmentType.CENTER
        }))
        this.docElements.push(new Paragraph({}))
        continue
      }
      if (await this.handlePreScanned(token, tokens, i, ctx)) continue

      switch (token.type) {
        case 'heading_open': {
          const inline = tokens[i + 1]
          const level = parseInt(token.tag.substring(1))
          await this.exportHeading(level, inline, tokens, i, ctx)
          break
        }
        case 'paragraph_open': {
          if (skipIndices.has(i)) break
          const content = tokens[i + 1]
          if (!content || content.type !== 'inline') break
          const kind = classifyParagraph(tokens, i, jsonTableIndices)
          switch (kind) {
            case PARA.DISPLAY_MATH: {
              const latex = content.content.replace(/^\$\$|\$\$$/g, '').trim()
              await this.exportDisplayMath(latex, tokens, i, ctx)
              break
            }
            case PARA.EDITORS_NOTE: await this.exportEditorsNote(content, tokens, i, ctx); break
            case PARA.NOTE: await this.exportNote(content, tokens, i, ctx); break
            case PARA.TOC: await this.exportToc(content, tokens, i, ctx); break
            case PARA.CR_HISTORY: await this.exportCRHistory(content, tokens, i, ctx); break
            case PARA.EXAMPLE: await this.exportExample(content, tokens, i, ctx); break
            case PARA.TABLE_CAPTION: await this.exportTableCaption(content, tokens, i, ctx); break
            case PARA.FIGURE_CAPTION: await this.exportFigureCaption(content, tokens, i, ctx); break
            case PARA.IMAGE: await this.exportImage(content, tokens, i, ctx); break
            default: await this.exportParagraph(content, tokens, i, ctx); break
          }
          break
        }
        case 'fence':
          if (token.info === 'mermaid') { /* handled via handlePreScanned */ }
          else if (token.info === 'mscgen') { /* handled via handlePreScanned */ }
          else if (token.info === 'asn') await this.exportAsn(token.content, tokens, i, ctx)
          else if (token.info === 'jsonTable') await this.exportJsonTableFence(token.content, tokens, i, ctx)
          else if (token.info === 'math') await this.exportDisplayMath(token.content.trim(), tokens, i, ctx)
          else await this.exportCodeBlock(token, tokens, i, ctx)
          break
        case 'table_open':
          await this.exportTable(tokens, i, ctx)
          break
        case 'list_item_open':
          await this.exportBulletItem(token, tokens, i, ctx)
          break
        default:
          break
      }
    }
  }

  // -- Pre/post --

  async beforeWalk(tokens, ctx) {
    const mermaidEntries = []
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'fence' && tokens[i].info === 'mermaid') {
        mermaidEntries.push({ idx: i, code: tokens[i].content.replace(/```mermaid\n?|\n?```/g, '').trim() })
      }
    }
    const mermaidConfig = this.mermaidConfig || undefined
    const mermaidSvgs = mermaidEntries.length > 0
      ? (this.mermaidRenderer
          ? await this.mermaidRenderer(mermaidEntries.map(e => e.code))
          : await renderMermaidCached(mermaidEntries.map(e => e.code), mermaidConfig, this.specRootPath || ''))
      : []
    ctx.svgByIndex = new Map(mermaidEntries.map((e, j) => [e.idx, mermaidSvgs[j]]))

    // Pre-scan mscgen fences
    const mscgenEntries = []
    const mscgenConfigJson = this.mscgenConfig || loadMscgenConfig(null)
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'fence' && tokens[i].info === 'mscgen') {
        const rawCode = tokens[i].content.replace(/```mscgen\n?|\n?```/g, '').trim()
        const { code, type, cacheConfig } = prepareMscgenCode(rawCode, mscgenConfigJson)
        mscgenEntries.push({ idx: i, code, type, cacheConfig })
      }
    }
    const mscgenSvgs = mscgenEntries.length > 0
      ? await renderCachedAsync({
          codes: mscgenEntries.map(e => e.code),
          configs: mscgenEntries.map(e => e.cacheConfig),
          specRoot: this.specRootPath || '',
          prefix: '',
          renderFn: (codes, originalIndices) => {
            const { renderMscgenBatch } = require('../common/mscgenRenderer')
            return renderMscgenBatch(codes.map((code, j) => ({ code, type: mscgenEntries[originalIndices[j]].type })))
          }
        })
      : []
    ctx.mscgenSvgByIndex = new Map(mscgenEntries.map((e, j) => [e.idx, mscgenSvgs[j]]))

    ctx.jsonTableByIndex = new Map()
    for (const i of ctx.jsonTableIndices) {
      const children = tokens[i].children
      const href = children[0].attrGet('href')
      try {
        const resolveDir = ctx.fileDirByIndex.get(i) || ctx.baseDir
        const filePath = path.resolve(resolveDir, href)
        const jsonContent = this.readFile(filePath, 'utf8')
        const data = JSON.parse(jsonContent)
        const items = Array.isArray(data) ? data : [data]
        const tables = []
        for (const item of items) {
          const t = await jsonToDocxTable(item)
          if (t) tables.push(t)
        }
        ctx.jsonTableByIndex.set(i, tables)
        ctx.skipIndices.add(i - 1)
        ctx.skipIndices.add(i + 1)
      } catch (e) {
        ctx.jsonTableByIndex.set(i, [new Paragraph({ text: `[JsonTable error: ${e.message}]` })])
        ctx.skipIndices.add(i - 1)
        ctx.skipIndices.add(i + 1)
      }
    }
  }

  async handlePreScanned(token, tokens, idx, ctx) {
    if (ctx.svgByIndex.has(idx)) {
      this.handleMermaidSvg(ctx.svgByIndex.get(idx), this.docElements, tokens, idx, ctx)
      return true
    }
    if (ctx.mscgenSvgByIndex.has(idx)) {
      this.handleMscgenSvg(ctx.mscgenSvgByIndex.get(idx), this.docElements, tokens, idx, ctx)
      return true
    }
    if (ctx.jsonTableByIndex.has(idx)) {
      ctx.jsonTableByIndex.get(idx).forEach(t => this.docElements.push(t))
      return true
    }
    return false
  }

  // -- Export --

  async exportHeading(level, inlineToken, tokens, idx, ctx) {
    const text = extractText(inlineToken)
    const isAnnex = level === 1 && /^Annex\b/i.test(text)
    if (isAnnex) {
      insertBreakAfterColon(inlineToken)
      const runs = await buildInlineRuns(inlineToken.children)
      this.docElements.push(new Paragraph({ children: runs, style: 'Heading8' }))
    } else {
      const hasNumber = /^\d/.test(text.trim())
      const runs = await buildInlineRuns(inlineToken.children, hasNumber ? { replaceFirstSpace: true } : {})
      this.docElements.push(new Paragraph({
        children: runs,
        heading: HEADING_LEVELS[level - 1] || HEADING_LEVELS[5]
      }))
    }
  }

  async exportParagraph(inlineToken, tokens, idx, ctx) {
    if (idx > 0 && tokens[idx - 1].type === 'list_item_open') return
    const runs = await buildInlineRuns(inlineToken.children)
    this.docElements.push(new Paragraph({ children: runs }))
  }

  async exportNote(inlineToken, tokens, idx, ctx) {
    const runs = await buildInlineRuns(inlineToken.children, { replaceFirstColonSpace: true })
    this.docElements.push(new Paragraph({ children: runs, style: 'NO' }))
  }

  async exportEditorsNote(inlineToken, tokens, idx, ctx) {
    const runs = await buildInlineRuns(inlineToken.children, { replaceFirstColonSpace: true, color: 'FF0000' })
    this.docElements.push(new Paragraph({ children: runs, style: 'EN' }))
  }

  async exportExample(inlineToken, tokens, idx, ctx) {
    const runs = await buildInlineRuns(inlineToken.children, { replaceFirstColonSpace: true })
    this.docElements.push(new Paragraph({ children: runs, style: 'EX' }))
  }

  async exportToc(inlineToken, tokens, idx, ctx) {
    const range = parseTocRange(extractText(inlineToken))
    this.docElements.push(new TableOfContents('Table of Contents', {
      hyperlink: true,
      headingStyleRange: range || '1-9'
    }))
  }

  async exportCRHistory(inlineToken, tokens, idx, ctx) {
    if (this.specRootPath) {
      const elements = renderCRHistoryTableDOCX(this.specRootPath)
      this.docElements.push(...elements)
    }
  }

  async exportTableCaption(inlineToken, tokens, idx, ctx) {
    const runs = await buildInlineRuns(inlineToken.children)
    this.docElements.push(new Paragraph({ children: runs, style: 'TH' }))
  }

  async exportFigureCaption(inlineToken, tokens, idx, ctx) {
    const runs = await buildInlineRuns(inlineToken.children)
    this.docElements.push(new Paragraph({ children: runs, style: 'TF' }))
    ctx.skipIndices.add(idx)
    ctx.skipIndices.add(idx + 1)
    ctx.skipIndices.add(idx + 2)
  }

  async exportDisplayMath(latex, tokens, idx, ctx) {
    try {
      const mathComponent = await latexToDocxMath(latex, true)
      this.docElements.push(new Paragraph({ children: [mathComponent], style: 'EQ', alignment: AlignmentType.LEFT }))
    } catch (e) {
      this.docElements.push(new Paragraph({ text: latex, style: 'EQ', alignment: AlignmentType.LEFT }))
    }
  }

  async exportImage(inlineToken, tokens, idx, ctx) {
    for (const child of inlineToken.children) {
      if (child.type === 'image') {
        const src = child.attrGet('src')
        const alt = child.content
        try {
          const resolveDir = ctx.fileDirByIndex.get(idx) || ''
          const imagePath = path.isAbsolute(src) ? src : path.resolve(resolveDir, src)
          const raw = this.readFile(imagePath)
          const imageBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
          const ext = path.extname(src).toLowerCase().replace('.', '')
          const typeMap = { png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', bmp: 'bmp', svg: 'svg' }
          const imgType = typeMap[ext] || 'png'
          const dims = getImageDimensions(imageBuffer, ext)
          const scaled = scaleToFit(dims.width, dims.height)
          this.docElements.push(new Paragraph({
            children: [new ImageRun({ data: imageBuffer, type: imgType, transformation: scaled })],
            style: 'TH'
          }))
          this.imageCount++
        } catch (e) {
          this.docElements.push(new Paragraph({ text: `[Image: ${alt}]` }))
        }
      }
    }
    let nextIdx = idx + 2
    while (nextIdx < tokens.length && tokens[nextIdx].type === 'paragraph_close') nextIdx++
    if (nextIdx + 1 < tokens.length && tokens[nextIdx].type === 'paragraph_open') {
      const nextInline = tokens[nextIdx + 1]
      if (nextInline && nextInline.type === 'inline' && /^(\*\*)?Figure/i.test(extractText(nextInline))) {
        const captionRuns = await buildInlineRuns(nextInline.children)
        this.docElements.push(new Paragraph({ children: captionRuns, style: 'TF' }))
        ctx.skipIndices.add(nextIdx)
        ctx.skipIndices.add(nextIdx + 1)
        ctx.skipIndices.add(nextIdx + 2)
      }
    }
  }

  async exportAsn(content, tokens, idx, ctx) {
    const paragraphs = await asnToDocxParagraphs(content)
    this.docElements.push(...paragraphs)
  }

  async exportJsonTableFence(jsonContent, tokens, idx, ctx) {
    try {
      const data = JSON.parse(jsonContent)
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        const table = await jsonToDocxTable(item)
        if (table) this.docElements.push(table)
      }
    } catch (e) {
      this.docElements.push(new Paragraph({ text: jsonContent }))
    }
  }

  async exportTable(tokens, idx, ctx) {
    const rows = []
    const alignments = []
    let i = idx + 1
    let isHeader = true

    let alignIdx = idx + 1
    while (alignIdx < tokens.length && tokens[alignIdx].type !== 'thead_close') {
      if (tokens[alignIdx].type === 'th_open') {
        alignments.push(tokens[alignIdx].attrGet('style') || 'text-align:left')
      }
      alignIdx++
    }

    while (i < tokens.length && tokens[i].type !== 'table_close') {
      if (tokens[i].type === 'thead_close') isHeader = false
      if (tokens[i].type === 'tr_open') {
        const cells = []
        let j = i + 1
        let colIdx = 0
        while (j < tokens.length && tokens[j].type !== 'tr_close') {
          if (tokens[j].type === 'th_open' || tokens[j].type === 'td_open') {
            const inline = tokens[j + 1]
            const text = inline ? extractText(inline) : ''
            const isNote = !isHeader && /^(\*\*)?NOTE(\*\*)?( \d+)?:/.test(text)
            const runs = inline && inline.children
              ? await buildInlineRuns(inline.children, isNote ? { replaceFirstColonSpace: true } : {})
              : [new TextRun('')]
            let style = 'TAL'
            if (isNote) {
              style = 'TAN'
            } else if (isHeader) {
              style = 'TAH'
            } else {
              const align = alignments[colIdx] || 'text-align:left'
              if (align.includes('center')) style = 'TAC'
              else if (align.includes('right')) style = 'TAR'
            }
            cells.push(new TableCell({
              children: [new Paragraph({ children: runs, style })],
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 }
              }
            }))
            colIdx++
          }
          j++
        }
        if (cells.length > 0) rows.push(new TableRow({ children: cells }))
        i = j
      }
      i++
    }

    if (rows.length > 0) {
      this.docElements.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }))
    }
  }

  async exportBulletItem(token, tokens, idx, ctx) {
    const content = tokens[idx + 1]
    if (content && content.type === 'paragraph_open') {
      const inline = tokens[idx + 2]
      if (inline && inline.type === 'inline') {
        const level = token.level || 0
        const bulletLevel = Math.floor(level / 2) + 1
        const style = (bulletLevel >= 1 && bulletLevel <= 9) ? `B${bulletLevel}` : undefined

        const firstChild = inline.children && inline.children[0]
        if (firstChild && firstChild.type === 'text') {
          const { bullet, rest } = parseBullet(firstChild.content)
          firstChild.content = bullet + '\t' + rest
        } else {
          inline.children.unshift({ type: 'text', content: DEFAULT_BULLET + '\t' })
        }

        const runs = await buildInlineRuns(inline.children)
        this.docElements.push(new Paragraph({ children: runs, ...(style && { style }) }))
      }
    }
  }

  async exportCodeBlock(token, tokens, idx, ctx) {
    const lines = token.content.split('\n').filter((line, i, arr) => i < arr.length - 1 || line.trim() !== '')
    for (const line of lines) {
      this.docElements.push(new Paragraph({ text: line, style: 'PL' }))
    }
  }

  // -- Mermaid --

  /**
   * Shared helper: embeds a diagram SVG in the DOCX with PNG fallback and
   * detects figure captions in the next paragraph.
   *
   * @param {object} result - {svg, png} from the rendering pipeline.
   * @param {object[]} elements - Array to push DOCX elements into.
   * @param {object[]} tokens - Full token array.
   * @param {number} idx - Index of the fence token.
   * @param {object} ctx - Walk context.
   * @param {object} opts - Options.
   * @param {string} opts.errorText - Placeholder text when SVG is null.
   * @param {function} [opts.postProcessSvg] - Optional function to post-process SVG string.
   */
  handleDiagramSvg(result, elements, tokens, idx, ctx, opts) {
    const svg = result && result.svg !== undefined ? result.svg : result
    const pngFromRender = result && result.png
    if (!svg) {
      // Render failed: show the raw source code as a code block (PL style)
      const rawCode = tokens[idx].content.trim()
      const lines = rawCode.split('\n')
      for (const line of lines) {
        elements.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Courier New', size: 18 })], style: 'PL' }))
      }
      return
    }

    const processedSvg = opts.postProcessSvg ? opts.postProcessSvg(svg) : svg
    const { width, height } = getSvgDimensions(processedSvg)
    const svgBuffer = Buffer.from(processedSvg, 'utf8')
    const smallFallbackPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg==', 'base64')
    const fallbackPng = pngFromRender || smallFallbackPng

    elements.push(new Paragraph({
      children: [new ImageRun({
        data: svgBuffer,
        type: 'svg',
        transformation: { width, height },
        fallback: { data: fallbackPng, type: 'png' }
      })],
      style: 'TH'
    }))
    this.imageCount++

    // Figure caption detection: if the next paragraph starts immediately after
    // the fence, treat it as a figure caption (TF style).
    if (idx + 1 < tokens.length && tokens[idx + 1].type === 'paragraph_open') {
      const nextContent = tokens[idx + 2]
      if (nextContent && nextContent.type === 'inline') {
        elements.push(new Paragraph({ text: extractText(nextContent), style: 'TF' }))
        ctx.skipIndices.add(idx + 1)
        ctx.skipIndices.add(idx + 2)
        ctx.skipIndices.add(idx + 3)
      }
    }
  }

  handleMermaidSvg(result, elements, tokens, idx, ctx) {
    this.handleDiagramSvg(result, elements, tokens, idx, ctx, {
      errorText: '[Mermaid diagram conversion failed]',
      postProcessSvg: (svg) => {
        let processedSvg = svg
        // Apply CSS !important rules to inline styles on <text> elements.
        // Word's SVG renderer ignores <style> blocks and only reads inline styles.
        const styleMatch = svg.match(/<style>([\s\S]*?)<\/style>/)
        if (styleMatch) {
          const css = styleMatch[1]
          const re = /\.(\w[\w-]*)\s*\{([^}]*!important[^}]*)\}/g
          let m
          while ((m = re.exec(css)) !== null) {
            const cls = m[1]
            const props = m[2].replace(/!important/g, '').trim()
            const textRe = new RegExp(`<text([^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*)>`, 'g')
            processedSvg = processedSvg.replace(textRe, (tag) => {
              if (tag.includes('style="')) {
                return tag.replace(/style="([^"]*)"/, (_, existing) => {
                  const merged = existing.replace(/font-size:[^;]+;?/, '') + ' ' + props
                  return `style="${merged.trim()}"`
                })
              }
              return tag.replace('>', ` style="${props}">`)
            })
          }
        }
        // Fix vertical text alignment for Word's SVG renderer.
        processedSvg = processedSvg.replace(/<text([^>]*dominant-baseline="central"[^>]*)>/g, (tag) => {
          if (tag.includes('dy="')) return tag
          return tag.replace(/\by="([\d.]+)"/, (_, y) => `y="${(parseFloat(y) + 5).toFixed(1)}"`)
        })
        processedSvg = processedSvg.replace(/<text([^>]*)\bdy="([\d.]+)em"([^>]*)>/g, (tag, before, dyEm, after) => {
          const fontSize = (tag.match(/font-size:\s*([\d.]+)px/) || [])[1]
          const fs = fontSize ? parseFloat(fontSize) : 16
          const emOffset = parseFloat(dyEm) * fs
          const baselineOffset = tag.includes('dominant-baseline="middle"') ? fs * 0.35 : 0
          return tag.replace(/\by="([\d.]+)"/, (_, y) => `y="${(parseFloat(y) + emOffset + baselineOffset).toFixed(1)}"`).replace(/\s*dy="[^"]*"/, '')
        })
        return processedSvg
      }
    })
  }

  handleMscgenSvg(result, elements, tokens, idx, ctx) {
    this.handleDiagramSvg(result, elements, tokens, idx, ctx, {
      errorText: '[MSC-Gen diagram conversion failed]'
    })
  }

  // -- Main --

  /**
   * Converts a markdown string to a DOCX file.
   *
   * @param {string} markdown - Markdown source string.
   * @param {string} outputPath - Absolute path for the output .docx file.
   * @param {string} baseDir - Base directory for resolving relative image/JSON paths.
   * @param {object|null} [frontPageData=null] - Front page JSON data.
   * @param {object} [options={}]
   * @param {object|null} [options.crCoverPageData=null] - CR cover page data (takes precedence over frontPageData).
   */
  async convert(markdown, outputPath, baseDir, frontPageData, options = {}) {
    const tokens = this.md.parse(markdown, { _baseDir: baseDir })
    this.docElements = []
    this.imageCount = 0

    injectAllSectionNumbers(tokens, this.specRootPath)

    await this.walkTokens(tokens, baseDir)



    const sections = []
    if (frontPageData || options.crCoverPageData) {
      // CR cover page takes precedence if provided
      if (options.crCoverPageData) {
        const crElements = renderCRCoverPageDOCX(options.crCoverPageData)
        sections.push({
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              size: { width: 11907, height: 16840 },
              margin: { top: 1418, right: 1134, bottom: 1134, left: 1134, header: 850, footer: 510 },
            },
          },
          children: crElements,
        })
        sections.push({
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              size: { width: 11907, height: 16840 },
              margin: { top: 1418, right: 1134, bottom: 1134, left: 1134, header: 850, footer: 510 },
            },
          },
          children: this.docElements,
        })
      } else {
        // Standard front page — render on the fly from data
        const { buildFrontPageDocx } = require('./frontPage')
        const frontPage = buildFrontPageDocx(frontPageData)
        sections.push(frontPage.frontSection)
        sections.push(frontPage.innerSection)
        sections.push({
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              size: { width: 11907, height: 16840 },
              margin: { top: 1418, right: 1134, bottom: 1134, left: 1134, header: 850, footer: 510 },
            },
          },
          ...(frontPage.bodyHeaderFooter || {}),
          children: this.docElements,
        })
      }
    } else {
      sections.push({ children: this.docElements })
    }

    const doc = new Document({
      ...(this.updateFields ? { features: { updateFields: true } } : {}),
      sections,
      styles: docxStyles()
    })

    const buffer = await Packer.toBuffer(doc)
    writeFileSync(outputPath, buffer)
  }
}

module.exports = { Md2Docx, buildInlineRuns }
