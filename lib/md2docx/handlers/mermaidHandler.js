const { execSync } = require('child_process')
const { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const https = require('https')
const {
  svgCacheDir, cacheKey, findExecutable, getSvgDimensions,
  collectDiagramHashes, cleanupCacheFiles, renderCached, renderCachedAsync
} = require('../../common/diagramCache')

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'
const MERMAID_FILENAME = 'mermaid.min.js'
const MERMAID_TIMESTAMP = 'mermaid.timestamp'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Regex to extract mermaid fence content from markdown files. */
const MERMAID_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/g

const BROWSER_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

let browserPathCached = null

/**
 * Finds the first available Chromium-based browser on the system.
 * @returns {string|null} Absolute path to the browser executable, or null.
 */
function findBrowser() {
  if (browserPathCached !== null) return browserPathCached
  browserPathCached = findExecutable(['CHROME_BIN', 'CHROMIUM_BIN'], BROWSER_PATHS)
  return browserPathCached
}

const DEFAULT_MERMAID_CONFIG = join(__dirname, '../../css/mermaid-config.json')

function resolveConfig(mermaidConfig) {
  if (mermaidConfig) return mermaidConfig
  try { return readFileSync(DEFAULT_MERMAID_CONFIG, 'utf8') } catch (e) { return '{}' }
}

/**
 * Renders multiple mermaid diagrams to SVG + PNG in a single headless browser
 * invocation.
 *
 * @param {string[]} codes - Array of mermaid diagram source strings.
 * @param {string} [mermaidConfig] - Mermaid init config JSON string.
 * @returns {{ svg: string|null, png: Buffer|null }[]} Array of result objects.
 */
function renderMermaidBatch(codes, mermaidConfig) {
  if (!codes || codes.length === 0) return []
  const browser = findBrowser()
  if (!browser) return codes.map(() => ({ svg: null, png: null }))

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
    const svgEl = container.querySelector('svg');
    const vb = svgEl && svgEl.getAttribute('viewBox');
    const parts = vb ? vb.split(' ') : [];
    const w = Math.round(parseFloat(parts[2]) || 604);
    const h = Math.round(parseFloat(parts[3]) || 400);
    const canvas = document.createElement('canvas');
    canvas.width = w * 2; canvas.height = h * 2;
    const ctx2d = canvas.getContext('2d');
    ctx2d.scale(2, 2);
    const img = new Image();
    await new Promise(res => {
      img.onload = () => { ctx2d.drawImage(img, 0, 0, w, h); res(); };
      img.onerror = res;
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    });
    const pngDiv = document.createElement('div');
    pngDiv.id = 'mermaid-png-' + i;
    pngDiv.textContent = canvas.toDataURL('image/png').split(',')[1];
    document.body.appendChild(pngDiv);
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
      const re = new RegExp(`<div id="mermaid-out-${i}">([\\s\\S]*?)</div>(?=<div id="mermaid-|</body>)`)
      const m = dom.match(re)
      const inner = m ? m[1] : null
      const svgMatch = inner && inner.match(/<svg[\s\S]*?<\/svg>/)
      const svg = svgMatch ? svgMatch[0] : null
      const pngRe = new RegExp(`<div id="mermaid-png-${i}">([A-Za-z0-9+/=]+)</div>`)
      const pngM = dom.match(pngRe)
      const png = pngM ? Buffer.from(pngM[1], 'base64') : null
      return { svg, png }
    })
  } catch (e) {
    return codes.map(() => ({ svg: null, png: null }))
  } finally {
    try { unlinkSync(tempHtml) } catch (e) {}
  }
}

