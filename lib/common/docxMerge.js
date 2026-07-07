const fs = require('fs')
const path = require('path')
const { execFileSync, spawn } = require('child_process')

/**
 * Detects the path to winword.exe via the Windows registry.
 * @returns {string|null} Path if found, null otherwise.
 */
function findWinword() {
  if (process.platform !== 'win32') return null
  try {
    const result = execFileSync(
      'reg', ['query', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Winword.exe', '/ve'],
      { encoding: 'utf8', windowsHide: true }
    )
    const match = result.match(/REG_SZ\s+(.+)/)
    const p = match ? match[1].trim() : null
    return (p && fs.existsSync(p)) ? p : null
  } catch (e) {
    return null
  }
}

const LIBREOFFICE_PATHS = [
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/local/bin/soffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
]

/**
 * Detects the path to LibreOffice's soffice executable.
 * @returns {string|null} Path if found, null otherwise.
 */
function findLibreOffice() {
  return LIBREOFFICE_PATHS.find(p => fs.existsSync(p)) || null
}

/**
 * Detects available merge backends on the current system.
 * @returns {{word: string|null, libreoffice: string|null}}
 */
function detectBackends() {
  return {
    word: findWinword(),
    libreoffice: findLibreOffice()
  }
}

/**
 * Merges a baseline DOCX with one or more revisions into a tracked-changes document
 * using Microsoft Word via VBScript.
 *
 * @param {string} baseDocx - Path to the baseline DOCX.
 * @param {Array<{docxPath: string, authorName: string}>} revisions - Ordered revisions.
 * @param {string} outputPath - Where to save the final merged DOCX.
 * @param {object} [options]
 * @param {boolean} [options.debug=false] - Keep intermediate temp files.
 * @param {function} [options.onProgress] - Progress callback.
 * @returns {Promise<void>}
 */
function mergeViaWord(baseDocx, revisions, outputPath, options = {}) {
  const vbsPath = path.join(__dirname, '..', 'scripts', 'merge-multi-version.vbs')
  const vbsArgs = ['//nologo', vbsPath, outputPath, baseDocx]
  for (const rev of revisions) {
    vbsArgs.push(rev.docxPath)
    vbsArgs.push(rev.authorName)
  }
  if (options.debug) vbsArgs.push('debug')

  return new Promise((resolve, reject) => {
    const proc = spawn('cscript', vbsArgs, { windowsHide: true })
    let output = ''
    let errorOutput = ''

    proc.stdout.on('data', (data) => {
      const text = data.toString().trim()
      output += text + '\n'
      if (options.onProgress && text.includes('Comparing')) {
        options.onProgress(text)
      }
    })

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(errorOutput || output || `VBScript exited with code ${code}`))
      } else if (!output.includes('Success')) {
        reject(new Error(output || 'Word comparison failed'))
      } else {
        resolve()
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start VBScript: ${err.message}`))
    })

    setTimeout(() => {
      proc.kill()
      reject(new Error('Word comparison timed out after 5 minutes'))
    }, 300000)
  })
}

/**
 * Resolves the path to LibreOffice's bundled Python interpreter.
 * @param {string} sofficePath - Path to the soffice executable.
 * @returns {string|null}
 */
function findLibreOfficePython(sofficePath) {
  const programDir = path.dirname(sofficePath)
  const candidates = process.platform === 'win32'
    ? [path.join(programDir, 'python.exe')]
    : [path.join(programDir, 'python'), '/usr/bin/python3']
  return candidates.find(p => fs.existsSync(p)) || null
}

/**
 * Merges a baseline DOCX with one revision into a tracked-changes document
 * using LibreOffice via a Python-UNO script.
 *
 * @param {string} baseDocx - Path to the baseline DOCX.
 * @param {Array<{docxPath: string, authorName: string}>} revisions - Currently supports 1 revision.
 * @param {string} outputPath - Where to save the final merged DOCX.
 * @param {object} [options]
 * @param {string} [options.libreofficePath] - Explicit path to soffice.
 * @param {function} [options.onProgress] - Progress callback.
 * @returns {Promise<void>}
 */
function mergeViaLibreOffice(baseDocx, revisions, outputPath, options = {}) {
  if (revisions.length > 1) {
    return Promise.reject(new Error('LibreOffice backend currently supports only 1 revision'))
  }

  const soffice = options.libreofficePath || findLibreOffice()
  if (!soffice) {
    return Promise.reject(new Error('LibreOffice (soffice) not found'))
  }

  const scriptPath = path.join(__dirname, '..', 'scripts', 'merge_tracked_changes.py')
  if (!fs.existsSync(scriptPath)) {
    return Promise.reject(new Error('LibreOffice merge script not found: ' + scriptPath))
  }

  const rev = revisions[0]
  if (options.onProgress) options.onProgress('Starting LibreOffice comparison...')

  // Always invoke via soffice so that a full LibreOffice instance is running
  // and the UNO component context (ConfigurationProvider, Desktop, etc.) is available.
  const cmd = soffice
  const args = ['--headless', '--invisible', '--python', scriptPath,
    baseDocx, rev.docxPath, outputPath, rev.authorName]
  const env = process.env

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true, env })
    let output = ''
    let errorOutput = ''

    proc.stdout.on('data', (data) => { output += data.toString() })
    proc.stderr.on('data', (data) => { errorOutput += data.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(errorOutput || output || `LibreOffice exited with code ${code}`))
      } else if (!output.includes('Success')) {
        reject(new Error(output || errorOutput || 'LibreOffice comparison produced no output'))
      } else {
        resolve()
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start LibreOffice: ${err.message}`))
    })

    setTimeout(() => {
      proc.kill()
      reject(new Error('LibreOffice comparison timed out after 5 minutes'))
    }, 300000)
  })
}

