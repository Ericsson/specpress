/**
 * Exports a CR cover page JSON file directly to DOCX and opens it in MS Word.
 *
 * Usage:
 *   node scripts/export-cr-docx.js [path-to-CRxxxx.json]
 *
 * If no path is given, uses the example spec's CRxxxx.json.
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { Document, Packer, SectionType } = require('docx')
const { renderCRCoverPageDOCX } = require('../lib/md2docx/crCoverPageRenderer')
const { docxStyles } = require('../lib/md2docx/styles/docxStyles')

const defaultCR = path.resolve(__dirname, '..', '..', '..', '3gpp', 'FS_6Gspecs_new',
  'ericsson_multifiletypes_onem2m_example', 'specification', 'history', 'CRxxxx.json')

const crPath = process.argv[2] || defaultCR

if (!fs.existsSync(crPath)) {
  console.error(`CR file not found: ${crPath}`)
  process.exit(1)
}

const crData = JSON.parse(fs.readFileSync(crPath, 'utf8'))
const elements = renderCRCoverPageDOCX(crData)

const doc = new Document({
  sections: [{
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: { width: 11907, height: 16840 },
        margin: { top: 1418, right: 1134, bottom: 1134, left: 1134 }
      }
    },
    children: elements
  }],
  styles: docxStyles()
})

const outPath = path.join(require('os').tmpdir(), `CR_cover_${Date.now()}.docx`)

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf)
  console.log(`Written: ${outPath} (${buf.length} bytes)`)
  try {
    execSync(`start "" "${outPath}"`, { stdio: 'ignore', shell: true })
  } catch (e) {
    console.log('Could not open in Word automatically.')
  }
})