/**
 * Downloads a file from a URL to a local path.
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
 * Ensures a local copy of mermaid.min.js exists with 24h TTL caching.
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
    }
  }
  return bundlePath
}

/**
 * Renders mermaid diagrams via a VS Code webview panel.
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
      const svgEl = el.querySelector('svg');
      const vb = svgEl && svgEl.getAttribute('viewBox');
      const parts = vb ? vb.split(' ') : [];
      const w = Math.round(parseFloat(parts[2]) || 604);
      const h = Math.round(parseFloat(parts[3]) || 400);
      const canvas = document.createElement('canvas');
      canvas.width = w * 2; canvas.height = h * 2;
      const ctx2d = canvas.getContext('2d');
      ctx2d.scale(2, 2);
      const img = new Image();
      await new Promise(res => {
        img.onload = () => { ctx2d.drawImage(img, 0, 0, w, h); res(); };
        img.onerror = res;
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      });
      results.push({ svg, png: canvas.toDataURL('image/png').split(',')[1] });
    } catch(e) {
      results.push({ svg: null, png: null });
    }
  }
  vscodeApi.postMessage({ type: 'mermaidResults', results });
}
run();
</script>
</body></html>`

    const timeout = setTimeout(() => {
      panel.dispose()
      resolve(codes.map(() => ({ svg: null, png: null })))
    }, 30000)

    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'mermaidResults') {
        clearTimeout(timeout)
        panel.dispose()
        resolve(msg.results.map(r => r && typeof r === 'object' ? { svg: r.svg, png: r.png ? Buffer.from(r.png, 'base64') : null } : { svg: null, png: null }))
      }
    })

    panel.onDidDispose(() => clearTimeout(timeout))
  })
}

// ---------------------------------------------------------------------------
// Mermaid-specific cache wrappers
// ---------------------------------------------------------------------------

/**
 * Removes cached mermaid SVG/PNG files that are no longer referenced.
 *
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {string} config - Mermaid config JSON string.
 */
function cleanupMermaidCache(specRoot, config) {
  const liveHashes = collectDiagramHashes(
    specRoot, MERMAID_FENCE_RE,
    (raw) => raw, // mermaid has no preamble transform
    config
  )
  cleanupCacheFiles(specRoot, '', ['.svg', '.png'], liveHashes)
}

/**
 * Renders mermaid diagrams with SVG + PNG caching (synchronous).
 * Cached results are read from disk. Uncached diagrams are rendered via
 * renderFn and both SVG and PNG are stored in the cache.
 *
 * @param {string[]} codes - Mermaid diagram source codes.
 * @param {string} config - Mermaid config JSON string.
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {function} [renderFn] - Render function (default: renderMermaidBatch).
 * @returns {{svg: string|null, png: Buffer|null}[]} Array of results.
 */
function renderMermaidCached(codes, config, specRoot, renderFn) {
  return renderCached({
    codes,
    config,
    specRoot,
    prefix: '',
    cachePng: true,
    renderFn: renderFn || ((c) => renderMermaidBatch(c, config))
  })
}

/**
 * Async version — renders mermaid diagrams with SVG + PNG caching.
 * Supports async renderFn (e.g. webview-based rendering in VS Code).
 *
 * @param {string[]} codes - Mermaid diagram source codes.
 * @param {string} config - Mermaid config JSON string.
 * @param {string} specRoot - Absolute path to the specification root.
 * @param {function} renderFn - Async render function `(codes) => {svg, png}[]`.
 * @returns {Promise<{svg: string|null, png: Buffer|null}[]>}
 */
async function renderWithCache(codes, config, specRoot, renderFn) {
  return renderCachedAsync({
    codes,
    config,
    specRoot,
    prefix: '',
    cachePng: true,
    renderFn,
    cleanupFn: specRoot ? () => cleanupMermaidCache(specRoot, config) : null
  })
}

/**
 * Convenience: render a single mermaid diagram to SVG.
 */
function renderMermaidToSvg(code, mermaidConfig) {
  return renderMermaidBatch([code], mermaidConfig)[0].svg
}

module.exports = {
  renderMermaidToSvg,
  renderMermaidBatch,
  renderMermaidCached,
  renderMermaidViaWebview,
  renderWithCache,
  cleanupMermaidCache,
  ensureMermaidBundle,
  getSvgDimensions,
  findBrowser,
  MERMAID_FENCE_RE
}
