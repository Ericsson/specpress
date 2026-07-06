/**
 * End-to-end test for DOCX DIFF via mergeDocxVersions with LibreOffice backend.
 *
 * This script:
 * 1. Generates 2 DOCX files from markdown sources (test-v1.md, test-v2.md)
 * 2. Calls mergeDocxVersions (LibreOffice backend) to produce tracked changes
 * 3. Validates the output contains expected tracked changes with correct author
 *
 * Auto-skips when LibreOffice is not installed.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { mergeDocxVersions, detectBackends } = require('../../../lib/common/docxMerge')

const backends = detectBackends()
if (!backends.libreoffice) {
  console.log('SKIPPED: LibreOffice DOCX DIFF e2e test requires LibreOffice (soffice) installed')
  process.exit(0)
}

const testDir = path.join(os.tmpdir(), 'specpress-libre-diff-test-' + Date.now())
const AUTHOR = 'LibreOffice_Author'

// Expected changes for v1 → v2 transition (subset of EXPECTED_CHANGES.Author_v2)
const EXPECTED_INSERTIONS = [
  'in 5G networks',
  'Radio Resource Control',
  'Cell',
  'Service Data Adaptation Protocol',
  'Path Loss',
  'T319',
  'Power control range',
  'with establishment cause',
  'Connection Release',
  'NEA3',
  'Integrity Protection',
  'NIA1',
  'NIA2'
]

const EXPECTED_DELETIONS = []

console.log('=== DOCX DIFF LibreOffice End-to-End Test ===\n')
console.log(`Working directory: ${testDir}\n`)

fs.mkdirSync(testDir, { recursive: true })

async function runE2ETest() {
  try {
    // Step 1: Generate DOCX files from markdown
    console.log('Step 1: Generating DOCX files from markdown sources...')

    const fixturesDir = __dirname
    const { MarkdownToDocxConverter } = require('../../../lib/md2docx/md2docx')

    const docxFiles = []
    for (const version of ['v1', 'v2']) {
      const mdPath = path.join(fixturesDir, `test-${version}.md`)
      const docxPath = path.join(testDir, `test-${version}.docx`)

      process.stdout.write(`  Converting test-${version}.md... `)
      const converter = new MarkdownToDocxConverter(
        null, null, null, null, { updateFields: false }
      )
      await converter.convert(mdPath, docxPath, fixturesDir, null, {})
      docxFiles.push(docxPath)
      console.log('\u2713')
    }

    console.log(`  Generated ${docxFiles.length} DOCX files\n`)

    // Step 2: Merge using LibreOffice backend
    console.log('Step 2: Merging via mergeDocxVersions (LibreOffice backend)...')

    const outputPath = path.join(testDir, 'output.docx')
    await mergeDocxVersions(docxFiles[0], [
      { docxPath: docxFiles[1], authorName: AUTHOR }
    ], outputPath, {
      backend: 'libreoffice',
      onProgress: (msg) => console.log(`  ${msg}`)
    })

    console.log('  \u2713 Merge completed successfully\n')

    // Step 3: Validate tracked changes
    console.log('Step 3: Validating tracked changes in output.docx...')

    const { extractDocumentXml, parseTrackedChanges } = require('./verify-docx-diff-lib')
    const xml = extractDocumentXml(outputPath)
    const trackedChanges = parseTrackedChanges(xml)

    console.log(`  Found ${trackedChanges.insertions.length} insertions and ${trackedChanges.deletions.length} deletions\n`)

    // Group by author
    const authorInsertions = trackedChanges.insertions
      .filter(c => c.author.includes(AUTHOR))
      .map(c => c.text)
    const authorDeletions = trackedChanges.deletions
      .filter(c => c.author.includes(AUTHOR))
      .map(c => c.text)

    console.log(`  ${AUTHOR}: ${authorInsertions.length} insertions, ${authorDeletions.length} deletions\n`)

    // Validate expected insertions
    let insertionMatches = 0
    const missingInsertions = []

    for (const expected of EXPECTED_INSERTIONS) {
      const found = authorInsertions.some(actual => {
        const lowerActual = actual.toLowerCase()
        const lowerExpected = expected.toLowerCase()
        return lowerActual.includes(lowerExpected) || lowerExpected.includes(lowerActual)
      })
      if (found) {
        insertionMatches++
      } else {
        missingInsertions.push(expected)
      }
    }

    // Validate expected deletions
    let deletionMatches = 0
    const missingDeletions = []

    for (const expected of EXPECTED_DELETIONS) {
      const found = authorDeletions.some(actual =>
        actual.includes(expected) || expected.includes(actual)
      )
      if (found) {
        deletionMatches++
      } else {
        missingDeletions.push(expected)
      }
    }

    // Print results
    console.log('=== Test Results ===\n')

    const totalExpected = EXPECTED_INSERTIONS.length + EXPECTED_DELETIONS.length
    const totalFound = insertionMatches + deletionMatches
    const matchRate = totalExpected > 0 ? totalFound / totalExpected : 1

    console.log(`  Insertions: ${insertionMatches}/${EXPECTED_INSERTIONS.length} matched`)
    console.log(`  Deletions: ${deletionMatches}/${EXPECTED_DELETIONS.length} matched`)
    console.log(`  Match rate: ${(matchRate * 100).toFixed(0)}%`)

    if (missingInsertions.length > 0) {
      console.log(`\n  Missing insertions:`)
      missingInsertions.forEach(t => console.log(`    - "${t}"`))
    }
    if (missingDeletions.length > 0) {
      console.log(`\n  Missing deletions:`)
      missingDeletions.forEach(t => console.log(`    - "${t}"`))
    }

    // Pass if at least 80% of expected changes are found (same threshold as Word test)
    const success = matchRate >= 0.8 && authorInsertions.length > 0
    console.log(`\n  Validation: ${success ? 'PASSED' : 'FAILED'} (threshold: 80%)`)
    console.log(`\n${success ? '\u2713' : '\u2717'} Overall: ${success ? 'PASSED' : 'FAILED'}`)

    if (!success && authorInsertions.length === 0) {
      console.log('  ERROR: No insertions attributed to the expected author')
    }

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
