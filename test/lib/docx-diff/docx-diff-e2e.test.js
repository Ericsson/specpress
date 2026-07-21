/**
 * End-to-end test for multi-version DOCX DIFF via mergeDocxVersions API.
 *
 * This script:
 * 1. Generates DOCX files from markdown sources in %TEMP%
 * 2. Calls mergeDocxVersions (Word backend) to merge them with tracked changes
 * 3. Validates the output contains expected changes with correct authors
 *
 * Auto-skips when Word is not installed.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { mergeDocxVersions, detectBackends } = require('../../../lib/common/docxMerge')

const backends = detectBackends()
if (!backends.word) {
  console.log('SKIPPED: DOCX DIFF e2e test requires Windows with Microsoft Word installed')
  process.exit(0)
}

const tempDir = os.tmpdir()
const testDir = path.join(tempDir, 'specpress-docx-diff-test-' + Date.now())

console.log('=== DOCX DIFF End-to-End Test ===\n')
console.log(`Working directory: ${testDir}\n`)

fs.mkdirSync(testDir, { recursive: true })

async function runE2ETest() {
  try {
    // Step 1: Generate DOCX files from markdown
    console.log('Step 1: Generating DOCX files from markdown sources...')

    const fixturesDir = __dirname
    const { Md2Docx } = require('../../../lib/md2docx/md2docx')

    const versions = ['v1', 'v2', 'v3', 'v4']
    const docxFiles = []

    for (const version of versions) {
      const mdPath = path.join(fixturesDir, `test-${version}.md`)
      const docxPath = path.join(testDir, `test-${version}.docx`)

      if (!fs.existsSync(mdPath)) {
        throw new Error(`Markdown source not found: ${mdPath}`)
      }

      process.stdout.write(`  Converting test-${version}.md... `)

      const converter = new Md2Docx({ updateFields: false })
      const md = fs.readFileSync(mdPath, 'utf8')
      await converter.convert(md, docxPath, fixturesDir, null, {})
      docxFiles.push(docxPath)
      console.log('\u2713')
    }

    console.log(`  Generated ${docxFiles.length} DOCX files\n`)

    // Step 2: Merge using mergeDocxVersions API
    console.log('Step 2: Merging versions via mergeDocxVersions (Word backend)...')

    const outputPath = path.join(testDir, 'output.docx')
    const baseDocx = docxFiles[0]
    const revisions = [
      { docxPath: docxFiles[1], authorName: 'Author_v2' },
      { docxPath: docxFiles[2], authorName: 'Author_v3' },
      { docxPath: docxFiles[3], authorName: 'Author_v4' }
    ]

    await mergeDocxVersions(baseDocx, revisions, outputPath, {
      backend: 'word',
      onProgress: (msg) => console.log(`  ${msg}`)
    })

    console.log('  \u2713 Merge completed successfully\n')

    // Step 3: Validate the output
    console.log('Step 3: Validating tracked changes in output.docx...')

    const { extractDocumentXml, parseTrackedChanges, validateChanges, EXPECTED_CHANGES } = require('./verify-docx-diff-lib')

    const xml = extractDocumentXml(outputPath)
    const trackedChanges = parseTrackedChanges(xml)

    console.log(`  Found ${trackedChanges.insertions.length} insertions and ${trackedChanges.deletions.length} deletions\n`)

    const validationResults = validateChanges(trackedChanges)

    // Print summary
    console.log('\n=== Test Results ===\n')

    const changesByAuthor = {}
    trackedChanges.insertions.forEach(change => {
      if (!changesByAuthor[change.author]) changesByAuthor[change.author] = { insertions: 0, deletions: 0 }
      changesByAuthor[change.author].insertions++
    })
    trackedChanges.deletions.forEach(change => {
      if (!changesByAuthor[change.author]) changesByAuthor[change.author] = { insertions: 0, deletions: 0 }
      changesByAuthor[change.author].deletions++
    })

    for (const author of Object.keys(changesByAuthor).sort()) {
      const counts = changesByAuthor[author]
      console.log(`  ${author}: ${counts.insertions} insertions, ${counts.deletions} deletions`)
    }

    console.log(`\n  Validation: ${validationResults.passed}/${Object.keys(EXPECTED_CHANGES).length} authors passed`)

    if (validationResults.errors.length > 0) {
      console.log('\n  Errors:')
      validationResults.errors.forEach(error => console.log(`    - ${error}`))
    }

    const success = validationResults.failed === 0
    console.log(`\n${success ? '\u2713' : '\u2717'} Overall: ${success ? 'PASSED' : 'FAILED'}`)

    // Cleanup
    console.log(`\nCleaning up temp directory: ${testDir}`)
    fs.rmSync(testDir, { recursive: true, force: true })

    process.exit(success ? 0 : 1)

  } catch (error) {
    console.error(`\n\u2717 Test failed: ${error.message}`)
    console.error(error.stack)
    try { fs.rmSync(testDir, { recursive: true, force: true }) } catch (e) {}
    process.exit(1)
  }
}

runE2ETest().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
