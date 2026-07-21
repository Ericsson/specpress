/**
 * Generate DOCX test fixtures from markdown files
 * 
 * Usage: node test/fixtures/generate-docx.js
 * 
 * This script converts the test-v1.md through test-v4.md files into DOCX format
 * for use in end-to-end DOCX DIFF testing.
 */

const fs = require('fs')
const path = require('path')
const { MarkdownToDocxConverter } = require('../../../lib/md2docx/md2docx')

const fixturesDir = __dirname
const versions = ['v1', 'v2', 'v3', 'v4']

async function generateDocx() {
  console.log('Generating DOCX test fixtures...\n')

  for (const version of versions) {
    const mdPath = path.join(fixturesDir, `test-${version}.md`)
    const docxPath = path.join(fixturesDir, `test-${version}.docx`)

    if (!fs.existsSync(mdPath)) {
      console.error(`Error: ${mdPath} not found`)
      continue
    }

    console.log(`Converting test-${version}.md -> test-${version}.docx...`)

    try {
      const converter = new MarkdownToDocxConverter({
        specRootPath: null,
        updateFields: false
      })

      const md = fs.readFileSync(mdPath, 'utf8')
      await converter.convert(md, docxPath, fixturesDir, null, {})
      console.log(`  ✓ Created ${docxPath}`)
    } catch (e) {
      console.error(`  ✗ Failed: ${e.message}`)
    }
  }

  console.log('\nDOCX fixtures generated successfully!')
  console.log('\nTo test multi-version DOCX DIFF with these files:')
  console.log('  node scripts/test-docx-diff.js <repoPath> <commit1> <commit2> <commit3> <commit4>')
  console.log('\nOr manually test the VBScript:')
  console.log('  cscript scripts/merge-multi-version.vbs output.docx test-v1.docx test-v2.docx "Author_v2" test-v3.docx "Author_v3" test-v4.docx "Author_v4"')
}

generateDocx().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
