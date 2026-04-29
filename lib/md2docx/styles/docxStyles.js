const { HeadingLevel, AlignmentType, TabStopType, TabStopPosition, BorderStyle, UnderlineType } = require('docx')

/**
 * 3GPP DOCX style definitions.
 *
 * All paragraph and character styles used in the DOCX output are defined here,
 * making them reusable, testable, and potentially user-configurable.
 */

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
]

/** @returns {Object[]} Array of paragraph style definitions for the Document constructor. */
function paragraphStyles() {
  return [
    {
      id: 'Normal', name: 'Normal',
      run: { font: 'Times New Roman', size: 20 },
      paragraph: { alignment: AlignmentType.JUSTIFIED, spacing: { after: 180, line: 240, lineRule: 'auto' } }
    },
    {
      id: 'Heading1', name: 'Heading 1', basedOn: 'Normal',
      run: { font: 'Arial', size: 36 },
      paragraph: { alignment: AlignmentType.LEFT, indent: { left: 1200, hanging: 1200 }, spacing: { before: 240, after: 180 }, keepNext: true, pageBreakBefore: true }
    },
    {
      id: 'Heading2', name: 'Heading 2', basedOn: 'Heading1',
      run: { font: 'Arial', size: 32 },
      paragraph: { indent: { left: 1200, hanging: 1200 }, spacing: { before: 200, after: 120 }, keepNext: true }
    },
    {
      id: 'Heading3', name: 'Heading 3', basedOn: 'Heading2',
      run: { font: 'Arial', size: 28 },
      paragraph: { indent: { left: 1200, hanging: 1200 }, spacing: { before: 180, after: 120 }, keepNext: true }
    },
    {
      id: 'Heading4', name: 'Heading 4', basedOn: 'Heading3',
      run: { font: 'Arial', size: 24 },
      paragraph: { indent: { left: 1200, hanging: 1200 }, spacing: { before: 150, after: 120 }, keepNext: true }
    },
    {
      id: 'Heading5', name: 'Heading 5', basedOn: 'Heading4',
      run: { font: 'Arial', size: 20 },
      paragraph: { indent: { left: 1200, hanging: 1200 }, spacing: { before: 120, after: 100 }, keepNext: true }
    },
    {
      id: 'Heading6', name: 'Heading 6', basedOn: 'Heading5',
      run: { font: 'Arial', size: 18 },
      paragraph: { indent: { left: 1200, hanging: 1200 }, spacing: { before: 120, after: 100 }, keepNext: true }
    },
    {
      id: 'Heading8', name: 'Heading 8', basedOn: 'Normal',
      run: { font: 'Arial', size: 36 },
      paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 240, after: 180 }, keepNext: true }
    },
    {
      id: 'Heading9', name: 'Heading 9', basedOn: 'Normal',
      run: { font: 'Arial', size: 36 },
      paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 240, after: 180 }, keepNext: true }
    },
    {
      id: 'TH', name: 'TH', basedOn: 'Normal',
      run: { bold: true, font: 'Arial', size: 20 },
      paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 60 }, keepNext: true }
    },
    {
      id: 'TF', name: 'TF', basedOn: 'TH',
      paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 360 } }
    },
    {
      id: 'EN', name: 'EN', basedOn: 'Normal',
      run: { color: 'FF0000' },
      paragraph: { indent: { left: 1400, hanging: 1400 }, tabStops: [{ type: TabStopType.LEFT, position: 1400 }] }
    },
    {
      id: 'NO', name: 'NO', basedOn: 'Normal',
      paragraph: { indent: { left: 900, hanging: 900 }, keepLines: true, tabStops: [{ type: TabStopType.LEFT, position: 900 }] }
    },
    {
      id: 'EQ', name: 'EQ',
      paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 120, after: 120 } }
    },
    {
      id: 'EX', name: 'EX', basedOn: 'Normal',
      paragraph: { indent: { left: 1300, hanging: 1300 }, tabStops: [{ type: TabStopType.LEFT, position: 1300 }] }
    },
    {
      id: 'TAL', name: 'TAL', basedOn: 'Normal',
      run: { font: 'Arial', size: 18 },
      paragraph: { alignment: AlignmentType.LEFT, indent: { left: 60, right: 60 }, spacing: { before: 60, after: 60, lineRule: 'auto' } }
    },
    {
      id: 'TAR', name: 'TAR', basedOn: 'TAL',
      paragraph: { alignment: AlignmentType.RIGHT }
    },
    {
      id: 'TAC', name: 'TAC', basedOn: 'TAL',
      paragraph: { alignment: AlignmentType.CENTER }
    },
    {
      id: 'TAH', name: 'TAH', basedOn: 'TAL',
      run: { bold: true }
    },
    {
      id: 'TAN', name: 'TAN', basedOn: 'TAL',
      paragraph: { indent: { left: 900, hanging: 840, right: 60 }, tabStops: [{ type: TabStopType.LEFT, position: 900 }], spacing: { before: 60, after: 60, lineRule: 'auto' } }
    },
    {
      id: 'PL', name: 'PL', basedOn: 'Normal',
      run: { font: 'Courier New', size: 16, color: 'D9D9D9', noProof: true },
      paragraph: { alignment: AlignmentType.LEFT, spacing: { after: 0, line: 240, lineRule: 'auto' }, shading: { fill: '000000' } }
    },
    {
      id: 'FP', name: 'FP', basedOn: 'Normal',
      paragraph: { alignment: AlignmentType.LEFT, spacing: { after: 0, line: 240, lineRule: 'auto' } }
    },
    {
      id: 'Header', name: 'Header', basedOn: 'Normal',
      run: { font: 'Arial', size: 18, bold: true },
      paragraph: { alignment: AlignmentType.LEFT, spacing: { after: 0 } }
    },
    {
      id: 'ZA', name: 'ZA', basedOn: 'Normal',
      run: { font: 'Arial', size: 40 },
      paragraph: {
        alignment: AlignmentType.RIGHT,
        spacing: { after: 40, line: 240, lineRule: 'auto' },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 1 } }
      }
    },
    {
      id: 'ZB', name: 'ZB', basedOn: 'Normal',
      run: { font: 'Arial', size: 20, italics: true },
      paragraph: { alignment: AlignmentType.RIGHT, spacing: { after: 0 } }
    },
    {
      id: 'ZT', name: 'ZT', basedOn: 'Normal',
      run: { font: 'Arial', size: 34, bold: true },
      paragraph: { alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 280, lineRule: 'auto' } }
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `B${i + 1}`, name: `B${i + 1}`, basedOn: 'Normal',
      paragraph: {
        indent: { left: (i + 1) * 283, hanging: 283 },
        spacing: { after: 120, line: 240, lineRule: 'auto' }
      }
    })),
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `TOC${i + 1}`, name: `toc ${i + 1}`, basedOn: 'Normal',
      paragraph: {
        indent: { left: 700 + (i * 200), hanging: 700 + (i * 200) },
        spacing: { after: 0, before: i === 0 ? 120 : 0 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: 'dot' }]
      }
    }))
  ]
}

/** @returns {Object[]} Array of character style definitions for the Document constructor. */
function characterStyles() {
  return [
    {
      id: 'Hyperlink', name: 'Hyperlink',
      run: {
        color: '0563C1',
        underline: { type: UnderlineType.SINGLE }
      }
    }
  ]
}

/**
 * Returns the complete styles object for the Document constructor.
 * @returns {Object} Styles configuration with paragraphStyles and characterStyles.
 */
function docxStyles() {
  return {
    paragraphStyles: paragraphStyles(),
    characterStyles: characterStyles()
  }
}

module.exports = { HEADING_LEVELS, paragraphStyles, characterStyles, docxStyles }
