const { TextRun, ExternalHyperlink } = require('docx')
const { latexToDocxMath } = require('./latexEquationHandler')

/**
 * Walks markdown-it inline token children and produces an array of docx
 * TextRun / math components. Handles text, strong, em (including nested
 * bold+italic), softbreak, and inline math ($...$).
 *
 * @param {Object[]} children - The inline token's children array.
 * @param {import('../../types').InlineRunOptions} [opts={}]
 * @returns {Promise<Array>} Array of TextRun / math XmlComponent instances.
 */
async function buildInlineRuns(children, opts = {}) {
  if (!children || children.length === 0) return [new TextRun('')]
  const runs = []
  let i = 0
  let firstSpaceReplaced = !opts.replaceFirstSpace
  let firstColonSpaceReplaced = !opts.replaceFirstColonSpace
  const bold = opts.bold || false
  const italics = opts.italics || false

  function runProps() {
    return {
      ...(bold && { bold: true }),
      ...(italics && { italics: true }),
      ...(opts.color && { color: opts.color }),
      ...(opts.style && { style: opts.style }),
      ...(opts.font && { font: opts.font }),
      ...(opts.size && { size: opts.size })
    }
  }

  function applyFirstTab(text) {
    if (!firstColonSpaceReplaced && text.includes(': ')) {
      firstColonSpaceReplaced = true
      return text.replace(': ', ':\t')
    }
    if (!firstSpaceReplaced && text.includes(' ')) {
      firstSpaceReplaced = true
      return text.replace(' ', '\t')
    }
    return text
  }

  while (i < children.length) {
    const child = children[i]

    if (child.type === 'text') {
      const text = child.content
      const mathRegex = /\$([^$]+)\$/g
      let lastIndex = 0
      let match
      while ((match = mathRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          const before = applyFirstTab(text.substring(lastIndex, match.index))
          runs.push(new TextRun({ text: before, ...runProps() }))
        }
        try {
          runs.push(await latexToDocxMath(match[1]))
        } catch (e) {
          runs.push(new TextRun({ text: match[0], ...runProps() }))
        }
        lastIndex = match.index + match[0].length
      }
      if (lastIndex < text.length) {
        const remaining = applyFirstTab(text.substring(lastIndex))
        runs.push(new TextRun({ text: remaining, ...runProps() }))
      } else if (lastIndex === 0) {
        runs.push(new TextRun({ text: applyFirstTab(text), ...runProps() }))
      }
      i++
    } else if (child.type === 'softbreak') {
      runs.push(new TextRun({ break: 1, ...runProps() }))
      i++
    } else if (child.type === 'strong_open') {
      const nested = []
      let j = i + 1
      let depth = 1
      while (j < children.length && depth > 0) {
        if (children[j].type === 'strong_open') depth++
        else if (children[j].type === 'strong_close') depth--
        if (depth > 0) nested.push(children[j])
        j++
      }
      const nestedRuns = await buildInlineRuns(nested, { ...opts, bold: true, italics, replaceFirstSpace: !firstSpaceReplaced, replaceFirstColonSpace: !firstColonSpaceReplaced })
      runs.push(...nestedRuns)
      if (!firstSpaceReplaced && nestedRuns.length > 0) firstSpaceReplaced = true
      if (!firstColonSpaceReplaced && nestedRuns.length > 0) firstColonSpaceReplaced = true
      i = j
    } else if (child.type === 'em_open') {
      const nested = []
      let j = i + 1
      let depth = 1
      while (j < children.length && depth > 0) {
        if (children[j].type === 'em_open') depth++
        else if (children[j].type === 'em_close') depth--
        if (depth > 0) nested.push(children[j])
        j++
      }
      const nestedRuns = await buildInlineRuns(nested, { ...opts, bold, italics: true, replaceFirstSpace: !firstSpaceReplaced, replaceFirstColonSpace: !firstColonSpaceReplaced })
      runs.push(...nestedRuns)
      if (!firstSpaceReplaced && nestedRuns.length > 0) firstSpaceReplaced = true
      if (!firstColonSpaceReplaced && nestedRuns.length > 0) firstColonSpaceReplaced = true
      i = j
    } else if (child.type === 'link_open') {
      const href = child.attrGet('href') || ''
      const nested = []
      let j = i + 1
      while (j < children.length && children[j].type !== 'link_close') {
        nested.push(children[j])
        j++
      }
      const linkRuns = await buildInlineRuns(nested, { ...opts, bold, italics, style: 'Hyperlink', replaceFirstSpace: !firstSpaceReplaced, replaceFirstColonSpace: !firstColonSpaceReplaced })
      runs.push(new ExternalHyperlink({ children: linkRuns, link: href }))
      if (!firstSpaceReplaced && linkRuns.length > 0) firstSpaceReplaced = true
      if (!firstColonSpaceReplaced && linkRuns.length > 0) firstColonSpaceReplaced = true
      i = j + 1
    } else if (child.type === 'code_inline') {
      runs.push(new TextRun({ text: child.content, font: 'Courier New', size: 18, ...runProps() }))
      i++
    } else {
      i++
    }
  }
  return runs.length > 0 ? runs : [new TextRun('')]
}

module.exports = { buildInlineRuns }
