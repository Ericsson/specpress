const fs = require('fs')
const path = require('path')
const MarkdownIt = require('markdown-it')
const taskLists = require('markdown-it-task-lists')
const emoji = require('markdown-it-emoji')
const texmath = require('markdown-it-texmath')
const katex = require('katex')
const { preprocessLatex } = require('../common/latexHelpers')
const { loadMermaidConfig } = require('../common/mermaidConfig')
const { buildJsonTableIndices, classifyParagraph, collectFiles, concatenateFiles, formatExportMessage, extractText, injectAllSectionNumbers, insertBreakAfterColon, parseTocRange, PARA } = require('../common/specProcessor')
const { highlightAsn } = require('./handlers/asnHandler')
const { jsonToHtmlTable } = require('./handlers/jsonTableHandler')
const { renderMermaidFence } = require('./handlers/mermaidHandler')
const { renderMscgenFence } = require('./handlers/mscgenHandler')
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
   * @param {string|null} [options.mscgenConfig=null] - MSC-Gen config JSON string.
   * @param {Object} [options.customRenderers={}] - Map of token type to renderer function string.
   * @param {string} [options.extraHeadContent=''] - Additional HTML to inject into <head> for preview.
   * @param {string} [options.specRootPath=''] - Absolute path to the specification root for section numbering.
   * @param {object|null} [options.fileResolver=null] - FileResolver instance for file access.
   *   For preview, the resolver's `resolveImageUri` property converts image paths to webview URIs.
   *   When null, the filesystem is used directly and no URI rewriting occurs.
   */
  constructor(options = {}) {
    this.md = null
    this.css = options.css || ''
    this.mermaidConfig = options.mermaidConfig || loadMermaidConfig(null) || '{}'
    this.mscgenConfig = options.mscgenConfig || null
    this.customRenderers = options.customRenderers || {}
    this.extraHeadContent = options.extraHeadContent || ''
    this.specRootPath = options.specRootPath || ''
    this.fileResolver = options.fileResolver || null
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
      if (/^<!--\s*OMITTED\s*-->/.test(tokens[idx].content)) {
        return '<div style="text-align:center;margin:1em 0;padding:0.5em;background:#ffffcc;border:1px solid #cccc00;font-weight:bold">=== unmodified sections omitted ===</div>'
      }
      return defaultHtmlBlock(tokens, idx, options, env, self)
    }

    const defaultFence = this.md.renderer.rules.fence
    this.md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx]
      const attrs = self.renderAttrs(token)
      if (token.info === 'mermaid') {
        return renderMermaidFence(token, attrs, env)
      }
      if (token.info === 'mscgen') {
        return renderMscgenFence(token, attrs, env)
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

    // Image URI resolution at token level — resolves relative paths using
    // env._baseDir and the resolveImageUri callback (for webview preview).
    // When _resolveUris is false (export mode), paths are left as-is for
    // the export pipeline to handle (copy to media/, rewrite to relative).
    const defaultImage = this.md.renderer.rules.image || function(tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options)
    }
    this.md.renderer.rules.image = (tokens, idx, options, env, self) => {
      const resolveImageUri = env._fileResolver && env._fileResolver.resolveImageUri
      if (env._resolveUris && resolveImageUri) {
        const token = tokens[idx]
        const src = token.attrGet('src')
        if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
          const imgDir = env._baseDir || ''
          const imagePath = path.isAbsolute(src) ? src : path.join(imgDir, src)
          if (this._fileExists(imagePath, env._fileResolver)) {
            token.attrSet('src', resolveImageUri(imagePath))
          }
        }
      }
      return defaultImage(tokens, idx, options, env, self)
    }
  }

  /**
   * Renders markdown content to body HTML.
   *
   * Pipeline (aligned with md2docx.js):
   *   parse → preprocess tokens → assign heading IDs → resolve placeholders
   *   → annotate for preview → render → post-process HTML
   *
   * @param {string} content - Markdown source text.
   * @param {boolean} forPreview - If true, adds source-line annotations for scroll sync.
   * @param {string|null} [baseDir=null] - Base directory for resolving relative image paths.
   * @param {string|null} [filePath=null] - Source file path for section numbering (single-file mode).
   * @param {string|null} [specRootPath=null] - Override spec root for this render (null = use constructor value).
   * @param {object|null} [frontPageData=null] - Front page JSON data (renders standard 3GPP front page).
   * @param {object|null} [crCoverPageData=null] - CR cover page JSON data (takes precedence over frontPageData).
   * @param {boolean} [resolveUris] - Override URI resolution independently of forPreview.
   *   When omitted, URI resolution follows forPreview (true = resolve, false = leave as-is).
   *   Resolution only occurs when the effective fileResolver has a resolveImageUri function.
   * @param {object|null} [fileResolver] - Override file resolver for this render only.
   *   When omitted, uses the handler's own fileResolver.
   * @returns {string} Rendered HTML body content.
   */
  renderBody(content, forPreview, baseDir = null, filePath = null, specRootPath = null, frontPageData = null, crCoverPageData = null, resolveUris, fileResolver) {
    if (!this.md) this.initMarkdown()

    const effectiveSpecRoot = specRootPath !== null ? specRootPath : this.specRootPath
    const effectiveFileResolver = fileResolver !== undefined ? fileResolver : this.fileResolver
    const doResolveUris = (resolveUris !== undefined ? resolveUris : forPreview) && !!(effectiveFileResolver && effectiveFileResolver.resolveImageUri)

    const env = {
      _baseDir: baseDir,
      _mscgenConfig: this.mscgenConfig,
      _mermaidConfig: this.mermaidConfig,
      _specRootPath: effectiveSpecRoot,
      _resolveUris: doResolveUris,
      _fileResolver: effectiveFileResolver
    }

    // 1. Parse
    const tokens = this.md.parse(content, env)

    // 2. Pre-process tokens (section numbers, annex headings, JsonTable indices)
    this._preprocessTokens(tokens, env, effectiveSpecRoot, filePath)

    // 3. Assign heading IDs (needed for TOC generation)
    const headings = this._assignHeadingIds(tokens)

    // 4. Resolve placeholders (TOC, CR history)
    this._resolvePlaceholders(tokens, env, headings, effectiveSpecRoot)

    // 5. Annotate tokens for preview (data-source-line, data-source-file)
    if (forPreview) {
      this._annotateForPreview(tokens, env)
    }

    // 6. Render tokens to HTML
    let htmlBody = this.md.renderer.render(tokens, this.md.options, env)

    // 7. Post-process HTML (cover pages, URI resolution, cleanup)
    htmlBody = this._postProcessHtml(htmlBody, env, { forPreview, resolveUris: doResolveUris, frontPageData, crCoverPageData })

    return htmlBody
  }

  /**
   * Pre-processes tokens: builds JsonTable indices, injects section numbers,
   * and applies annex heading line breaks.
   * (Analogous to md2docx's beforeWalk pre-scan phase.)
   */
  _preprocessTokens(tokens, env, specRoot, filePath) {
    env._jsonTableIndices = buildJsonTableIndices(tokens)
    injectAllSectionNumbers(tokens, specRoot, filePath)

    // Insert line break after colon in Annex headings
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'heading_open' && tokens[i].tag === 'h1') {
        const inline = tokens[i + 1]
        if (inline && inline.type === 'inline' && /^Annex\b/i.test(extractText(inline))) {
          insertBreakAfterColon(inline)
        }
      }
    }
  }

  /**
   * Assigns unique IDs to heading tokens for anchor links and TOC.
   * Returns the collected headings array.
   */
  _assignHeadingIds(tokens) {
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
    return headings
  }

  /**
   * Resolves special placeholders in paragraph tokens:
   * - {TableOfContent(N-M)} → HTML TOC nav
   * - {ChangeHistory} → CR history table
   * (Analogous to md2docx's exportToc/exportCRHistory dispatch.)
   */
  _resolvePlaceholders(tokens, env, headings, specRoot) {
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'paragraph_open') continue
      const inline = tokens[i + 1]
      if (!inline || inline.type !== 'inline') continue
      const kind = classifyParagraph(tokens, i, env._jsonTableIndices || new Set())

      if (kind === PARA.TOC) {
        const range = parseTocRange(extractText(inline))
        if (!range) continue
        const [minLevel, maxLevel] = range.split('-').map(Number)
        const tocEntries = headings.filter(h => h.level >= minLevel && h.level <= maxLevel)
        const tocHtml = '<nav class="toc">' + tocEntries.map(h =>
          `<p class="toc-h${h.level}"><a href="#${h.id}">${h.text}</a></p>`
        ).join('\n') + '</nav>'
        tokens[i] = { type: 'html_block', tag: '', content: tocHtml + '\n', nesting: 0, block: true }
        tokens[i + 1] = { type: 'html_block', tag: '', content: '', nesting: 0, block: true, hidden: true }
        if (tokens[i + 2] && tokens[i + 2].type === 'paragraph_close') {
          tokens[i + 2] = { type: 'html_block', tag: '', content: '', nesting: 0, block: true, hidden: true }
        }
      } else if (kind === PARA.CR_HISTORY) {
        let historyHtml = ''
        if (specRoot) {
          const { renderCRHistoryTableHTML } = require('../md2docx/crHistoryRenderer')
          historyHtml = renderCRHistoryTableHTML(specRoot)
        }
        tokens[i] = { type: 'html_block', tag: '', content: historyHtml, nesting: 0, block: true }
        tokens[i + 1] = { type: 'html_block', tag: '', content: '', nesting: 0, block: true, hidden: true }
        if (tokens[i + 2] && tokens[i + 2].type === 'paragraph_close') {
          tokens[i + 2] = { type: 'html_block', tag: '', content: '', nesting: 0, block: true, hidden: true }
        }
        // Mark preceding paragraph as table caption if it qualifies
        let prevIdx = i - 1
        while (prevIdx >= 0 && tokens[prevIdx].type === 'paragraph_close') prevIdx--
        if (prevIdx >= 1 && tokens[prevIdx].type === 'inline' && tokens[prevIdx - 1].type === 'paragraph_open') {
          const prevText = extractText(tokens[prevIdx])
          if (/^(\*\*)?Table/i.test(prevText)) {
            if (!tokens[prevIdx - 1].attrs) tokens[prevIdx - 1].attrs = []
            tokens[prevIdx - 1].attrs.push(['class', 'table-caption'])
          }
        }
      }
    }
  }

  /**
   * Annotates tokens with data-source-line and data-source-file attributes
   * for scroll sync in the VS Code preview.
   */
  _annotateForPreview(tokens, env) {
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

  /**
   * Post-processes rendered HTML: injects cover pages, resolves image URIs
   * for preview, and removes FILE comment markers.
   */
  _postProcessHtml(htmlBody, env, { forPreview, resolveUris, frontPageData, crCoverPageData }) {
    // Cover page injection: CR cover page takes precedence over standard front page.
    if (crCoverPageData) {
      const { renderCRCoverPageHTML } = require('./crCoverPageRenderer')
      htmlBody = renderCRCoverPageHTML(crCoverPageData) + htmlBody
    } else if (frontPageData) {
      const { buildFrontPageHtml } = require('./frontPage')
      htmlBody = buildFrontPageHtml(frontPageData) + htmlBody
    }

    // Remove FILE comments from preview output
    if (forPreview) {
      htmlBody = htmlBody.replace(/<!-- FILE: [^>]+ -->/g, '')
    }

    // Resolve image paths through fileResolver.resolveImageUri for preview
    if (resolveUris) {
      const resolveImageUri = env._fileResolver && env._fileResolver.resolveImageUri
      if (resolveImageUri) {
        htmlBody = htmlBody.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (match, before, src, after) => {
          if (/^(https?:|data:|vscode-)/.test(src)) return match
          let absPath = null
          if (path.isAbsolute(src)) {
            absPath = src
          } else {
            const specRoot = env._specRootPath || this.specRootPath
            if (specRoot) {
              absPath = path.join(path.dirname(specRoot), src)
            } else if (env._baseDir) {
              absPath = path.join(env._baseDir, src)
            }
          }
          if (absPath && this._fileExists(absPath, env._fileResolver)) {
            return `<img${before}src="${resolveImageUri(absPath)}"${after}>`
          }
          return match
        })
      }
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
    if (!this._katexCss) {
      this._katexCss = fs.readFileSync(require.resolve('katex/dist/katex.min.css'), 'utf8')
    }

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>${this._katexCss}
${this.css}</style>
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
   * @param {object|null} [frontPageData=null] - Front page JSON data.
   * @param {object|null} [crCoverPageData=null] - CR cover page JSON data.
   * @returns {string} Complete HTML document string with embedded scripts.
   */
  renderMarkdown(content, baseDir = null, filePath = null, specRootPath = null, frontPageData = null, crCoverPageData = null) {
    const htmlBody = this.renderBody(content, true, baseDir, filePath, specRootPath, frontPageData, crCoverPageData)
    return this.wrapHtml(htmlBody, this.extraHeadContent)
  }

  /**
   * Renders markdown content to a standalone HTML document for export.
   *
   * @param {string} content - Markdown source text.
   * @param {string|null} [specRootPath=null] - Override spec root for this render.
   * @param {object|null} [frontPageData=null] - Front page JSON data.
   * @param {object|null} [crCoverPageData=null] - CR cover page JSON data.
   * @returns {string} Complete HTML document string.
   */
  renderMarkdownForExport(content, specRootPath = null, frontPageData = null, crCoverPageData = null) {
    const htmlBody = this.renderBody(content, false, null, null, specRootPath, frontPageData, crCoverPageData)
    return this.wrapHtml(htmlBody)
  }

  /**
   * Checks if a file exists, using the given resolver if provided, else
   * the handler's own fileResolver, else the filesystem directly.
   * @param {string} absPath
   * @param {object|null} [resolver]
   * @returns {boolean}
   */
  _fileExists(absPath, resolver) {
    const r = resolver !== undefined ? resolver : this.fileResolver
    if (r) {
      if (typeof r.exists === 'function') return r.exists(absPath)
      try { const c = r(absPath); return c !== null && c !== undefined } catch (e) { return false }
    }
    return fs.existsSync(absPath)
  }

  /**
   * Exports a directory of markdown/ASN.1 files to a standalone HTML file.
   *
   * @param {string} inputDir - Absolute path to the source directory.
   * @param {string} outputDir - Absolute path to the output directory.
   * @returns {{ fileCount: number, imageCount: number }}
   */
  exportHtmlFromDirectory(inputDir, outputDir, options = {}) {
    const absInput = path.resolve(inputDir)
    const absOutput = path.resolve(outputDir)
    const mediaDir = path.join(absOutput, 'media')
    fs.mkdirSync(mediaDir, { recursive: true })

    const files = collectFiles(absInput)
    if (files.length === 0) return { fileCount: 0, imageCount: 0 }

    const content = concatenateFiles(files, undefined, this.specRootPath)
    const frontPageData = options.frontPageData || null
    const crCoverPageData = options.crCoverPageData || null
    let html = this.renderMarkdownForExport(content, this.specRootPath, frontPageData, crCoverPageData)

    const copiedImages = new Map()
    html = html.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (match, before, src, after) => {
      if (/^(https?:|data:)/.test(src)) return match

      let imagePath = null
      if (path.isAbsolute(src)) {
        if (fs.existsSync(src)) imagePath = src
      } else {
        // Try resolving relative to spec root parent (for cached/ diagram SVGs)
        const specRootParent = path.dirname(this.specRootPath || absInput)
        const candidate = path.join(specRootParent, src)
        if (fs.existsSync(candidate)) {
          imagePath = candidate
        } else {
          // Fall back: try relative to each source file directory
          for (const f of files) {
            const c = path.join(path.dirname(f), src)
            if (fs.existsSync(c)) { imagePath = c; break }
          }
        }
      }
      if (!imagePath) return match

      if (copiedImages.has(imagePath)) {
        return `<img${before}src="media/${copiedImages.get(imagePath)}"${after}>`
      }

      const rel = path.relative(absInput, imagePath)
      const ext = path.extname(rel)
      const safeName = rel.slice(0, -ext.length).replace(/[\\/.  ]+/g, '_').replace(/^_+/, '') + ext
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
