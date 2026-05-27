const fs = require('fs')
const {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  BorderStyle
} = require('docx')
const { collectApprovedCRs } = require('../common/crCoverPageDetector')
const { formatCRNumber, formatList } = require('../common/crCoverPageLoader')

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: '000000' }

/**
 * Loads and parses all approved CR JSON files from the history folder.
 * Returns them sorted by CR number.
 *
 * @param {string} specRoot - Path to specification root folder
 * @returns {object[]} - Array of parsed CR data objects
 */
function loadApprovedCRs(specRoot) {
  const paths = collectApprovedCRs(specRoot)
  const crs = []
  for (const p of paths) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'))
      crs.push(data)
    } catch (e) { /* skip invalid files */ }
  }
  crs.sort((a, b) => (a.CR || 0) - (b.CR || 0))
  return crs
}

/**
 * Renders the CR history table as DOCX elements (table only, no heading).
 * Place a {ChangeHistory} placeholder in your markdown to insert this table.
 * Returns an empty array if no approved CRs exist.
 *
 * @param {string} specRoot - Path to specification root folder
 * @returns {Object[]} - Array of docx Table elements
 */
function renderCRHistoryTableDOCX(specRoot) {
  const crs = loadApprovedCRs(specRoot)
  if (crs.length === 0) return []

  const headerCells = ['CR', 'Rev', 'Cat', 'Title', 'Clauses affected', 'Source'].map(text =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold: true })], style: 'TAH' })],
      borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
    })
  )

  const rows = [new TableRow({ children: headerCells })]

  for (const cr of crs) {
    rows.push(new TableRow({
      children: [
        textCell(formatCRNumber(cr.CR)),
        textCell(cr.rev ? String(cr.rev) : '-'),
        textCell(cr.Category || ''),
        textCell(cr.Title || ''),
        textCell(formatList(cr['Clauses affected']) || ''),
        textCell(formatList(cr['Source to WG']) || formatList(cr['Source to TSG']) || '')
      ]
    }))
  }

  return [new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE }
  })]
}

/**
 * Renders the CR history annex as DOCX elements (heading + table).
 * @deprecated Use renderCRHistoryTableDOCX with a {ChangeHistory} placeholder instead.
 */
function renderCRHistoryDOCX(specRoot) {
  const crs = loadApprovedCRs(specRoot)
  if (crs.length === 0) return []

  const elements = []
  elements.push(new Paragraph({
    children: [
      new TextRun({ text: 'Annex:' }),
      new TextRun({ text: 'Change history', break: 1 })
    ],
    style: 'Heading8'
  }))
  elements.push(...renderCRHistoryTableDOCX(specRoot))
  return elements
}

function textCell(text) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text })], style: 'TAL' })],
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
  })
}

/**
 * Renders the CR history table as HTML (table only, no heading).
 * Place a {ChangeHistory} placeholder in your markdown to insert this table.
 * Returns an empty string if no approved CRs exist.
 *
 * @param {string} specRoot - Path to specification root folder
 * @returns {string} - HTML string
 */
function renderCRHistoryTableHTML(specRoot) {
  const crs = loadApprovedCRs(specRoot)
  if (crs.length === 0) return ''

  const rows = crs.map(cr => {
    const source = formatList(cr['Source to WG']) || formatList(cr['Source to TSG']) || ''
    return `    <tr>
      <td>${esc(formatCRNumber(cr.CR))}</td>
      <td>${cr.rev ? cr.rev : '-'}</td>
      <td>${esc(cr.Category || '')}</td>
      <td>${esc(cr.Title || '')}</td>
      <td>${esc(formatList(cr['Clauses affected']) || '')}</td>
      <td>${esc(source)}</td>
    </tr>`
  }).join('\n')

  return `<table class="spec-table">
  <thead>
    <tr>
      <th>CR</th><th>Rev</th><th>Cat</th><th>Title</th><th>Clauses affected</th><th>Source</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>\n`
}

/**
 * Renders the CR history annex as HTML (heading + table).
 * @deprecated Use renderCRHistoryTableHTML with a {ChangeHistory} placeholder instead.
 */
function renderCRHistoryHTML(specRoot) {
  const table = renderCRHistoryTableHTML(specRoot)
  if (!table) return ''
  return `<h1>Annex: Change history</h1>\n${table}`
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

module.exports = { loadApprovedCRs, renderCRHistoryDOCX, renderCRHistoryTableDOCX, renderCRHistoryHTML, renderCRHistoryTableHTML }
