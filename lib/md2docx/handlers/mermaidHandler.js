const { execSync } = require('child_process')
const { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const https = require('https')
const { createHash } = require('crypto')

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'
const MERMAID_FILENAME = 'mermaid.min.js'
const MERMAID_TIMESTAMP = 'mermaid.timestamp'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const SVG_CACHE_DIR = 'cached'

/**
 * Returns the absolute path to the SVG cache directory for a given spec root.
 * The cache is placed as a sibling of the spec root folder.
 *
 * e.g. specRoot = "/repo/spec" → "/repo/cached"
 *
 * @param {string} specRoot - Absolute path to the specification root.
 * @returns {string} Absolute path to the cache directory.
 */
function svgCacheDir(specRoot) {
  return join(require('path').dirname(specRoot), SVG_CACHE_DIR)
}

/** Regex to extract mermaid fence content from markdown files. */
const MERMAID_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/g

const BROWSER_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

let browserPath = null

/**
 * Finds the first available Chromium-based browser on the system.
 * @returns {string|null} Absolute path to the browser executable, or null.
 */
function findBrowser() {
  if (browserPath !== null) return browserPath
  browserPath = BROWSER_PATHS.find(p => existsSync(p)) || null
  return browserPath
}

const DEFAULT_MERMAID_CONFIG = join(__dirname, '../../css/mermaid-config.json')

/**
 * Loads the mermaid config, falling back to css/mermaid-config.json.
 * @param {string} [mermaidConfig] - Explicit config JSON string.
 * @returns {string} Config JSON string.
 */
function resolveConfig(mermaidConfig) {
  if (mermaidConfig) return mermaidConfig
  try { return readFileSync(DEFAULT_MERMAID_CONFIG, 'utf8') } catch (e) { return '{}' }
}

/**
 * Renders multiple mermaid diagrams to SVG in a single headless browser
 * invocation. Each diagram is rendered sequentially inside the page and
 * wrapped in a container div with a known id so the SVGs can be extracted
 * from the serialised DOM.
 *
 * @param {string[]} codes - Array of mermaid diagram source strings.
 * @param {string} [mermaidConfig] - Mermaid init config JSON string.
 * @returns {(string|null)[]} Array of SVG strings (null for failed diagrams).
 */
function renderMermaidBatch(codes, mermaidConfig) {
  if (!codes || codes.length === 0) return []
  const browser = findBrowser()
  if (!browser) return codes.map(() => null)

  const config = resolveConfig(mermaidConfig)

  const html = `<!DOCTYPE html>
<html><head><script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
mermaid.initialize(Object.assign({ startOnLoad: false }, ${config}));
const codes = ${JSON.stringify(codes)};
for (let i = 0; i < codes.length; i++) {
  const container = document.createElement('div');
  container.id = 'mermaid-out-' + i;
  try {
    const { svg } = await mermaid.render('diagram-' + i, codes[i]);
    container.innerHTML = svg;
  } catch(e) {
    container.innerHTML = '<error>' + e.message + '</error>';
  }
  document.body.appendChild(container);
}
</script></head><body></body></html>`

  const tempHtml = join(tmpdir(), `temp_mermaid_${Date.now()}.html`)
  writeFileSync(tempHtml, html)
  try {
    const result = execSync(
      `"${browser}" --headless=new --disable-gpu --dump-dom --virtual-time-budget=30000 --no-sandbox "file:///${tempHtml.replace(/\\/g, '/')}"`,
      { timeout: 60000, maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const dom = result.toString('utf8')
    return codes.map((_, i) => {
      const re = new RegExp(`<div id="mermaid-out-${i}">([\\s\\S]*?)</div>(?=<div id="mermaid-out-|</body>)`)
      const m = dom.match(re)
      if (!m) return null
      const inner = m[1]
      const svgMatch = inner.match(/<svg[\s\S]*?<\/svg>/)
      return svgMatch ? svgMatch[0] : null
    })
  } catch (e) {
    return codes.map(() => null)
  } finally {
    try { unlinkSync(tempHtml) } catch (e) {}
  }
}

/**
 * Downloads a file from a URL to a local path.
 *
 * @param {string} url - URL to download.
 * @param {string} dest - Absolute path to write the file.
 * @returns {Promise<void>}
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(dest)
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        return downloadFile(res.headers.location, dest).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', (e) => { file.close(); reject(e) })
  })
}

/**
 * Ensures a local copy of mermaid.min.js exists in the extension's global
 * storage directory. Downloads from CDN on first use and re-downloads if
 * the cached copy is older than 24 hours.
 *
 * @param {string} storageDir - Absolute path to the extension's global storage directory.
 * @returns {Promise<string>} Absolute path to the cached mermaid.min.js file.
 */
async function ensureMermaidBundle(storageDir) {
  if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true })
  const bundlePath = join(storageDir, MERMAID_FILENAME)
  const tsPath = join(storageDir, MERMAID_TIMESTAMP)

  let needsDownload = !existsSync(bundlePath)
  if (!needsDownload && existsSync(tsPath)) {
    try {
      const ts = parseInt(readFileSync(tsPath, 'utf8'), 10)
      if (Date.now() - ts > CACHE_TTL_MS) needsDownload = true
    } catch (e) { needsDownload = true }
  }

  if (needsDownload) {
    try {
      await downloadFile(MERMAID_CDN, bundlePath)
      writeFileSync(tsPath, String(Date.now()))
    } catch (e) {
      if (!existsSync(bundlePath)) throw new Error('Mermaid bundle not available and download failed: ' + e.message)
      // Stale cache is better than no cache — keep using it
    }
  }
  return bundlePath
}

/**
 * Renders multiple mermaid diagrams to SVG using a hidden VS Code webview.
 *
 * Creates a temporary hidden webview panel, loads mermaid from a local
 * cached bundle, renders all diagrams, collects the SVGs via postMessage,
 * then disposes the panel.
 *
 * @param {Object} vscode - The vscode module.
 * @param {string[]} codes - Array of mermaid diagram source strings.
 * @param {string} [mermaidConfig='{}'] - Mermaid init config JSON string.
 * @param {string} mermaidBundlePath - Absolute path to the cached mermaid.min.js.
 * @returns {Promise<(string|null)[]>} Array of SVG strings (null for failed diagrams).
 */
function renderMermaidViaWebview(vscode, codes, mermaidConfig, mermaidBundlePath) {
  if (!codes || codes.length === 0) return Promise.resolve([])
  const config = mermaidConfig || '{}'

  return new Promise((resolve) => {
    const previousEditor = vscode.window.activeTextEditor
    const localRoot = vscode.Uri.file(require('path').dirname(mermaidBundlePath))
    const panel = vscode.window.createWebviewPanel(
      'specpressMermaid', 'Mermaid Render',
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [localRoot] }
    )
    // Immediately restore focus to the previous editor so the panel stays in background
    if (previousEditor) {
      vscode.window.showTextDocument(previousEditor.document, previousEditor.viewColumn, false)
    }
    const mermaidUri = panel.webview.asWebviewUri(vscode.Uri.file(mermaidBundlePath))
    panel.webview.html = `<!DOCTYPE html>
<html><head>
<script src="${mermaidUri}"></script>
</head><body>
<script>
const vscodeApi = acquireVsCodeApi();
mermaid.initialize(Object.assign({ startOnLoad: false }, ${config}));
async function run() {
  const codes = ${JSON.stringify(codes)};
  const results = [];
  for (let i = 0; i < codes.length; i++) {
    const el = document.createElement('div');
    el.id = 'mermaid-render-' + i;
    document.body.appendChild(el);
    try {
      const { svg } = await mermaid.render('diagram-' + i, codes[i], el);
      results.push(svg);
    } catch(e) {
      results.push(null);
    }
  }
  vscodeApi.postMessage({ type: 'mermaidResults', results });
}
run();
</script>
</body></html>`

    const timeout = setTimeout(() => {
      panel.dispose()
      resolve(codes.map(() => null))
    }, 30000)

    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'mermaidResults') {
        clearTimeout(timeout)
        panel.dispose()
        resolve(msg.results)
      }
    })

    panel.onDidDispose(() => clearTimeout(timeout))
  })
}