/**
 * Merges a baseline DOCX with one or more revisions into a tracked-changes document.
 *
 * @param {string} baseDocx - Path to the baseline DOCX (the "original" version).
 * @param {Array<{docxPath: string, authorName: string}>} revisions
 *   Ordered array of revisions. Each entry introduces tracked changes attributed
 *   to the given author. MS Word supports N revisions; LibreOffice supports 1 initially.
 * @param {string} outputPath - Where to save the final merged DOCX.
 * @param {object} [options]
 * @param {'auto'|'word'|'libreoffice'} [options.backend='auto'] - Merge backend.
 * @param {string} [options.wordPath] - Explicit path to winword.exe.
 * @param {string} [options.libreofficePath] - Explicit path to soffice executable.
 * @param {boolean} [options.debug=false] - Keep intermediate temp files.
 * @param {function} [options.onProgress] - Progress callback: (message: string) => void.
 * @returns {Promise<void>}
 */
async function mergeDocxVersions(baseDocx, revisions, outputPath, options = {}) {
  if (!revisions || revisions.length === 0) {
    throw new Error('At least one revision is required')
  }

  const backend = options.backend || 'auto'

  if (backend === 'word') {
    const wordPath = options.wordPath || findWinword()
    if (!wordPath) throw new Error('Microsoft Word (winword.exe) not found')
    return mergeViaWord(baseDocx, revisions, outputPath, options)
  }

  if (backend === 'libreoffice') {
    return mergeViaLibreOffice(baseDocx, revisions, outputPath, options)
  }

  // auto: try Word first on Windows, then LibreOffice
  if (process.platform === 'win32' && findWinword()) {
    return mergeViaWord(baseDocx, revisions, outputPath, options)
  }

  if (findLibreOffice()) {
    return mergeViaLibreOffice(baseDocx, revisions, outputPath, options)
  }

  throw new Error('No merge backend available. Install Microsoft Word (Windows) or LibreOffice.')
}

module.exports = { mergeDocxVersions, detectBackends, findWinword, findLibreOffice, findLibreOfficePython }
