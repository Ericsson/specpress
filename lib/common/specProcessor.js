const fs = require('fs')
const path = require('path')
const { parseBullet, DEFAULT_BULLET } = require('./bullets')

/**
 * Shared utilities for specification processing.
 *
 * Provides paragraph classification, file collection, and helper functions
 * used by both the HTML renderer (md2html) and the DOCX converter (md2docx).
 */

/** Paragraph classification constants returned by classifyParagraph. */
const PARA = {
  NOTE: 'note',
  EDITORS_NOTE: 'editorsNote',
  EXAMPLE: 'example',
  TOC: 'toc',
  TABLE_CAPTION: 'tableCaption',
  FIGURE_CAPTION: 'figureCaption',
  DISPLAY_MATH: 'displayMath',
  IMAGE: 'image',
  PARAGRAPH: 'paragraph',
}

/**
 * Extracts plain text from a markdown-it inline token.
 *
 * @param {Object} token - A markdown-it token.
 * @returns {string}
 */
function extractText(token) {
  if (!token) return ''
  if (token.children) return token.children.map(t => t.content || '').join('')
  return token.content || ''
}

/**
 * Checks whether the token at idx is a paragraph containing a JsonTable link.
 *
 * @param {Object[]} tokens - markdown-it token array.
 * @param {number} idx - Index of the paragraph_open token.
 * @returns {boolean}
 */
function isJsonTableLink(tokens, idx) {
  if (tokens[idx].type !== 'paragraph_open') return false
  const inline = tokens[idx + 1]
  if (!inline || inline.type !== 'inline' || !inline.children) return false
  return inline.children.some((c, i) =>
    c.type === 'link_open' && c.attrGet('href')?.endsWith('.json') &&
    inline.children[i + 1]?.type === 'text' && inline.children[i + 1].content === 'JsonTable'
  )
}

/**
 * Scans a token array and returns a Set of indices where inline tokens
 * represent [JsonTable](*.json) links.
 *
 * @param {Object[]} tokens - markdown-it token array.
 * @returns {Set<number>}
 */
function buildJsonTableIndices(tokens) {
  const indices = new Set()
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'inline' && tokens[i].children) {
      const children = tokens[i].children
      if (children.length === 3 &&
        children[0].type === 'link_open' &&
        children[1].type === 'text' && children[1].content === 'JsonTable' &&
        children[2].type === 'link_close') {
        const href = children[0].attrGet('href')
        if (href && href.endsWith('.json')) indices.add(i)
      }
    }
  }
  return indices
}

/**
 * Classifies a paragraph_open token based on its content and surrounding
 * context. Returns a classification string from PARA.
 *
 * Used by both the HTML paragraph_open renderer rule and the DOCX
 * walkTokens dispatch loop, ensuring consistent classification.
 *
 * @param {Object[]} tokens - Full token array.
 * @param {number} idx - Index of the paragraph_open token.
 * @param {Set<number>} jsonTableIndices - Indices of JsonTable link inline tokens.
 * @returns {string} One of the PARA.* classification constants.
 */
