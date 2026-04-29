/**
 * Builds a span map from the rows array, resolving "^" and "<" markers
 * into rowspan/colspan values and marking merged cells to be skipped.
 *
 * @param {Array[]} rows - The rows array from the input data.
 * @param {number} rowCount - Number of rows.
 * @param {number} colCount - Number of columns.
 * @returns {object[][]} 2D array of { value, rowspan, colspan, skip } objects.
 */
function buildSpanMap(rows, rowCount, colCount) {
  const map = []
  const owner = []
  for (let r = 0; r < rowCount; r++) {
    map[r] = []
    owner[r] = []
    for (let c = 0; c < colCount; c++) {
      const val = (rows[r] || [])[c]
      map[r][c] = { value: val, rowspan: 1, colspan: 1, skip: false }
      owner[r][c] = [r, c]
    }
  }
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      if (map[r][c].value === '<' && c > 0) {
        map[r][c].skip = true
        const [or, oc] = owner[r][c - 1]
        owner[r][c] = [or, oc]
        map[or][oc].colspan = Math.max(map[or][oc].colspan, c - oc + 1)
      }
      if (map[r][c].value === '^' && r > 0) {
        map[r][c].skip = true
        const [or, oc] = owner[r - 1][c]
        owner[r][c] = [or, oc]
        map[or][oc].rowspan = Math.max(map[or][oc].rowspan, r - or + 1)
      }
    }
  }
  return map
}

/**
 * Normalizes JsonTable rows from key-based objects to positional arrays.
 *
 * Each row object is mapped to an array using the `key` property of each
 * column definition. When a key is absent from a row object (not present
 * at all — an empty string is a valid value), the column's `mergeOnAbsence`
 * property determines the cell value:
 *   - "above" → "^" (merge with cell above)
 *   - "left"  → "<" (merge with cell to the left)
 *   - "no" or absent → "" (empty cell)
 *
 * @param {object} data - JsonTable data with `columns` and `rows`.
 * @returns {object} Data with rows converted to arrays.
 */
function normalizeJsonTable(data) {
  if (!data || !data.rows || data.rows.length === 0) return data
  const columns = data.columns || []
  const hasKeys = columns.some(c => c.key !== undefined)
  if (!hasKeys) return data
  const rows = data.rows.map(row => {
    if (Array.isArray(row)) return row
    return columns.map(col => {
      if (col.key !== undefined && col.key in row) return row[col.key]
      const merge = col.mergeOnAbsence
      if (merge === 'above') return '^'
      if (merge === 'left') return '<'
      return ''
    })
  })
  return { ...data, rows }
}

module.exports = { buildSpanMap, normalizeJsonTable }
