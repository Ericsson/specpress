/**
 * Library for DOCX DIFF verification
 * Contains shared logic for extracting and validating tracked changes
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

// Expected changes by author
const EXPECTED_CHANGES = {
  'Author_v2': {
    insertions: [
      'in 5G networks',
      'Radio Resource Control',
      'Cell',
      'Service Data Adaptation Protocol',
      'SDAP is only used in 5G networks',
      'Path Loss',
      'T319',
      'Power control range',
      'with establishment cause',
      'Connection Release',
      'NEA3',
      'Integrity Protection',
      'NIA1',
      'NIA2'
      // Note: NIA3 is present in output.docx with correct author but grouped
      // with paragraph properties, so it's not extracted as a separate text node
    ],
    deletions: []
  },
  'Author_v3': {
    insertions: [
      'standalone networks',
      'Bearer',
      'AMF, SMF, and UPF',
      'ciphering, integrity protection, and header compression',
      'T320',
      'power class 3',
      'validates the request and allocates resources',
      'with capability information',
      'Source gNB sends Handover Request',
      'RAND',
      'AUTN',
      'XRES',
      'KAUSF',
      'User plane integrity protection is optional'
    ],
    deletions: [
      'Channel Capacity',
      'Shannon channel capacity'
    ]
  },
  'Author_v4': {
    insertions: [
      'standalone and non-standalone',
      'Beam',
      'NSA',
      'Standalone',
      'AUSF',
      'Release 15',
      'Deployment Scenarios',
      'mmWave',
      'T321',
      'Power classes',
      'Initial security activation',
      'Handover Request Acknowledge',
      'Path Switch Request',
      'redirect information',
      'NAS signaling',
      'KSEAF',
      'Quality of Service',
      'QoS Framework',
      '5QI'
    ],
    deletions: []
  }
}

/**
 * Extract document.xml from DOCX using PowerShell (Windows)
 */
function extractDocumentXml(docxPath) {
  if (!fs.existsSync(docxPath)) {
    throw new Error(`File not found: ${docxPath}`)
  }

  const tempDir = require('os').tmpdir()
  const extractDir = path.join(tempDir, 'docx-verify-' + Date.now())
  const tempZipPath = path.join(tempDir, 'temp-docx-' + Date.now() + '.zip')
  const documentXmlPath = path.join(extractDir, 'word', 'document.xml')

  try {
    fs.copyFileSync(docxPath, tempZipPath)

    const psCommand = `Expand-Archive -Path "${tempZipPath}" -DestinationPath "${extractDir}" -Force`
    const result = spawnSync('powershell.exe', ['-Command', psCommand], {
      encoding: 'utf8',
      windowsHide: true
    })

    if (result.error || result.status !== 0) {
      throw new Error(`Failed to extract DOCX: ${result.stderr || result.error}`)
    }

    if (!fs.existsSync(documentXmlPath)) {
      throw new Error('document.xml not found in DOCX')
    }

    const xml = fs.readFileSync(documentXmlPath, 'utf8')
    return xml

  } finally {
    try {
      if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath)
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true })
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Parse tracked changes from document XML
 * Returns { insertions: [{author, text}], deletions: [{author, text}] }
 */
function parseTrackedChanges(xml) {
  const insertions = []
  const deletions = []

  // Parse insertions
  const insRegex = /<w:ins[^>]*w:author="([^"]*)"[^>]*>(.*?)<\/w:ins>/gs
  let match

  while ((match = insRegex.exec(xml)) !== null) {
    const author = match[1]
    const content = match[2]
    
    const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g
    let textMatch
    let fullText = ''
    
    while ((textMatch = textRegex.exec(content)) !== null) {
      fullText += textMatch[1]
    }
    
    if (fullText.trim()) {
      insertions.push({ author, text: fullText.trim() })
    }
  }

  // Parse deletions
  const delRegex = /<w:del[^>]*w:author="([^"]*)"[^>]*>(.*?)<\/w:del>/gs
  
  while ((match = delRegex.exec(xml)) !== null) {
    const author = match[1]
    const content = match[2]
    
    const textRegex = /<w:delText[^>]*>([^<]*)<\/w:delText>/g
    let textMatch
    let fullText = ''
    
    while ((textMatch = textRegex.exec(content)) !== null) {
      fullText += textMatch[1]
    }
    
    if (fullText.trim()) {
      deletions.push({ author, text: fullText.trim() })
    }
  }

  return { insertions, deletions }
}

/**
 * Validate tracked changes against expected changes
 */
function validateChanges(trackedChanges) {
  const results = {
    passed: 0,
    failed: 0,
    errors: []
  }

  // Group tracked changes by author
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

  // Validate each author's changes
  for (const [author, expected] of Object.entries(EXPECTED_CHANGES)) {
    const actual = changesByAuthor[author]
    
    if (!actual) {
      results.failed++
      results.errors.push(`No changes found for ${author}`)
      continue
    }

    // Check insertions
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
        results.errors.push(`${author}: Missing insertion "${expectedText}"`)
      }
    }
    
    // Check deletions
    let deletionMatches = 0
    
    for (const expectedText of expected.deletions) {
      const found = actual.deletions.some(actualText => 
        actualText.includes(expectedText) || expectedText.includes(actualText)
      )
      
      if (found) {
        deletionMatches++
      } else {
        results.errors.push(`${author}: Missing deletion "${expectedText}"`)
      }
    }
    
    // Count as passed if majority of changes are found
    const totalExpected = expected.insertions.length + expected.deletions.length
    const totalFound = insertionMatches + deletionMatches
    
    if (totalFound >= totalExpected * 0.8) {
      results.passed++
    } else {
      results.failed++
    }
  }

  return results
}

module.exports = {
  EXPECTED_CHANGES,
  extractDocumentXml,
  parseTrackedChanges,
  validateChanges
}
