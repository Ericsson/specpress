const fs = require('fs')
const path = require('path')
const {
  Paragraph, TextRun, ImageRun, Tab, SimpleField,
  Header, Footer, PageNumber, PageBreak,
  AlignmentType, TabStopType, TabStopPosition, BorderStyle, SectionType,
  VerticalAlign
} = require('docx')

/**
 * Builds cover page sections for a 3GPP specification document.
 *
 * Returns an array of section objects to prepend before the spec content.
 * Each section has its own page margins, headers, footers, and children.
 *
 * @param {Object} data - Placeholder values (SPEC_NUMBER, VERSION, DATE, DOC_TYPE, TSG, TITLE, RELEASE, KEYWORDS).
 * @param {string} [assetsDir=''] - Directory containing logo images (5gAdvancedLogo.jpg, 3gppLogo.png).
 * @returns {Object[]} Array of section configuration objects for the Document constructor.
 */
function buildCoverSections(data, assetsDir = '') {
  const d = key => (data && data[key]) || ''

  // Load logo images if available
  let logo5g = null
  let logo3gpp = null
  const logo5gPath = assetsDir ? path.join(assetsDir, '5gAdvancedLogo.jpg') : ''
  const logo3gppPath = assetsDir ? path.join(assetsDir, '3gppLogo.png') : ''
  if (logo5gPath && fs.existsSync(logo5gPath)) logo5g = fs.readFileSync(logo5gPath)
  if (logo3gppPath && fs.existsSync(logo3gppPath)) logo3gpp = fs.readFileSync(logo3gppPath)

  // Page width minus margins for section 1 (in twips)
  const coverTextWidth = 11907 - 851 - 851 // pgWidth - left - right = 10205
  const bodyTextWidth = 11907 - 1134 - 1134 // = 9639

  // --- Section 1: Front cover ---
  const coverChildren = []

  // Spec number + version + date (ZA style: right-aligned, bottom border)
  coverChildren.push(new Paragraph({
    style: 'ZA',
    spacing: { after: 40 },
    children: [
      new TextRun({ text: d('SPEC_NUMBER') + ' ', font: 'Arial', size: 64 }),
      new TextRun({ text: d('VERSION') + ' ', font: 'Arial', size: 40 }),
      new TextRun({ text: '(' + d('DATE') + ')', font: 'Arial', size: 32 }),
    ]
  }))

  // Document type (ZB style: right-aligned, italic)
  coverChildren.push(new Paragraph({
    style: 'ZB',
    children: [
      new TextRun({ text: d('DOC_TYPE') }),
    ]
  }))

  // Title block (ZT style: right-aligned, bold, Arial 17pt) — spacing before replaces empty paragraphs
  coverChildren.push(new Paragraph({
    style: 'ZT',
    spacing: { before: 1900 },
    children: [
      new TextRun({ text: '3rd Generation Partnership Project;' }),
    ]
  }))

  coverChildren.push(new Paragraph({
    style: 'ZT',
    children: [
      new TextRun({ text: d('TSG') + ';' }),
    ]
  }))

  coverChildren.push(new Paragraph({
    style: 'ZT',
    children: [
      new TextRun({ text: d('TITLE') }),
    ]
  }))

  coverChildren.push(new Paragraph({
    style: 'ZT',
    children: [
      new TextRun({ text: '(' + d('RELEASE') + ')' }),
    ]
  }))

  // Logos paragraph — left image, tab, right image
  const logoChildren = []
  if (logo5g) {
    logoChildren.push(new ImageRun({ data: logo5g, type: 'jpg', transformation: { width: 130, height: 80 } }))
  }
  logoChildren.push(new TextRun({ children: [new Tab()] }))
  if (logo3gpp) {
    logoChildren.push(new ImageRun({ data: logo3gpp, type: 'png', transformation: { width: 170, height: 100 } }))
  }
  if (logoChildren.length > 1) {
    coverChildren.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: coverTextWidth }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 4 } },
      spacing: { before: 1200, after: 0 },
      children: logoChildren,
    }))
  }

  // Footer 1: Disclaimer
  const disclaimerFooter = new Footer({
    children: [
      new Paragraph({
        style: 'FP',
        spacing: { after: 0, line: 300 },
        children: [
          new TextRun({ text: 'The present document has been developed within the 3rd Generation Partnership Project (3GPP', size: 16 }),
          new TextRun({ text: 'TM', size: 16, superScript: true }),
          new TextRun({ text: ') and may be further elaborated for the purposes of 3GPP.', size: 16 }),
          new TextRun({ text: '', break: 1 }),
          new TextRun({ text: 'The present document has not been subject to any approval process by the 3GPP Organizational Partners and shall not be implemented.', size: 16 }),
          new TextRun({ text: '', break: 1 }),
          new TextRun({ text: 'This ' + d('DOC_TYPE') + ' is provided for future development work within 3GPP only. The Organizational Partners accept no liability for any use of this Specification.', size: 16 }),
          new TextRun({ text: '', break: 1 }),
          new TextRun({ text: 'Specifications and Reports for implementation of the 3GPP', size: 16 }),
          new TextRun({ text: 'TM', size: 16, superScript: true }),
          new TextRun({ text: ' system should be obtained via the 3GPP Organizational Partners\u2019 Publications Offices.', size: 16 }),
        ]
      }),
      new Paragraph({
        style: 'FP',
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1 } },
        spacing: { before: 120, after: 0 },
      }),
    ]
  })

  // --- Section 2: Inner cover (keywords page) ---
  const innerChildren = []

  // "Keywords" label with large spacing above (replaces empty separator paragraphs)
  innerChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1 } },
    spacing: { before: 3600, after: 0 },
    indent: { left: 2835, right: 2835 },
    children: [new TextRun({ text: 'Keywords', font: 'Arial', size: 18 })]
  }))

  // Keywords value
  innerChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    indent: { left: 2835, right: 2835 },
    spacing: { after: 0 },
    children: [new TextRun({ text: d('KEYWORDS'), font: 'Arial', size: 18 })]
  }))

  // Footer 2: Copyright/address (used on inner cover page)
  const copyrightFooter = new Footer({
    children: buildCopyrightFooterParagraphs(d)
  })

  // Header for body pages — tabs at center and right edge of text area
  const headerCenterTab = Math.round(bodyTextWidth / 2)
  const headerRightTab = bodyTextWidth
  const bodyHeader = new Header({
    children: [
      new Paragraph({
        style: 'Header',
        tabStops: [
          { type: TabStopType.CENTER, position: headerCenterTab },
          { type: TabStopType.RIGHT, position: headerRightTab },
        ],
        children: [
          new TextRun({ text: d('RELEASE') }),
          new TextRun({ children: [new Tab()] }),
          new SimpleField('PAGE'),
          new TextRun({ children: [new Tab()] }),
          new TextRun({ text: d('SPEC_NUMBER') + ' ' + d('VERSION') + ' (' + d('DATE') + ')' }),
        ]
      })
    ]
  })

  // Footer 3: Simple "3GPP" footer for body pages
  const simpleFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: '3GPP', font: 'Arial', size: 18, bold: true, italics: true }),
        ]
      })
    ]
  })

  return {
    coverSection: {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11907, height: 16840 },
          margin: { top: 1134, right: 851, bottom: 1134, left: 851, header: 851, footer: 510 },
        },
      },
      headers: {},
      footers: { default: disclaimerFooter },
      children: coverChildren,
    },
    innerCoverSection: {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11907, height: 16840 },
          margin: { top: 1418, right: 1134, bottom: 1134, left: 1134, header: 851, footer: 510 },
        },
      },
      headers: { default: bodyHeader },
      footers: { default: copyrightFooter },
      children: innerChildren,
    },
    bodyHeaderFooter: {
      headers: { default: bodyHeader },
      footers: { default: simpleFooter },
    }
  }
}