function classifyParagraph(tokens, idx, jsonTableIndices) {
  const content = tokens[idx + 1]
  if (!content || content.type !== 'inline') return PARA.PARAGRAPH
  const text = extractText(content)

  if (/^\$\$[\s\S]+\$\$$/.test(content.content)) return PARA.DISPLAY_MATH

  if (content.children && content.children.some(c => c.type === 'image')) return PARA.IMAGE

  if (/^(\*\*)?Editor[\u2019']s Note(\*\*)?/.test(text)) return PARA.EDITORS_NOTE

  if (/^(\*\*)?NOTE(\*\*)?( \d+)?:/.test(text)) return PARA.NOTE

  if (/^(\*\*)?EXAMPLE(\*\*)?/.test(text)) return PARA.EXAMPLE

  if (/^\{TableOfContent\(\d+-\d+\)\}$/.test(text.trim())) return PARA.TOC

  if (/^(\*\*)?Table/i.test(text)) {
    let followIdx = idx + 2
    while (followIdx < tokens.length && tokens[followIdx].type === 'paragraph_close') followIdx++
    if (followIdx < tokens.length && (
      tokens[followIdx].type === 'table_open' ||
      (tokens[followIdx].type === 'fence' && tokens[followIdx].info === 'jsonTable') ||
      isJsonTableLink(tokens, followIdx) ||
      jsonTableIndices.has(followIdx + 1)
    )) return PARA.TABLE_CAPTION
  }

  if (/^(\*\*)?Figure/i.test(text)) {
    let prevIdx = idx - 1
    while (prevIdx >= 0 && (tokens[prevIdx].type === 'paragraph_close' || tokens[prevIdx].hidden)) prevIdx--
    if (prevIdx >= 0) {
      const prevToken = tokens[prevIdx]
      if (prevToken.type === 'fence' ||
        (prevToken.type === 'inline' && prevToken.children && prevToken.children.some(c => c.type === 'image'))) {
        return PARA.FIGURE_CAPTION
      }
    }
  }

  return PARA.PARAGRAPH
}

/**
 * Recursively collects markdown and ASN.1 files from paths.
 *
 * @param {string|string[]} paths - Absolute path(s) to files or directories.
 * @returns {string[]} Sorted array of absolute file paths.
 */
function collectFiles(paths) {
  if (typeof paths === 'string') paths = [paths]
  const results = []
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item)
      if (fs.statSync(full).isDirectory()) walk(full)
      else if (/\.(md|markdown|asn)$/.test(item)) results.push(full)
    }
  }
  for (const p of paths) {
    if (fs.statSync(p).isDirectory()) walk(p)
    else results.push(p)
  }
  return results.sort()
}

/**
 * Generates markdown heading lines for intermediate folders that haven't
 * been seen yet. For each ancestor folder between specRootPath and the
 * file's parent directory, emits a heading if the folder has a valid
 * section number and hasn't been emitted before.
 *
 * @param {string} filePath - Absolute path to the current file.
 * @param {string} specRootPath - Absolute path to the specification root.
 * @param {Set<string>} emittedFolders - Set of folder paths already emitted.
 * @returns {string} Markdown heading lines to prepend (may be empty).
 */
function generateFolderHeadings(filePath, specRootPath, emittedFolders) {
  const dir = path.dirname(filePath)
  const rel = path.relative(specRootPath, dir).replace(/\\/g, '/')
  if (!rel || rel.startsWith('..')) return ''

  // If this file covers its parent folder's heading (leading 0 in filename),
  // mark that folder as emitted so we don't duplicate it
  const basename = path.basename(filePath).replace(/\.[^.]+$/, '')
  const bm = basename.match(/^(\d+)/)
  if (bm && parseInt(bm[1], 10) === 0) {
    emittedFolders.add(dir.replace(/\\/g, '/'))
  }

  const parts = rel.split('/')
  let result = ''
  for (let i = 0; i < parts.length; i++) {
    const folderPath = parts.slice(0, i + 1).join('/')
    const absFolderPath = path.join(specRootPath, folderPath).replace(/\\/g, '/')
    if (emittedFolders.has(absFolderPath)) continue
    emittedFolders.add(absFolderPath)

    const seg = parts[i]
    const m = seg.match(/^(\d+)/)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (n === 0) continue

    const numbers = []
    for (let j = 0; j <= i; j++) {
      const fm = parts[j].match(/^(\d+)/)
      if (fm) {
        const fn = parseInt(fm[1], 10)
        if (fn !== 0) numbers.push(fn)
      }
    }
    if (numbers.length === 0) continue

    const sectionNumber = numbers.join('.')
    const level = numbers.length
    const heading = seg.replace(/^\d+[_\s-]*/, '').trim()
    const hashes = '#'.repeat(level)
    result += `<!-- AUTO-HEADING -->\n${hashes} ${sectionNumber} ${heading}\n\n`
  }
  return result
}

/**
 * Reads and concatenates files into a single markdown string.
 *
 * @param {string[]} files - Sorted array of absolute file paths.
 * @param {Function} [readFile] - Optional callback `(filePath) => string`.
 * @param {string} [specRootPath=''] - Specification root for ASN heading level derivation.
 * @returns {string} Concatenated markdown content.
 */
