const {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, PageBreak, VerticalAlign
} = require('docx')
const {
  formatCRNumber,
  formatRevNumber,
  extractRelease,
  formatList,
  formatLines,
  getBoolean
} = require('../common/crCoverPageLoader')

const YELLOW = { fill: 'FFFFCA', type: ShadingType.CLEAR, color: 'auto' }
const LIGHT_YELLOW = { fill: 'FFFFDD', type: ShadingType.CLEAR, color: 'auto' }
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: '000000' }
const NO_BORDER = { style: BorderStyle.NONE, size: 0 }
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }
const CELL_MARGINS = { left: 80, right: 80, top: 40, bottom: 40 }

/**
 * Renders CR cover page data to DOCX elements.
 */
function renderCRCoverPageDOCX(crData) {
  const elements = []

  // TDoc number at top
  elements.push(new Paragraph({
    style: 'CRCoverPage',
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({ text: crData['TDoc Number'] || '', bold: true, italics: true, size: 28 })
    ]
  }))

  // Main CR header table
  elements.push(createHeaderTable(crData))

  // Narrow separator
  elements.push(narrowSeparator())

  // Affected checkboxes
  elements.push(createAffectedTable(crData))

  // Narrow separator
  elements.push(narrowSeparator())

  // Content table 1: Title through Consequences
  elements.push(createContentTable1(crData))

  // Narrow separator
  elements.push(narrowSeparator())

  // Content table 2: Clauses affected, Other specs, Other comments, Forge
  elements.push(createContentTable2(crData))

  // Page break after CR cover page
  elements.push(new Paragraph({ children: [new PageBreak()] }))

  return elements
}

function narrowSeparator() {
  return new Paragraph({ style: 'CRCoverNarrow', children: [new TextRun({ text: '' })] })
}

function createHeaderTable(crData) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnSpan: 9,
            verticalAlign: VerticalAlign.CENTER,
            margins: CELL_MARGINS,
            children: [crP({ text: 'CHANGE REQUEST', bold: true, size: 32 }, AlignmentType.CENTER)]
          })
        ]
      }),
      new TableRow({
        children: [
          crCell(16, YELLOW, crP({ text: crData.Specification || '', bold: true, size: 28 }, AlignmentType.RIGHT)),
          crCell(7, null, crP({ text: 'CR', bold: true, size: 28 }, AlignmentType.RIGHT)),
          crCell(13, YELLOW, crP({ text: formatCRNumber(crData.CR), bold: true, size: 28 }, AlignmentType.CENTER)),
          crCell(7, null, crP({ text: 'rev', bold: true, size: 28 }, AlignmentType.RIGHT)),
          crCell(11, YELLOW, crP({ text: formatRevNumber(crData.rev), bold: true, size: 28 }, AlignmentType.CENTER)),
          crCell(25, null, crP({ text: 'Current version:', bold: true, size: 28 }, AlignmentType.RIGHT)),
          crCell(21, YELLOW, crP({ text: crData['Current version'] || '', bold: true, size: 28 }, AlignmentType.CENTER))
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnSpan: 9,
            verticalAlign: VerticalAlign.CENTER,
            margins: CELL_MARGINS,
            children: [new Paragraph({
              style: 'CRCoverPage',
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'For ', italics: true }),
                new TextRun({ text: 'HELP', bold: true, italics: true }),
                new TextRun({ text: ' on using this form: comprehensive instructions can be found at', italics: true }),
                new TextRun({ text: '', break: 1 }),
                new TextRun({ text: 'https://www.3gpp.org/Change-Requests.', italics: true })
              ]
            })]
          })
        ]
      })
    ]
  })
}

function createAffectedTable(crData) {
  const affected = crData.Affected || {}
  const uicc = getBoolean(affected.UICC)
  const me = getBoolean(affected.ME)
  const ran = getBoolean(affected.RAN) || getBoolean(affected['Radio Access Network'])
  const cn = getBoolean(affected.CN) || getBoolean(affected['Core Network'])

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: [
      new TableRow({
        children: [
          crCellNB(29, null, crP({ text: 'Proposed change affects:', bold: true, italics: true })),
          crCellNB(15, null, crP({ text: 'UICC apps' }, AlignmentType.RIGHT)),
          checkboxCell(uicc),
          crCellNB(7, null, crP({ text: 'ME' }, AlignmentType.RIGHT)),
          checkboxCell(me),
          crCellNB(22, null, crP({ text: 'Radio Access Network' }, AlignmentType.RIGHT)),
          checkboxCell(ran),
          crCellNB(15, null, crP({ text: 'Core Network' }, AlignmentType.RIGHT)),
          checkboxCell(cn)
        ]
      })
    ]
  })
}

/**
 * Content table 1: Title, Source to WG, Source to TSG, Work item/Date, Category/Release,
 * Reason for change, Summary of change, Consequences if not approved.
 * Uses a 4-column grid for the Work item/Date and Category/Release rows.
 */
