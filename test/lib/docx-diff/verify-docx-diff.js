/**
 * Automated test for multi-version DOCX DIFF
 * 
 * This script validates that a generated DOCX file contains the expected
 * tracked changes with the correct author attribution.
 * 
 * Usage: node test/fixtures/verify-docx-diff.js [outputFile]
 * 
 * Default: test/fixtures/output.docx
 */

const fs = require('fs')
const path = require('path')
const { EXPECTED_CHANGES, extractDocumentXml, parseTrackedChanges, validateChanges } = require('./verify-docx-diff-lib')

/**
 * Main test function
 */
function runTest(docxPath) {
  console.log('=== DOCX DIFF Verification Test ===')
  console.log(`Testing: ${docxPath}\n`)

  try {
    // Extract and parse XML
    console.log('Extracting document.xml...')
    const xml = extractDocumentXml(docxPath)
    console.log('✓ Extracted successfully')

    // Parse tracked changes
    console.log('\nParsing tracked changes...')
    const trackedChanges = parseTrackedChanges(xml)
    console.log(`✓ Found ${trackedChanges.insertions.length} insertions and ${trackedChanges.deletions.length} deletions`)

    // Validate changes
    console.log('\n=== Validating Tracked Changes ===\n')
    
    // Group by author for validation display
    const changesByAuthor = {}
    
    trackedChanges.insertions.forEach(change => {
      if (!changesByAuthor[change.author]) {
        changesByAuthor[change.author] = { insertions: [], deletions: [] }
      }
      changesByAuthor[change.author].insertions.push(change.text)
    })
    
    trackedChanges.deletions.forEach(change => {
      if (!changesByAuthor[change.author]) {
        changesByAuthor[change.author] = { insertions: [], deletions: [] }
      }
      changesByAuthor[change.author].deletions.push(change.text)
    })

    // Validate each author
    const results = { passed: 0, failed: 0, errors: [] }
    
    for (const [author, expected] of Object.entries(EXPECTED_CHANGES)) {
      console.log(`\n--- ${author} ---`)
      
      const actual = changesByAuthor[author]
      
      if (!actual) {
        console.error(`  ✗ No changes found for ${author}`)
        results.failed++
        results.errors.push(`No changes found for ${author}`)
        continue
      }

      console.log(`  Insertions: ${actual.insertions.length} found`)
      let insertionMatches = 0
      
      for (const expectedText of expected.insertions) {
        const found = actual.insertions.some(actualText => {
          const lowerActual = actualText.toLowerCase()
          const lowerExpected = expectedText.toLowerCase()
          return lowerActual.includes(lowerExpected) || lowerExpected.includes(lowerActual)
        })
        
        if (found) {
          insertionMatches++
        } else {
          console.log(`    ✗ Missing insertion: "${expectedText}"`)
          results.errors.push(`${author}: Missing insertion "${expectedText}"`)
        }
      }
      
      console.log(`    ${insertionMatches}/${expected.insertions.length} expected insertions found`)
      
      console.log(`  Deletions: ${actual.deletions.length} found`)
      let deletionMatches = 0
      
      for (const expectedText of expected.deletions) {
        const found = actual.deletions.some(actualText => 
          actualText.includes(expectedText) || expectedText.includes(actualText)
        )
        
        if (found) {
          deletionMatches++
        } else {
          console.log(`    ✗ Missing deletion: "${expectedText}"`)
          results.errors.push(`${author}: Missing deletion "${expectedText}"`)
        }
      }
      
      console.log(`    ${deletionMatches}/${expected.deletions.length} expected deletions found`)
      
      const totalExpected = expected.insertions.length + expected.deletions.length
      const totalFound = insertionMatches + deletionMatches
      
      if (totalFound === totalExpected) {
        console.log(`  ✓ All expected changes found`)
        results.passed++
      } else if (totalFound >= totalExpected * 0.8) {
        console.log(`  ⚠ Most changes found (${totalFound}/${totalExpected})`)
        results.passed++
      } else {
        console.log(`  ✗ Too many missing changes (${totalFound}/${totalExpected})`)
        results.failed++
      }
    }

    // Generate summary
    console.log('\n\n=== Summary Report ===\n')
    
    const sortedAuthors = Object.keys(changesByAuthor).sort()
    console.log('Tracked Changes Found:')
    for (const author of sortedAuthors) {
      const counts = changesByAuthor[author]
      const insertions = trackedChanges.insertions.filter(c => c.author === author).length
      const deletions = trackedChanges.deletions.filter(c => c.author === author).length
      console.log(`  ${author}: ${insertions} insertions, ${deletions} deletions`)
    }

    console.log('\nValidation Results:')
    console.log(`  Passed: ${results.passed}/${Object.keys(EXPECTED_CHANGES).length} authors`)
    console.log(`  Failed: ${results.failed}/${Object.keys(EXPECTED_CHANGES).length} authors`)

    if (results.errors.length > 0) {
      console.log('\nErrors:')
      results.errors.forEach(error => console.log(`  - ${error}`))
    }

    const success = results.failed === 0
    console.log(`\n${success ? '✓' : '✗'} Overall: ${success ? 'PASSED' : 'FAILED'}`)
    
    process.exit(success ? 0 : 1)

  } catch (error) {
    console.error('\n✗ Test failed with error:')
    console.error(error.message)
    process.exit(1)
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const defaultPath = path.join(__dirname, 'output.docx')
const docxPath = args[0] || defaultPath

// Run the test
runTest(docxPath)