/**
 * Builds the copyright/address footer paragraphs for the inner cover page.
 */
function buildCopyrightFooterParagraphs(d) {
  const centered = (text, before = 0) => new Paragraph({
    style: 'FP',
    alignment: AlignmentType.CENTER,
    spacing: { before, after: 0 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 18 })]
  })

  const separator = (label, before = 240) => new Paragraph({
    style: 'FP',
    alignment: AlignmentType.CENTER,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1 } },
    spacing: { before, after: 0 },
    indent: { left: 2835, right: 2835 },
    children: Array.isArray(label) ? label : (label ? [new TextRun({ text: label, size: 20 })] : [])
  })

  return [
    centered([new TextRun({ text: '3GPP', font: 'Arial', bold: true, italics: true, size: 20 })]),

    separator('Postal address'),

    separator('3GPP support office address', 150),
    centered([new TextRun({ text: '650 Route des Lucioles - Sophia Antipolis', font: 'Arial', size: 18 })]),
    centered([new TextRun({ text: 'Valbonne - FRANCE', font: 'Arial', size: 18 })]),
    centered([new TextRun({ text: 'Tel.: +33 4 92 94 42 00 Fax: +33 4 93 65 47 16', font: 'Arial', size: 18 })]),

    separator('Internet'),
    centered([new TextRun({ text: 'http://www.3gpp.org', font: 'Arial', size: 18 })]),

    separator([new TextRun({ text: 'Copyright Notification', font: 'Arial', bold: true, italics: true, size: 20 })], 2400),
    centered([new TextRun({ text: 'No part may be reproduced except as authorized by written permission.', size: 18 })], 200),
    centered([new TextRun({ text: 'The copyright and the foregoing restriction extend to reproduction in all media.', size: 18 })]),
    centered([new TextRun({ text: '\u00A9 ' + (d('DATE').split('-')[0] || '2025') + ', 3GPP Organizational Partners (ARIB, ATIS, CCSA, ETSI, TSDSI, TTA, TTC).', size: 18 })], 200),
    centered([new TextRun({ text: 'All rights reserved.', size: 18 })]),

    new Paragraph({ style: 'FP', spacing: { before: 400, after: 0 }, children: [
      new TextRun({ text: 'UMTS\u2122 is a Trade Mark of ETSI registered for the benefit of its members', size: 18 }),
      new TextRun({ text: '', break: 1 }),
      new TextRun({ text: '3GPP\u2122 is a Trade Mark of ETSI registered for the benefit of its Members and of the 3GPP Organizational Partners', size: 18 }),
      new TextRun({ text: '', break: 1 }),
      new TextRun({ text: 'LTE\u2122 is a Trade Mark of ETSI registered for the benefit of its Members and of the 3GPP Organizational Partners', size: 18 }),
      new TextRun({ text: '', break: 1 }),
      new TextRun({ text: 'GSM\u00AE and the GSM logo are registered and owned by the GSM Association', size: 18 }),
    ]})
  ]
}

module.exports = { buildCoverSections }
