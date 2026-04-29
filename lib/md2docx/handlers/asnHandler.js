const { Paragraph, TextRun } = require('docx')
const MarkdownIt = require('markdown-it')
const { buildInlineRuns } = require('./inlineRunBuilder')

const ASN_MULTI_WORD_KEYWORDS = ['OCTET STRING', 'BIT STRING']

const ASN_KEYWORD_PATTERN = /\b(SEQUENCE|BOOLEAN|SIZE|ENUMERATED|OPTIONAL|FROM|IMPORTS|EXPORTS|SET|BEGIN|END|CHOICE|NULL|OF|INTEGER|CONTAINING)(?![a-zA-Z0-9-])|\b([A-Z][a-zA-Z0-9-]*)|\b([a-z][a-zA-Z0-9-]*)/g

/** @type {MarkdownIt|null} Lazily initialized markdown-it instance for comment parsing. */
let commentMd = null

/**
 * Converts ASN.1 source text into syntax-highlighted docx Paragraphs.
 *
 * @param {string} content - Raw ASN.1 source text.
 * @returns {Promise<Paragraph[]>} Array of generated Paragraphs.
 */
async function asnToDocxParagraphs(content) {
  const elements = []
  const lines = content.split('\n').filter((line, idx, arr) => {
    return idx < arr.length - 1 || line.trim() !== ''
  })

  for (const line of lines) {
    const children = []
    const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0
    const hangingIndent = (leadingSpaces + 4) * 96

    const commentIndex = line.indexOf('--')
    if (commentIndex >= 0) {
      const beforeComment = line.substring(0, commentIndex)
      if (beforeComment) processAsnText(beforeComment, children)
      await processAsnComment(line.substring(commentIndex), children)
    } else {
      processAsnText(line, children)
    }

    elements.push(new Paragraph({
      children,
      style: 'PL',
      shading: { fill: '000000', type: 'clear', color: 'auto' },
      indent: { left: hangingIndent, hanging: hangingIndent }
    }))
  }
  return elements
}

/**
 * Tokenises ASN.1 text and appends colour-coded TextRun elements.
 *
 * @param {string} text - ASN.1 text fragment (no comments).
 * @param {Object[]} children - Array to append TextRun elements to.
 */
function processAsnText(text, children) {
  let remaining = text
  for (const mw of ASN_MULTI_WORD_KEYWORDS) {
    const parts = remaining.split(mw)
    if (parts.length > 1) {
      remaining = ''
      parts.forEach((part, i) => {
        if (part) processAsnTextSingle(part, children)
        if (i < parts.length - 1) {
          children.push(new TextRun({ text: mw, color: 'C586C0', font: 'Courier New', size: 16 }))
        }
      })
      return
    }
  }
  processAsnTextSingle(text, children)
}

/**
 * Processes a single ASN.1 text fragment (no multi-word keywords).
 *
 * @param {string} text - ASN.1 text fragment.
 * @param {Object[]} children - Array to append TextRun elements to.
 */
function processAsnTextSingle(text, children) {
  ASN_KEYWORD_PATTERN.lastIndex = 0
  let lastIndex = 0
  let match
  while ((match = ASN_KEYWORD_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      children.push(new TextRun({ text: text.substring(lastIndex, match.index), font: 'Courier New', size: 16 }))
    }
    if (match[1]) {
      children.push(new TextRun({ text: match[0], color: 'C586C0', font: 'Courier New', size: 16 }))
    } else if (match[2]) {
      children.push(new TextRun({ text: match[0], color: 'd7ba7d', font: 'Courier New', size: 16 }))
    } else if (match[3]) {
      children.push(new TextRun({ text: match[0], color: '4CC1BB', font: 'Courier New', size: 16 }))
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    children.push(new TextRun({ text: text.substring(lastIndex), font: 'Courier New', size: 16 }))
  }
}

/**
 * Parses ASN.1 comment text for inline bold/italic markdown and appends
 * coloured TextRun elements.
 *
 * @param {string} text - Comment text including the -- marker.
 * @param {Object[]} children - Array to append TextRun elements to.
 */
async function processAsnComment(text, children) {
  if (!commentMd) commentMd = new MarkdownIt({ html: true })
  const tokens = commentMd.parseInline(text, {})
  const inlineChildren = tokens.length > 0 ? tokens[0].children : []
  if (!inlineChildren || inlineChildren.length === 0) {
    children.push(new TextRun({ text, color: '81B16B', font: 'Courier New', size: 16 }))
    return
  }
  const runs = await buildInlineRuns(inlineChildren, { color: '81B16B', font: 'Courier New', size: 16 })
  children.push(...runs)
}

module.exports = { asnToDocxParagraphs, processAsnText, processAsnComment }