function concatenateFiles(files, readFile, specRootPath) {
  const { asnToMarkdown } = require('../md2html/handlers/asnHandler')
  if (!readFile) readFile = (f) => fs.readFileSync(f, 'utf8')
  const emittedFolders = new Set()
  return files.map(f => {
    const text = readFile(f)
    const folderHeadings = specRootPath ? generateFolderHeadings(f, specRootPath, emittedFolders) : ''
    if (f.endsWith('.asn')) return `<!-- FILE: ${f} -->\n` + folderHeadings + asnToMarkdown(text, specRootPath, f)
    return `<!-- FILE: ${f} -->\n` + folderHeadings + text
  }).join('\n\n')
}

/**
 * Formats a consistent export completion message.
 *
 * @param {string} fileType - Output format (e.g. 'HTML', 'DOCX').
 * @param {number} fileCount - Number of source files processed.
 * @param {number} imageCount - Number of images embedded.
 * @param {string} [extra] - Optional extra info appended inside the parentheses.
 * @returns {string}
 */
function formatExportMessage(fileType, fileCount, imageCount, extra) {
  const parts = [`${imageCount} image${imageCount !== 1 ? 's' : ''}`]
  if (extra) parts.push(extra)
  return `Generated ${fileType} file from ${fileCount} source file${fileCount !== 1 ? 's' : ''} (${parts.join(', ')}).`
}

/**
 * Extracts a section number and heading name from a file path relative to
 * the specification root.
 *
 * Walks each path segment (folders + filename without extension) from rootPath
 * to filePath. If a segment starts with a number, that number (as integer) is
 * collected. The collected numbers are joined with dots.
 *
 * The derivedSectionHeading is the filename remainder after stripping the
 * leading number, the extension, and surrounding whitespace/underscores.
 *
 * @param {string} filePath - Absolute path to the source file.
 * @param {string} rootPath - Absolute path to the specification root directory.
 * @returns {{ sectionNumber: string, sectionHeading: string }}
 */
function extractSectionNumber(filePath, rootPath) {
  const rel = path.relative(rootPath, filePath)
  if (!rel || rel.startsWith('..')) return { sectionNumber: '', sectionHeading: '' }
  const segments = rel.replace(/\\/g, '/').split('/')
  const last = segments.length - 1
  const baseName = segments[last].replace(/\.[^.]+$/, '')
  segments[last] = baseName
  const numbers = []
  for (const seg of segments) {
    const m = seg.match(/^(\d+)/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n !== 0) numbers.push(n)
    }
  }
  const sectionHeading = baseName.replace(/^\d+[_\s-]*/, '').trim()
  return { sectionNumber: numbers.join('.'), sectionHeading }
}

const ERROR_MARKER = 'E.R.R.O.R'

/**
 * Parses a heading text for an x-placeholder and trailing numeric parts.
 *
 * The placeholder is one or more literal 'x' separated by dots (e.g. x, x.x,
 * x.x.x), optionally followed by dot-delimited numbers. Together they form
 * the actualSectionNumber.
 *
 * @param {string} text - Heading text content.
 * @returns {{ placeholder: string, actualSectionNumber: string, actualHeadingLevel: number, actualHeadingName: string }|null}
 *   null if no placeholder found.
 */
function parsePlaceholder(text) {
  const m = text.match(/^(x(?:\.x)*)((?:\.\d+)*)\s*(.*)/)
  if (!m) return null
  const placeholder = m[1]
  const actualSectionNumber = m[1] + m[2]
  const actualHeadingLevel = actualSectionNumber.split('.').length
  const actualHeadingName = m[3].trim()
  return { placeholder, actualSectionNumber, actualHeadingLevel, actualHeadingName }
}

/**
 * Parses a Figure/Table caption for an x-placeholder.
 *
 * Matches patterns like "Figure x.x-1: caption" or "Table x.x.x-2: caption".
 * The placeholder is one or more literal 'x' separated by dots.
 *
 * @param {string} text - Caption text after "Figure " or "Table ".
 * @returns {{ placeholder: string, placeholderLevel: number }|null}
 *   null if no x-placeholder found (e.g. starts with a digit).
 */
function parseCaptionPlaceholder(text) {
  const m = text.match(/^(x(?:\.x)*)(-)/)
  if (!m) return null
  const placeholder = m[1]
  return { placeholder, placeholderLevel: placeholder.split('.').length }
}

