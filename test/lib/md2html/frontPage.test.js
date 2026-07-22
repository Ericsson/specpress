const { test, describe } = require('node:test')
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

describe('buildFrontPageHtml', () => {
  test('substitutes SPEC_NUMBER', () => {
    assert.ok(buildFrontPageHtml(SAMPLE_DATA).includes('3GPP TR 67.123'))
  })

  test('substitutes VERSION', () => {
    assert.ok(buildFrontPageHtml(SAMPLE_DATA).includes('V1.0.0'))
  })

  test('substitutes DATE', () => {
    assert.ok(buildFrontPageHtml(SAMPLE_DATA).includes('2026-03'))
  })

  test('substitutes DOC_TYPE', () => {
    assert.ok(buildFrontPageHtml(SAMPLE_DATA).includes('Technical Report'))
  })

  test('substitutes RELEASE', () => {
    assert.ok(buildFrontPageHtml(SAMPLE_DATA).includes('Release 20'))
  })

  test('substitutes KEYWORDS', () => {
    assert.ok(buildFrontPageHtml(SAMPLE_DATA).includes('GSM, UMTS, LTE, 5G, methodology'))
  })

  test('derives YEAR from DATE', () => {
    assert.ok(buildFrontPageHtml(SAMPLE_DATA).includes('2026'))
  })

  test('uses explicit YEAR when provided', () => {
    assert.ok(buildFrontPageHtml({ ...SAMPLE_DATA, YEAR: '2099' }).includes('2099'))
  })

  test('embeds logo images as base64 data URIs', () => {
    const imgMatch = buildFrontPageHtml(SAMPLE_DATA).match(/src="(data:image\/[^"]+)"/)
    assert.ok(imgMatch)
    assert.ok(imgMatch[1].startsWith('data:image/'))
  })

  test('produces correct HTML structure', () => {
    const html = buildFrontPageHtml(SAMPLE_DATA)
    assert.ok(html.includes('class="cover-page"'))
    assert.ok(html.includes('page-break-after'))
    assert.ok(html.includes('Copyright Notification'))
  })

  test('works with empty data object', () => {
    assert.ok(buildFrontPageHtml({}).includes('class="cover-page"'))
  })

  test('works with null data', () => {
    assert.strictEqual(buildFrontPageHtml(null), '')
  })
})
