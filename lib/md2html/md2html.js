const fs = require('fs')
const path = require('path')
const MarkdownIt = require('markdown-it')
const taskLists = require('markdown-it-task-lists')
const emoji = require('markdown-it-emoji')
const texmath = require('markdown-it-texmath')
const katex = require('katex')
const { preprocessLatex } = require('../common/latexHelpers')
const { buildJsonTableIndices, classifyParagraph, collectFiles, concatenateFiles, formatExportMessage, extractText, injectAllSectionNumbers, insertBreakAfterColon, parseTocRange, PARA } = require('../common/specProcessor')
const { highlightAsn } = require('./handlers/asnHandler')
const { jsonToHtmlTable } = require('./handlers/jsonTableHandler')
const { parseBullet, DEFAULT_BULLET } = require('../common/bullets')

/**
 * HTML-specific specification processor.
 *
 * Converts markdown to HTML using markdown-it with custom renderer rules.
 * Paragraph classification (note, editors-note, table-caption, figure-caption)
 * is delegated to the shared classifyParagraph() utility.
 *
 * All VSCode-specific values (CSS, mermaid config, custom renderers, image URI
 * resolution) are injected via the constructor options object.
 */
class Md2Html {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.css=''] - CSS content to embed in HTML documents.
   * @param {string} [options.mermaidConfig='{}'] - Mermaid config JSON string.
   * @param {Object} [options.customRenderers={}] - Map of token type to renderer function string.
   * @param {Function|null} [options.resolveImageUri=null] - Callback `(absolutePath) => string`
   *   that converts a local image path to a URI suitable for the output context (e.g. webview URI).
   * @param {string} [options.extraHeadContent=''] - Additional HTML to inject into <head> for preview.
   * @param {string} [options.specRootPath=''] - Absolute path to the specification root for section numbering.
   */
  constructor(options = {}) {
    this.md = null
    this.css = options.css || ''
    this.mermaidConfig = options.mermaidConfig || '{}'
    this.customRenderers = options.customRenderers || {}
    this.resolveImageUri = options.resolveImageUri || null
    this.extraHeadContent = options.extraHeadContent || ''
    this.specRootPath = options.specRootPath || ''
    this.coverPageHtml = options.coverPageHtml || ''
  }

  /**
   * Initializes the markdown-it parser with plugins and HTML-specific renderer rules.
   */
  initMarkdown() {
    this.md = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: true })
    this.md.use(taskLists, { enabled: true })
    this.md.use(emoji)
    const katexEngine = {
      renderToString: (latex, opts) => katex.renderToString(preprocessLatex(latex, opts && opts.displayMode), opts)
    }
    this.md.use(texmath, { engine: katexEngine, delimiters: 'dollars' })

    const defaultHtmlBlock = this.md.renderer.rules.html_block || function(tokens, idx, options, env, self) {
      return tokens[idx].content
    }
    this.md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
      const m = tokens[idx].content.match(/^<!--\s*FILE:\s*(.+?)\s*-->/)
      if (m) env._baseDir = path.dirname(m[1])
      return defaultHtmlBlock(tokens, idx, options, env, self)
    }

    const defaultFence = this.md.renderer.rules.fence
    this.md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx]
      const attrs = self.renderAttrs(token)
      if (token.info === 'mermaid') {
        return `<pre class="mermaid"${attrs}>${token.content}</pre>`
      }
      if (token.info === 'asn') {
        const highlighted = highlightAsn(token.content)
        if (env._forPreview && token.attrGet && token.attrGet('data-source-line') !== null) {
          const baseLine = parseInt(token.attrGet('data-source-line'))
          const sourceFile = token.attrGet('data-source-file')
          const fileAttr = sourceFile ? ` data-source-file="${sourceFile}"` : ''
          const lines = highlighted.split('\n')
          // +1 to skip the opening ```asn line
          const inner = lines.map((line, i) =>
            `<span data-source-line="${baseLine + 1 + i}"${fileAttr}>${line}</span>`
          ).join('\n')
          return `<pre class="asn"><code>${inner}</code></pre>`
        }
        return `<pre class="asn"${attrs}><code>${highlighted}</code></pre>`
      }
      if (token.info === 'jsonTable') {
        try {
          const data = JSON.parse(token.content)
          return jsonToHtmlTable(data, (s) => this.md.render(s))
        } catch (e) {
          return `<pre${attrs}><code>${token.content}</code></pre>`
        }
      }
      return defaultFence(tokens, idx, options, env, self)
    }

    // Paragraph classification — delegates to shared classifyParagraph()
    const classToStyle = {
      [PARA.NOTE]: 'note',
      [PARA.EDITORS_NOTE]: 'editors-note',
      [PARA.EXAMPLE]: 'example',
      [PARA.TABLE_CAPTION]: 'table-caption',
      [PARA.FIGURE_CAPTION]: 'figure-caption',
    }

    const defaultParagraph = this.md.renderer.rules.paragraph_open || function(tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options)
    }

    this.md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
      const kind = classifyParagraph(tokens, idx, env._jsonTableIndices || new Set())
      const cssClass = classToStyle[kind]
      if (cssClass) {
        if (!tokens[idx].attrs) tokens[idx].attrs = []
        tokens[idx].attrs.push(['class', cssClass])
      }
      return defaultParagraph(tokens, idx, options, env, self)
    }

    this.md.renderer.rules.list_item_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx]

      let isUnordered = false
      for (let i = idx - 1; i >= 0; i--) {
        if (tokens[i].type === 'bullet_list_open') { isUnordered = true; break }
        else if (tokens[i].type === 'ordered_list_open') { break }
      }

      if (isUnordered) {
        let inlineToken = null
        for (let i = idx + 1; i < tokens.length && tokens[i].nesting >= 0; i++) {
          if (tokens[i].type === 'inline') { inlineToken = tokens[i]; break }
        }

        if (inlineToken && inlineToken.children && inlineToken.children.length > 0) {
          const firstChild = inlineToken.children[0]
          let bullet = DEFAULT_BULLET
          if (firstChild.type === 'text') {
            const parsed = parseBullet(firstChild.content)
            bullet = parsed.bullet
            firstChild.content = parsed.rest
          }
          if (!token.attrs) token.attrs = []
          token.attrs.push(['data-bullet', bullet])
          token.attrs.push(['style', `list-style-type: "${bullet} "`])
        }
      }

      return self.renderToken(tokens, idx, options)
    }

    const noteRe = /^(\*\*)?NOTE(\*\*)?( \d+)?:/
    this.md.renderer.rules.td_open = (tokens, idx, options, env, self) => {
      const inline = tokens[idx + 1]
      if (inline && inline.type === 'inline') {
        const text = extractText(inline)
        if (noteRe.test(text)) {
          if (!tokens[idx].attrs) tokens[idx].attrs = []
          tokens[idx].attrs.push(['class', 'table-note'])
        }
      }
      return self.renderToken(tokens, idx, options)
    }

    const defaultLinkOpen = this.md.renderer.rules.link_open || function(tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options)
    }
    const defaultLinkClose = this.md.renderer.rules.link_close || function(tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options)
    }

    this.md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      const href = tokens[idx].attrGet('href')
      if (href && href.endsWith('.json') && tokens[idx + 1] && tokens[idx + 1].type === 'text' && tokens[idx + 1].content === 'JsonTable') {
        try {
          const filePath = env._baseDir ? path.resolve(env._baseDir, href) : href
          const content = fs.readFileSync(filePath, 'utf8')
          const data = JSON.parse(content)
          env._skipLinkTokens = 2
          return jsonToHtmlTable(data, (s) => this.md.render(s))
        } catch (e) {
          // fall through to default rendering
        }
      }
      return defaultLinkOpen(tokens, idx, options, env, self)
    }

    this.md.renderer.rules.text = ((originalText) => (tokens, idx, options, env, self) => {
      if (env._skipLinkTokens > 0) {
        env._skipLinkTokens--
        return ''
      }
      return originalText ? originalText(tokens, idx, options, env, self) : tokens[idx].content
    })(this.md.renderer.rules.text)

    this.md.renderer.rules.link_close = (tokens, idx, options, env, self) => {
      if (env._skipLinkTokens > 0) {
        env._skipLinkTokens--
        return ''
      }
      return defaultLinkClose(tokens, idx, options, env, self)
    }

    Object.entries(this.customRenderers).forEach(([type, fn]) => {
      const original = this.md.renderer.rules[type]
      this.md.renderer.rules[type] = (tokens, idx, options, env, self) => {
        try {
          return eval(`(${fn})`)(tokens, idx, options, env, self, original)
        } catch (e) {
          return original ? original(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
        }
      }
    })
  }

  /**
   * Renders markdown content to body HTML.
   *
   * @param {string} content - Markdown source text.
   * @param {boolean} forPreview - If true, adds preview-specific annotations.
   * @param {string|null} [baseDir=null] - Base directory for resolving relative image paths.
   * @param {string|null} [filePath=null] - Source file path for section numbering (single-file mode).
   * @param {string|null} [specRootPath=null] - Override spec root for this render (null = use constructor value).
   * @returns {string} Rendered HTML body content.
   */
  renderBody(content, forPreview, baseDir = null, filePath = null, specRootPath = null, includeCoverPage = false) {
    if (!this.md) this.initMarkdown()

    const env = { _baseDir: baseDir }
    const tokens = this.md.parse(content, env)

    // Pre-scan JsonTable link indices for paragraph classification
    env._jsonTableIndices = buildJsonTableIndices(tokens)

    // Inject section numbers from file path hierarchy
    injectAllSectionNumbers(tokens, specRootPath !== null ? specRootPath : this.specRootPath, filePath)

    // Insert line break after colon in Annex headings
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'heading_open' && tokens[i].tag === 'h1') {
        const inline = tokens[i + 1]
        if (inline && inline.type === 'inline' && /^Annex\b/i.test(extractText(inline))) {
          insertBreakAfterColon(inline)
        }
      }
    }

    // Assign IDs to headings and generate HTML TOC for {TableOfContent} placeholders
    const headings = []
    const usedIds = new Set()
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'heading_open') {
        const level = parseInt(tokens[i].tag.slice(1), 10)
        const inline = tokens[i + 1]
        const text = inline ? extractText(inline) : ''
        let id = text.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || `heading-${i}`
        while (usedIds.has(id)) id += '-1'
        usedIds.add(id)
        if (!tokens[i].attrs) tokens[i].attrs = []
        tokens[i].attrs.push(['id', id])
        headings.push({ level, text, id })
      }
    }

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'paragraph_open') {
        const inline = tokens[i + 1]
        if (!inline || inline.type !== 'inline') continue
        const kind = classifyParagraph(tokens, i, env._jsonTableIndices || new Set())
        if (kind !== PARA.TOC) continue
        const range = parseTocRange(extractText(inline))
        if (!range) continue
        const [minLevel, maxLevel] = range.split('-').map(Number)
        const tocEntries = headings.filter(h => h.level >= minLevel && h.level <= maxLevel)
        const tocHtml = '<nav class="toc">' + tocEntries.map(h =>
          `<p class="toc-h${h.level}"><a href="#${h.id}">${h.text}</a></p>`
        ).join('\n') + '</nav>'
        // Replace the paragraph tokens with an html_block
        tokens[i] = { type: 'html_block', tag: '', content: tocHtml + '\n', nesting: 0, block: true }
        tokens[i + 1] = { type: 'html_block', tag: '', content: '', nesting: 0, block: true, hidden: true }
        if (tokens[i + 2] && tokens[i + 2].type === 'paragraph_close') {
          tokens[i + 2] = { type: 'html_block', tag: '', content: '', nesting: 0, block: true, hidden: true }
        }
      }
    }

    if (forPreview) {
      env._forPreview = true
      let currentFile = null
      let fileStartLine = 0
      tokens.forEach(token => {
        if (token.type === 'html_block') {
          const m = token.content.match(/^<!--\s*FILE:\s*(.+?)\s*-->/)
          if (m) {
            currentFile = m[1]
            fileStartLine = token.map ? token.map[1] : 0
          }
        }
        if (token.map && (token.type.endsWith('_open') || token.type === 'fence' || token.type === 'hr')) {
          if (!token.attrs) token.attrs = []
          token.attrs.push(['data-source-line', token.map[0] - fileStartLine])
          if (currentFile) token.attrs.push(['data-source-file', currentFile])
        }
      })
    }

    let htmlBody = this.md.renderer.render(tokens, this.md.options, env)

    if (includeCoverPage && this.coverPageHtml) {
      htmlBody = this.coverPageHtml + htmlBody
    }

    if (forPreview && baseDir && this.resolveImageUri) {
      const resolveUri = this.resolveImageUri

      htmlBody = htmlBody.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (match, before, src, after) => {
        if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
          let imgDir = baseDir
          const beforeImg = htmlBody.substring(0, htmlBody.indexOf(match))
          const lastFileComment = beforeImg.lastIndexOf('<!-- FILE: ')
          if (lastFileComment !== -1) {
            const filePathEnd = beforeImg.indexOf(' -->', lastFileComment)
            if (filePathEnd !== -1) {
              const filePath = beforeImg.substring(lastFileComment + 11, filePathEnd)
              imgDir = path.dirname(filePath)
            }
          }

          const imagePath = path.isAbsolute(src) ? src : path.join(imgDir, src)
          if (fs.existsSync(imagePath)) {
            const imageUri = resolveUri(imagePath)
            return `<img${before}src="${imageUri}"${after}>`
          }
        }
        return match
      })

      htmlBody = htmlBody.replace(/<!-- FILE: [^>]+ -->/g, '')
    }

    return htmlBody
  }

  /**
   * Wraps body content in a complete HTML document with CSS, mermaid, and KaTeX.
   *
   * @param {string} htmlBody - Rendered HTML body content.
   * @param {string} [extraHeadContent=''] - Additional content for the <head>.
   * @returns {string} Complete HTML document string.
   */
  wrapHtml(htmlBody, extraHeadContent = '') {
    const katexCss = fs.readFileSync(require.resolve('katex/dist/katex.min.css'), 'utf8')

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>${katexCss}
${this.css}</style>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
mermaid.initialize(${this.mermaidConfig});
</script>
${extraHeadContent}
</head><body>${htmlBody}</body></html>`
  }

  /**
   * Renders markdown content to HTML for the webview preview panel.
   *
   * @param {string} content - Markdown source text.
   * @param {string|null} [baseDir=null] - Base directory for resolving relative image paths.
   * @param {string|null} [filePath=null] - Source file path for section numbering.
   * @param {string|null} [specRootPath=null] - Override spec root for this render.
   * @returns {string} Complete HTML document string with embedded scripts.
   */
  renderMarkdown(content, baseDir = null, filePath = null, specRootPath = null, includeCoverPage = false) {
    const htmlBody = this.renderBody(content, true, baseDir, filePath, specRootPath, includeCoverPage)
    return this.wrapHtml(htmlBody, this.extraHeadContent)
  }

  /**
   * Renders markdown content to a standalone HTML document for export.
   *
   * @param {string} content - Markdown source text.
   * @param {string|null} [specRootPath=null] - Override spec root for this render.
   * @returns {string} Complete HTML document string.
   */
  renderMarkdownForExport(content, specRootPath = null, includeCoverPage = false) {
    const htmlBody = this.renderBody(content, false, null, null, specRootPath, includeCoverPage)
    return this.wrapHtml(htmlBody)
  }

  /**
   * Exports a directory of markdown/ASN.1 files to a standalone HTML file.
   *
   * @param {string} inputDir - Absolute path to the source directory.
   * @param {string} outputDir - Absolute path to the output directory.
   * @returns {{ fileCount: number, imageCount: number }}
   */
  exportHtmlFromDirectory(inputDir, outputDir) {
    const absInput = path.resolve(inputDir)
    const absOutput = path.resolve(outputDir)
    const mediaDir = path.join(absOutput, 'media')
    fs.mkdirSync(mediaDir, { recursive: true })

    const files = collectFiles(absInput)
    if (files.length === 0) return { fileCount: 0, imageCount: 0 }

    const content = concatenateFiles(files)
    let html = this.renderMarkdownForExport(content)

    const copiedImages = new Map()
    html = html.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (match, before, src, after) => {
      if (/^(https?:|data:)/.test(src)) return match

      let imagePath = null
      for (const f of files) {
        const candidate = path.isAbsolute(src) ? src : path.join(path.dirname(f), src)
        if (fs.existsSync(candidate)) { imagePath = candidate; break }
      }
      if (!imagePath) return match

      if (copiedImages.has(imagePath)) {
        return `<img${before}src="media/${copiedImages.get(imagePath)}"${after}>`
      }

      const rel = path.relative(absInput, imagePath)
      const ext = path.extname(rel)
      const safeName = rel.slice(0, -ext.length).replace(/[\\/. ]+/g, '_').replace(/^_+/, '') + ext
      fs.copyFileSync(imagePath, path.join(mediaDir, safeName))
      copiedImages.set(imagePath, safeName)
      return `<img${before}src="media/${safeName}"${after}>`
    })

    html = html.replace(/<!-- FILE: [^>]+ -->/g, '')
    fs.writeFileSync(path.join(absOutput, 'index.html'), html)

    return {
      fileCount: files.length,
      imageCount: copiedImages.size,
      message: formatExportMessage('HTML', files.length, copiedImages.size)
    }
  }
}

module.exports = { Md2Html }