function createContentTable1(crData) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER },
    rows: [
      labelValueRow4('Title:', crData.Title || ''),
      labelValueRow4('Source to WG:', formatList(crData['Source to WG'])),
      labelValueRow4('Source to TSG:', formatList(crData['Source to TSG'])),
      // Work item + Date (4 real columns)
      new TableRow({
        children: [
          crCell(28, null, crP({ text: 'Work item code:', bold: true, italics: true })),
          crCell(38, YELLOW, crP({ text: formatList(crData['Work item code']) })),
          crCell(12, null, crP({ text: 'Date:', bold: true, italics: true }, AlignmentType.RIGHT)),
          crCell(22, YELLOW, crP({ text: crData.Date || '' }))
        ]
      }),
      // Category + Release (4 real columns)
      new TableRow({
        children: [
          crCell(28, null, crP({ text: 'Category:', bold: true, italics: true })),
          crCell(38, YELLOW, crP({ text: crData.Category || '', bold: true })),
          crCell(12, null, crP({ text: 'Release:', bold: true, italics: true }, AlignmentType.RIGHT)),
          crCell(22, YELLOW, crP({ text: crData.Release ? `Rel-${crData.Release}` : extractRelease(crData['Current version']) }))
        ]
      }),
      labelValueRow4('Reason for change:', crData['Reason for change'] || ''),
      summaryRow(crData),
      labelValueRow4('Consequences if not approved:', crData['Consequences if not approved'] || '')
    ]
  })
}

/**
 * Content table 2: Clauses affected, Other specs affected (with Y/N), Other comments, Forge.
 * Uses a 5-column grid: label(28%) | Y(4%) | N(4%) | sub-label(25%) | value(39%)
 */
function createContentTable2(crData) {
  const otherSpecs = crData['Other specs affected'] || {}
  const otherCoreLines = formatLines(otherSpecs['Other core specifications'])
  const testSpecsLines = formatLines(otherSpecs['Test specifications'])
  const oamSpecsLines = formatLines(otherSpecs['O&M Specifications'])
  const hasAnyOther = !!(otherCoreLines.length || testSpecsLines.length || oamSpecsLines.length)

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER },
    rows: [
      // Clauses affected (spans all 5 columns as label+value)
      labelValueRow5('Clauses affected:', formatList(crData['Clauses affected']) || (typeof crData['Clauses affected'] === 'string' ? crData['Clauses affected'] : '')),
      // Y/N header
      ynHeaderRow(),
      // Other specs affected
      otherSpecsRow('Other specs affected:', hasAnyOther, 'Other core specifications', otherCoreLines),
      otherSpecsSubRow('Test specifications', testSpecsLines),
      otherSpecsSubRow('O&M Specifications', oamSpecsLines),
      // Other comments (spans all 5 columns)
      labelValueRow5('Other comments:', crData['Other comments'] || ''),
      // Forge related attachments (spans all 5 columns)
      labelValueRow5('Forge related attachments:', crData['Forge related attachments'] || '')
    ]
  })
}

// --- Row builders ---

/** 4-column table row: label(28%) + value spanning 3 cols (72%) */
function labelValueRow4(label, value) {
  return new TableRow({
    children: [
      crCell(28, null, crP({ text: label, bold: true, italics: true })),
      new TableCell({
        width: { size: 72, type: WidthType.PERCENTAGE },
        columnSpan: 3,
        shading: YELLOW,
        verticalAlign: VerticalAlign.CENTER,
        margins: CELL_MARGINS,
        children: [crP({ text: value })]
      })
    ]
  })
}

/** 5-column table row: label(28%) + value spanning 4 cols (72%) */
function labelValueRow5(label, value) {
  return new TableRow({
    children: [
      crCell(28, null, crP({ text: label, bold: true, italics: true })),
      new TableCell({
        width: { size: 72, type: WidthType.PERCENTAGE },
        columnSpan: 4,
        shading: YELLOW,
        verticalAlign: VerticalAlign.CENTER,
        margins: CELL_MARGINS,
        children: [crP({ text: value })]
      })
    ]
  })
}

/** Summary of change row with impact analysis (bold field names on new lines) */
function summaryRow(crData) {
  const summary = crData['Summary of change'] || ''
  const impact = crData['Impact analysis']
  const runs = [new TextRun({ text: summary })]

  if (impact && typeof impact === 'object') {
    const entries = Object.entries(impact).filter(([, v]) => v)
    if (entries.length > 0) {
      runs.push(new TextRun({ text: 'Impact analysis:', bold: true, break: 2 }))
      for (const [key, value] of entries) {
        runs.push(new TextRun({ text: `${key}: `, bold: true, break: 1 }))
        runs.push(new TextRun({ text: value }))
      }
    }
  }

  return new TableRow({
    children: [
      crCell(28, null, crP({ text: 'Summary of change:', bold: true, italics: true })),
      new TableCell({
        width: { size: 72, type: WidthType.PERCENTAGE },
        columnSpan: 3,
        shading: YELLOW,
        verticalAlign: VerticalAlign.CENTER,
        margins: CELL_MARGINS,
        children: [new Paragraph({ style: 'CRCoverPage', children: runs })]
      })
    ]
  })
}

