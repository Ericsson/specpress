const fs = require('fs')
const { buildSpanMap, normalizeJsonTable } = require('../../common/buildSpanMap')

/**
 * Converts parsed JSON data into an HTML table string.
 *
 * The input object is expected to have the following structure:
 *   { columns: [{ name: string, align: string }], rows: [[...], ...] }
 *
 * Columns define headers and alignment. Rows contain the cell values.
 * Special cell markers:
 *   "^" — cell is merged with the cell above (rowspan)
 *   "<" — cell is merged with the cell to the left (colspan)
 *
 * If an array is passed, each element is converted to a separate table.
 *
 * @param {object|object[]} data - Parsed JSON object (or array of objects),
 *   each with a `columns` array defining headers and alignment, and a `rows`
 *   array of cell value arrays.
 * @param {function} [renderMd] - Optional function that takes a markdown string
 *   and returns HTML. When provided, string cell values are rendered as markdown.
 * @returns {string} HTML table string, or empty string if input is invalid.
 */
function jsonToHtmlTable(data, renderMd) {
  if (Array.isArray(data)) {
    return data.map(item => jsonToHtmlTable(item, renderMd)).join('\n')
  }

  data = normalizeJsonTable(data)
  if (!data || !data.rows || !Array.isArray(data.rows) || data.rows.length === 0) {
    return ''
  }

  const columns = data.columns || []

  const hasHeaders = columns.some(col => col.name)
  let header = ''
  if (hasHeaders) {
    const headerCells = columns.map(col =>
      `<th style="border:1px solid black${col.align ? ';text-align:' + col.align : ''}">${renderCellValue(col.name, renderMd)}</th>`
    ).join('')
    header = `<thead><tr>${headerCells}</tr></thead>\n`
  }

  const rowCount = data.rows.length
  const colCount = Math.max(columns.length, ...data.rows.map(r => r.length))
  const spanMap = buildSpanMap(data.rows, rowCount, colCount)

  const rows = []
  for (let r = 0; r < rowCount; r++) {
    const cells = []
    for (let c = 0; c < colCount; c++) {
      const span = spanMap[r][c]
      if (span.skip) continue
      const rowspanAttr = span.rowspan > 1 ? ` rowspan="${span.rowspan}"` : ''
      const colspanAttr = span.colspan > 1 ? ` colspan="${span.colspan}"` : ''
      const text = span.value === null || span.value === undefined ? '' : String(span.value)
      const isNote = typeof span.value === 'string' && !span.value.includes('\n') && noteRe.test(span.value.trim())
      const noteClass = isNote ? ' class="table-note"' : ''
      const alignStyle = !isNote && columns[c] && columns[c].align ? ';text-align:' + columns[c].align : ''
      cells.push(`<td${noteClass} style="border:1px solid black${alignStyle}"${rowspanAttr}${colspanAttr}>${renderCellValue(text, renderMd)}</td>`)
    }
    rows.push(`<tr>${cells.join('')}</tr>`)
  }
  const body = `<tbody>${rows.join('\n')}</tbody>\n`

  return `<table style="border-collapse:collapse">
${header}${body}</table>`
}


const noteRe = /^(\*\*)?NOTE(\*\*)?( \d+)?:/

/**
 * Converts a single cell value to its HTML string representation.
 *
 * - null/undefined → empty string
 * - string + renderMd provided → rendered as inline markdown (paragraph tags stripped);
 *   lines starting with NOTE get wrapped in a span with class "note".
 * - All other types → converted to string
 *
 * @param {*} val - The cell value to render.
 * @param {function} [renderMd] - Optional markdown render function.
 * @returns {string} HTML string for the cell content.
 */
function renderCellValue(val, renderMd) {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string' && renderMd) {
    const lines = val.split('\n')
    if (lines.length === 1) {
      return renderMd(val).replace(/^\s*<p[^>]*>\s*/, '').replace(/\s*<\/p>\s*$/, '')
    }
    return lines.map(line => {
      const html = renderMd(line).replace(/^\s*<p/, '<p').replace(/\s*$/, '')
      if (noteRe.test(line.trim())) {
        return html.replace(/<p[^>]*>/, '<p class="table-note">')
      }
      return html
    }).join('\n')
  }
  return String(val)
}

/**
 * Reads a JSON file from disk and converts it to an HTML table string.
 *
 * @param {string} filePath - Absolute or relative path to the JSON file.
 * @param {function} [renderMd] - Optional function that takes a markdown string
 *   and returns HTML. When provided, string cell values are rendered as markdown.
 * @returns {string} HTML table string.
 * @throws {Error} If the file does not exist or contains invalid JSON.
 */
function jsonFileToHtmlTable(filePath, renderMd) {
  const content = fs.readFileSync(filePath, 'utf8')
  const data = JSON.parse(content)
  return jsonToHtmlTable(data, renderMd)
}

module.exports = { jsonToHtmlTable, jsonFileToHtmlTable }