/**
 * Computes a SHA-256 hash key for a mermaid diagram + config combination.
 *
 * @param {string} code - Mermaid diagram source.
 * @param {string} config - Mermaid config JSON string.
 * @returns {string} Hex hash string.
 */
function svgCacheKey(code, config) {
  return createHash('sha256').update(code + '\0' + config).digest('hex')
}

/**
 * Scans all markdown files under specRoot for mermaid fences and returns
 * the set of cache keys (hashes) that are currently in use.
 *
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {string} config - Mermaid config JSON string.
 * @returns {Set<string>} Set of hex hash strings for all live mermaid diagrams.
 */
function collectMermaidHashes(specRoot, config) {
  const hashes = new Set()
  const walk = (dir) => {
    for (const item of require('fs').readdirSync(dir)) {
      const full = join(dir, item)
      if (require('fs').statSync(full).isDirectory()) {
        if (item === 'node_modules' || item === '.git') continue
        walk(full)
      } else if (/\.md$/i.test(item)) {
        const content = readFileSync(full, 'utf8')
        let m
        MERMAID_FENCE_RE.lastIndex = 0
        while ((m = MERMAID_FENCE_RE.exec(content)) !== null) {
          hashes.add(svgCacheKey(m[1].replace(/\r\n/g, '\n').trim(), config))
        }
      }
    }
  }
  walk(specRoot)
  return hashes
}