function ynHeaderRow() {
  return new TableRow({
    children: [
      crCell(28, null, crP({ text: '' })),
      crCell(4, YELLOW, crP({ text: 'Y', bold: true }, AlignmentType.CENTER)),
      crCell(4, YELLOW, crP({ text: 'N', bold: true }, AlignmentType.CENTER)),
      new TableCell({
        width: { size: 64, type: WidthType.PERCENTAGE },
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        margins: CELL_MARGINS,
        children: [crP({ text: '' })]
      })
    ]
  })
}

function otherSpecsRow(label, hasAny, subLabel, subLines) {
  return new TableRow({
    children: [
      crCell(28, null, crP({ text: label, bold: true, italics: true })),
      crCell(4, YELLOW, crP({ text: hasAny ? 'X' : '', bold: true }, AlignmentType.CENTER)),
      crCell(4, YELLOW, crP({ text: hasAny ? '' : 'X', bold: true }, AlignmentType.CENTER)),
      crCell(25, null, crP({ text: subLabel })),
      new TableCell({
        width: { size: 39, type: WidthType.PERCENTAGE },
        shading: subLines.length ? YELLOW : LIGHT_YELLOW,
        verticalAlign: VerticalAlign.CENTER,
        margins: CELL_MARGINS,
        children: [multiLineParagraph(subLines, 'TS/TR ... CR ...')]
      })
    ]
  })
}

function otherSpecsSubRow(subLabel, subLines) {
  return new TableRow({
    children: [
      crCell(28, null, crP({ text: '' })),
      crCell(4, YELLOW, crP({ text: subLines.length ? 'X' : '', bold: true }, AlignmentType.CENTER)),
      crCell(4, YELLOW, crP({ text: subLines.length ? '' : 'X', bold: true }, AlignmentType.CENTER)),
      crCell(25, null, crP({ text: subLabel })),
      new TableCell({
        width: { size: 39, type: WidthType.PERCENTAGE },
        shading: subLines.length ? YELLOW : LIGHT_YELLOW,
        verticalAlign: VerticalAlign.CENTER,
        margins: CELL_MARGINS,
        children: [multiLineParagraph(subLines, 'TS/TR ... CR ...')]
      })
    ]
  })
}

// --- Helpers ---

/** Creates a paragraph with multiple lines (one TextRun per line, using break). */
function multiLineParagraph(lines, placeholder) {
  if (!lines.length) return crP({ text: placeholder })
  const runs = lines.map((text, i) =>
    new TextRun({ text, ...(i > 0 && { break: 1 }) })
  )
  return new Paragraph({ style: 'CRCoverPage', children: runs })
}

function crP(opts, alignment) {
  const run = new TextRun({
    text: opts.text,
    ...(opts.bold && { bold: true }),
    ...(opts.italics && { italics: true }),
    ...(opts.size && { size: opts.size })
  })
  return new Paragraph({
    style: 'CRCoverPage',
    ...(alignment && { alignment }),
    children: [run]
  })
}

function crCell(widthPct, shading, paragraph) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    margins: CELL_MARGINS,
    ...(shading && { shading }),
    children: [paragraph]
  })
}

function crCellNB(widthPct, shading, paragraph) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    margins: CELL_MARGINS,
    ...(shading && { shading }),
    children: [paragraph]
  })
}

function checkboxCell(checked) {
  return new TableCell({
    width: { size: 3, type: WidthType.PERCENTAGE },
    shading: YELLOW,
    borders: ALL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    children: [crP({ text: checked ? 'X' : '', bold: true }, AlignmentType.CENTER)]
  })
}

/**
 * Renders CR cover page data to a complete DOCX buffer.
 */
async function packCRCoverPageDocx(crData) {
  const { Document, Packer, SectionType } = require('docx')
  const { docxStyles } = require('./styles/docxStyles')

  const crElements = renderCRCoverPageDOCX(crData)
  const doc = new Document({
    sections: [{
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11907, height: 16840 },
          margin: { top: 1418, right: 1134, bottom: 1134, left: 1134, header: 850, footer: 510 }
        }
      },
      children: crElements
    }],
    styles: docxStyles()
  })
  return Packer.toBuffer(doc)
}

/**
 * Exports a CR JSON file to a standalone DOCX file.
 *
 * @param {string} crJsonPath - Absolute path to the CR JSON file.
 * @param {string} outputPath - Absolute path for the output .docx file.
 * @returns {Promise<void>}
 * @throws {Error} If the CR JSON file is invalid.
 */
async function exportCRCoverPageDocx(crJsonPath, outputPath) {
  const { writeFileSync } = require('fs')
  const { loadCRCoverPageData } = require('../common/crCoverPageLoader')

  const result = loadCRCoverPageData(crJsonPath)
  if (!result.valid) {
    throw new Error(`CR cover page validation failed:\n${result.errors.join('\n')}`)
  }
  const buffer = await packCRCoverPageDocx(result.data)
  writeFileSync(outputPath, buffer)
}

module.exports = {
  renderCRCoverPageDOCX,
  packCRCoverPageDocx,
  exportCRCoverPageDocx
}
