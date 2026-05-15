const assert = require('assert')
const { buildFrontPageHtml } = require('../../../lib/md2html/frontPage')

const SAMPLE_DATA = {
  SPEC_NUMBER: '3GPP TR 67.123',
  VERSION: 'V1.0.0',
  DATE: '2026-03',
  TSG: 'Technical Specification Group Radio Access Network',
  TITLE: 'Specification Modernization Example',
  DOC_TYPE: 'Technical Report',
  RELEASE: 'Release 20',
  KEYWORDS: 'GSM, UMTS, LTE, 5G, methodology'
}

console.log('buildFrontPageHtml')

// placeholder substitution
;(() => {
  const html = buildFrontPageHtml(SAMPLE_DATA)
  assert(html.includes('3GPP TR 67.123'), 'contains spec number')
  console.log('  \x1b[32m✓\x1b[0m substitutes SPEC_NUMBER')
})()

;(() => {
  const html = buildFrontPageHtml(SAMPLE_DATA)
  assert(html.includes('V1.0.0'), 'contains version')
  console.log('  \x1b[32m✓\x1b[0m substitutes VERSION')
})()

;(() => {
  const html = buildFrontPageHtml(SAMPLE_DATA)
  assert(html.includes('2026-03'), 'contains date')
  console.log('  \x1b[32m✓\x1b[0m substitutes DATE')
})()

;(() => {
  const html = buildFrontPageHtml(SAMPLE_DATA)
  assert(html.includes('Technical Report'), 'contains doc type')
  console.log('  \x1b[32m✓\x1b[0m substitutes DOC_TYPE')
})()

;(() => {
  const html = buildFrontPageHtml(SAMPLE_DATA)
  assert(html.includes('Release 20'), 'contains release')
  console.log('  \x1b[32m✓\x1b[0m substitutes RELEASE')
})()

;(() => {
  const html = buildFrontPageHtml(SAMPLE_DATA)
  assert(html.includes('GSM, UMTS, LTE, 5G, methodology'), 'contains keywords')
  console.log('  \x1b[32m✓\x1b[0m substitutes KEYWORDS')
})()

// YEAR derivation
;(() => {
  const html = buildFrontPageHtml(SAMPLE_DATA)
  assert(html.includes('2026'), 'derives year from DATE')
  console.log('  \x1b[32m✓\x1b[0m derives YEAR from DATE')
})()

;(() => {
  const html = buildFrontPageHtml({ ...SAMPLE_DATA, YEAR: '2099' })
  assert(html.includes('2099'), 'uses explicit YEAR')
  console.log('  \x1b[32m✓\x1b[0m uses explicit YEAR when provided')
})()

// image embedding
;(() => {
  const html = buildFrontPageHtml(SAMPLE_DATA)
  const imgMatch = html.match(/src="(data:image\/[^"]+)"/)
  assert(imgMatch, 'has data URI for logo')
  assert(imgMatch[1].startsWith('data:image/'), 'logo is embedded as base64 data URI')
  console.log('  \x1b[32m✓\x1b[0m embeds logo images as base64 data URIs')
})()

// structure
;(() => {
  const html = buildFrontPageHtml(SAMPLE_DATA)
  assert(html.includes('class="cover-page"'), 'has cover-page wrapper')
  assert(html.includes('page-break-after'), 'has page break between pages')
  assert(html.includes('Copyright Notification'), 'has copyright section')
  console.log('  \x1b[32m✓\x1b[0m produces correct HTML structure')
})()

// empty/null data
;(() => {
  const html = buildFrontPageHtml({})
  assert(html.includes('class="cover-page"'), 'still produces HTML with empty data')
  console.log('  \x1b[32m✓\x1b[0m works with empty data object')
})()

;(() => {
  const html = buildFrontPageHtml(null)
  assert(html === '', 'returns empty string for null data')
  console.log('  \x1b[32m✓\x1b[0m works with null data')
})()

console.log('\n12 passed, 0 failed')