/**
 * Removes cached SVG files that are no longer referenced by any mermaid
 * fence in the spec root.
 *
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {string} config - Mermaid config JSON string.
 */
function cleanupMermaidCache(specRoot, config) {
  const cacheDir = svgCacheDir(specRoot)
  if (!existsSync(cacheDir)) return
  const liveHashes = collectMermaidHashes(specRoot, config)
  for (const file of require('fs').readdirSync(cacheDir)) {
    if (!file.endsWith('.svg')) continue
    const hash = file.slice(0, -4)
    if (!liveHashes.has(hash)) {
      try { unlinkSync(join(cacheDir, file)) } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Renders mermaid diagrams with SVG caching in the spec root's
 * assets/cached/ directory. Only uncached diagrams are rendered via
 * renderFn. After rendering, cleans up stale cached SVGs.
 *
 * @param {string[]} codes - Array of mermaid diagram source strings.
 * @param {string} config - Mermaid config JSON string.
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {Function} renderFn - Async function `(codes) => svgs[]` for uncached diagrams.
 * @returns {Promise<(string|null)[]>} Array of SVG strings.
 */
async function renderWithCache(codes, config, specRoot, renderFn) {
  if (!codes || codes.length === 0) return []
  const cacheDir = svgCacheDir(specRoot)
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })

  const results = new Array(codes.length)
  const uncached = []

  for (let i = 0; i < codes.length; i++) {
    const key = svgCacheKey(codes[i], config)
    const cachePath = join(cacheDir, key + '.svg')
    if (existsSync(cachePath)) {
      results[i] = readFileSync(cachePath, 'utf8')
    } else {
      uncached.push({ idx: i, code: codes[i], key })
    }
  }

  if (uncached.length > 0) {
    const rendered = await renderFn(uncached.map(u => u.code))
    for (let j = 0; j < uncached.length; j++) {
      const svg = rendered[j]
      results[uncached[j].idx] = svg
      if (svg) {
        writeFileSync(join(cacheDir, uncached[j].key + '.svg'), svg)
      }
    }
  }

  cleanupMermaidCache(specRoot, config)
  return results
}

/**
 * Renders a single mermaid diagram to SVG. Convenience wrapper around
 * renderMermaidBatch for backward compatibility.
 *
 * @param {string} code - Mermaid diagram source code.
 * @param {string} [mermaidConfig] - Mermaid init config JSON string.
 * @returns {string|null} SVG string, or null if rendering failed.
 */
function renderMermaidToSvg(code, mermaidConfig) {
  return renderMermaidBatch([code], mermaidConfig)[0]
}

/**
 * Extracts width and height from an SVG string via its viewBox attribute.
 *
 * @param {string} svg - SVG string.
 * @returns {{ width: number, height: number }}
 */
function getSvgDimensions(svg) {
  let width = 604, height = 400
  const vb = svg.match(/viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/)
  if (vb) {
    width = parseFloat(vb[1])
    height = parseFloat(vb[2])
  }
  const maxWidth = 604
  if (width > maxWidth) {
    height = height * (maxWidth / width)
    width = maxWidth
  }
  return { width: Math.round(width), height: Math.round(height) }
}

module.exports = { renderMermaidToSvg, renderMermaidBatch, renderMermaidViaWebview, renderWithCache, cleanupMermaidCache, ensureMermaidBundle, getSvgDimensions, findBrowser }