/**
 * Injects section numbers into heading and caption inline tokens based on file path.
 *
 * Parses x-placeholders in heading text and replaces them with the derived
 * section number. Also replaces x-placeholders in Figure/Table captions
 * with the current section number from the most recent resolved heading.
 *
 * @param {Object[]} tokens - markdown-it token array (or slice).
 * @param {string} filePath - Absolute path to the source file.
 * @param {string} specRootPath - Absolute path to the specification root.
 */
function injectSectionNumbers(tokens, filePath, specRootPath) {
  const { sectionNumber, sectionHeading } = extractSectionNumber(filePath, specRootPath)
  const derivedHeadingLevel = sectionNumber ? sectionNumber.split('.').length : 0
  let hadDerivedLevel = false
  let currentResolvedSection = null
  let currentResolvedLevel = 0

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open') {
      const styleHeadingLevel = parseInt(tokens[i].tag.slice(1), 10)
      const inline = tokens[i + 1]
      if (!inline || inline.type !== 'inline') continue

      const firstText = inline.children && inline.children.find(c => c.type === 'text')
      const textContent = firstText ? firstText.content : inline.content || ''
      const trimmed = textContent.trimStart()

      const parsed = parsePlaceholder(trimmed)

      if (!parsed) {
        if (/^\d/.test(trimmed)) {
          // Auto-generated folder headings have a preceding <!-- AUTO-HEADING --> comment
          const prev = i > 0 ? tokens[i - 1] : null
          if (prev && prev.type === 'html_block' && /<!--\s*AUTO-HEADING\s*-->/.test(prev.content)) continue
          // User-written heading with manual section number → error
          if (firstText) firstText.content = ERROR_MARKER + ' ' + firstText.content
          else inline.content = ERROR_MARKER + ' ' + inline.content
        }
        // No placeholder and no leading number → unnumbered heading, leave as-is
        continue
      }

      // Placeholder found but no derivedSectionNumber → error
      if (!sectionNumber) {
        if (firstText) firstText.content = ERROR_MARKER + ' ' + firstText.content
        else inline.content = ERROR_MARKER + ' ' + inline.content
        continue
      }

      const { placeholder, actualSectionNumber, actualHeadingLevel, actualHeadingName } = parsed
      let error = false

      const placeholderXCount = placeholder.split('.').length
      if (placeholderXCount !== derivedHeadingLevel) error = true
      if (styleHeadingLevel !== actualHeadingLevel) error = true
      if (styleHeadingLevel < derivedHeadingLevel) error = true

      if (!error && styleHeadingLevel === derivedHeadingLevel) {
        if (hadDerivedLevel) error = true
        else hadDerivedLevel = true
      }

      if (error) {
        if (firstText) firstText.content = ERROR_MARKER + ' ' + firstText.content
        else inline.content = ERROR_MARKER + ' ' + inline.content
        continue
      }

      const replaced = actualSectionNumber.replace(placeholder, sectionNumber)
      let newText = trimmed.replace(actualSectionNumber, replaced)

      // Auto-append file-derived heading only when the heading has no name at all
      // (not even in emphasis/bold tokens beyond the first text node)
      if (!actualHeadingName && sectionHeading) {
        const firstTextIdx = inline.children ? inline.children.indexOf(firstText) : -1
        const hasMoreContent = inline.children && inline.children.slice(firstTextIdx + 1).some(c => c.type === 'text' || c.type === 'code_inline' || c.tag === 'em' || c.tag === 'strong' || c.tag === 's')
        if (!hasMoreContent) {
          newText = newText.trimEnd() + ' ' + sectionHeading
        }
      }

      const leadingWs = textContent.substring(0, textContent.length - trimmed.length)
      if (firstText) firstText.content = leadingWs + newText
      else inline.content = leadingWs + newText

      // Track resolved section for caption replacement
      currentResolvedSection = replaced
      currentResolvedLevel = actualHeadingLevel
      continue
    }

    // Handle Figure/Table captions
    if (tokens[i].type !== 'inline') continue
    const firstText = tokens[i].children && tokens[i].children.find(c => c.type === 'text')
    if (!firstText) continue
    const captionMatch = firstText.content.match(/^(Figure|Table)\s+(.*)/i)
    if (!captionMatch) continue
    const keyword = captionMatch[1]
    const afterKeyword = captionMatch[2]

    const captionParsed = parseCaptionPlaceholder(afterKeyword)
    if (!captionParsed) continue // no placeholder, leave unchanged

    const { placeholder, placeholderLevel } = captionParsed

    if (!currentResolvedSection || placeholderLevel !== currentResolvedLevel) {
      firstText.content = firstText.content.replace(
        new RegExp(`^(${keyword}\\s+)${placeholder.replace(/\./g, '\\.')}`),
        `$1${ERROR_MARKER}`
      )
    } else {
      firstText.content = firstText.content.replace(placeholder, currentResolvedSection)
    }
  }
}

/**
 * Injects section numbers into all heading tokens, handling both single-file
 * and multi-file (FILE comment delimited) content.
 *
 * @param {Object[]} tokens - markdown-it token array.
 * @param {string} specRootPath - Absolute path to the specification root.
 * @param {string|null} [filePath=null] - Source file path (single-file mode).
 */
function injectAllSectionNumbers(tokens, specRootPath, filePath) {
  if (!specRootPath) return
  if (filePath) {
    injectSectionNumbers(tokens, filePath, specRootPath)
  } else {
    // Multi-file: track current file via FILE comments
    let currentFile = null
    let fileTokenStart = 0
    const segments = []
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'html_block') {
        const m = tokens[i].content.match(/^<!--\s*FILE:\s*(.+?)\s*-->/)
        if (m) {
          if (currentFile) segments.push({ file: currentFile, start: fileTokenStart, end: i })
          currentFile = m[1]
          fileTokenStart = i + 1
        }
      }
    }
    if (currentFile) segments.push({ file: currentFile, start: fileTokenStart, end: tokens.length })
    for (const seg of segments) {
      injectSectionNumbers(tokens.slice(seg.start, seg.end), seg.file, specRootPath)
    }
  }
}

/**
 * Inserts a softbreak token after the first colon in an inline token's children.
 * Used for Annex headings to place the title on a new line after the colon.
 *
 * @param {Object} inlineToken - A markdown-it inline token.
 */
function insertBreakAfterColon(inlineToken) {
  if (!inlineToken || !inlineToken.children) return
  for (let i = 0; i < inlineToken.children.length; i++) {
    const child = inlineToken.children[i]
    if (child.type === 'text' && child.content.includes(':')) {
      const colonIdx = child.content.indexOf(':')
      const before = child.content.substring(0, colonIdx + 1)
      const after = child.content.substring(colonIdx + 1).replace(/^\s+/, '')
      child.content = before
      const br = { type: 'softbreak', tag: 'br' }
      if (after) {
        inlineToken.children.splice(i + 1, 0, br, { type: 'text', content: after })
      } else {
        inlineToken.children.splice(i + 1, 0, br)
        // Remove leading whitespace from the next text token if any
        if (i + 2 < inlineToken.children.length && inlineToken.children[i + 2].type === 'text') {
          inlineToken.children[i + 2].content = inlineToken.children[i + 2].content.replace(/^\s+/, '')
        }
      }
      return
    }
  }
}

/**
 * Parses a {TableOfContent(N-M)} placeholder and returns the range string.
 *
 * @param {string} text - The paragraph text.
 * @returns {string|null} The range string (e.g. "1-9"), or null if not a TOC placeholder.
 */
function parseTocRange(text) {
  const m = text.trim().match(/^\{TableOfContent\((\d+-\d+)\)\}$/)
  return m ? m[1] : null
}

module.exports = {
  PARA,
  DEFAULT_BULLET,
  ERROR_MARKER,
  extractText,
  isJsonTableLink,
  buildJsonTableIndices,
  classifyParagraph,
  collectFiles,
  concatenateFiles,
  formatExportMessage,
  extractSectionNumber,
  parsePlaceholder,
  parseCaptionPlaceholder,
  injectSectionNumbers,
  injectAllSectionNumbers,
  insertBreakAfterColon,
  parseTocRange,
}
