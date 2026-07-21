/**
 * Mermaid batch renderer — headless browser rendering and bundle management.
 *
 * This module is VS Code-free and runs in plain Node.js (CLI, CI, tests).
 * VS Code-specific rendering (renderMermaidViaWebview) lives in SpecPressExt.
 */
const { execFileSync } = require('child_process')
const { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const https = require('https')
const { findExecutable } = require('./diagramCache')

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'
const MERMAID_FILENAME = 'mermaid.min.js'
const MERMAID_TIMESTAMP = 'mermaid.timestamp'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

const DEFAULT_MERMAID_CONFIG_PATH = join(__dirname, '../css/mermaid-config.json')

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
 * @returns {string|null}
 */
function findBrowser() {
  if (browserPathCached !== null) return browserPathCached
  browserPathCached = findExecutable(['CHROME_BIN', 'CHROMIUM_BIN'], BROWSER_PATHS)
  return browserPathCached
}

function resolveConfig(mermaidConfig) {
  if (mermaidConfig) return mermaidConfig
  try { return readFileSync(DEFAULT_MERMAID_CONFIG_PATH, 'utf8') } catch (e) { return '{}' }
}

/**
 * Builds the browser-side JavaScript that renders mermaid diagrams and
 * returns results as a JSON array of {svg, png} objects.
 *
 * Used by both renderMermaidBatch (headless browser via fetch POST) and
 * renderMermaidViaWebview in SpecPressExt (VS Code webview via postMessage).
 * The caller is responsible for replacing PORT (headless) or wiring up the
 * result transport (webview).
 *
 * @param {string[]} codes - Mermaid source strings.
 * @param {string} config - Mermaid init config JSON string.
 * @returns {string} JavaScript module source (ES module, uses top-level await).
 */
function buildMermaidPageScript(codes, config) {
  return [
    `import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';`,
    `mermaid.initialize(Object.assign({startOnLoad:false},${config}));`,
    `const codes=${JSON.stringify(codes)};`,
    `const results=[];`,
    `for(let i=0;i<codes.length;i++){`,
    `  try{`,
    `    const{svg}=await mermaid.render('d'+i,codes[i]);`,
    `    const el=document.createElement('div');el.innerHTML=svg;`,
    `    const vb=el.querySelector('svg')&&el.querySelector('svg').getAttribute('viewBox');`,
    `    const p=vb?vb.split(' '):[];`,
    `    const w=Math.round(parseFloat(p[2])||604),h=Math.round(parseFloat(p[3])||400);`,
    `    const cv=document.createElement('canvas');cv.width=w*2;cv.height=h*2;`,
    `    const ctx=cv.getContext('2d');ctx.scale(2,2);`,
    `    const img=new Image();`,
    `    await new Promise(r=>{img.onload=()=>{ctx.drawImage(img,0,0,w,h);r()};img.onerror=r;`,
    `      img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));});`,
    `    results.push({svg,png:cv.toDataURL('image/png').split(',')[1]});`,
    `  }catch(e){results.push({svg:null,png:null})}`,
    `}`,
  ].join('\n')
}

/**
 * Renders multiple mermaid diagrams to SVG + PNG in a single headless browser
 * invocation.
 *
 * @param {string[]} codes - Array of mermaid diagram source strings.
 * @param {string} [mermaidConfig] - Mermaid init config JSON string.
 * @returns {{ svg: string|null, png: Buffer|null }[]}
 */
function renderMermaidBatch(codes, mermaidConfig) {
  if (!codes || codes.length === 0) return []
  const browser = findBrowser()
  if (!browser) return codes.map(() => ({ svg: null, png: null }))

  const config = resolveConfig(mermaidConfig)
  const tag = Date.now() + '_' + Math.random().toString(36).slice(2)
  const outFile = join(tmpdir(), `mermaid_out_${tag}.json`)
  const pidFile = join(tmpdir(), `mermaid_pid_${tag}.txt`)
  const helperFile = join(tmpdir(), `mermaid_helper_${tag}.cjs`)

  const pageScript = buildMermaidPageScript(codes, config) +
    `\nawait fetch('http://127.0.0.1:PORT/result',{method:'POST',body:JSON.stringify(results)});`

  const helperLines = [
    `const http=require('http'),{spawn,spawnSync}=require('child_process'),fs=require('fs')`,
    `const browser=${JSON.stringify(browser)}`,
    `const outFile=${JSON.stringify(outFile)}`,
    `const pageScript=${JSON.stringify(pageScript)}`,
    `function killTree(pid){try{if(process.platform==='win32'){spawnSync('taskkill',['/F','/T','/PID',String(pid)])}else{process.kill(-pid,'SIGKILL')}}catch(e){}}`,
    `const pidFile=${JSON.stringify(pidFile)}`,
    `let proc=null`,
    `const server=http.createServer((req,res)=>{`,
    `  if(req.method==='GET'&&req.url==='/'){`,
    `    const port=server.address().port`,
    `    const html='<!DOCTYPE html><html><head><script type=\"module\">'+pageScript.replace('PORT',port)+'<\\/script></head><body></body></html>'`,
    `    res.writeHead(200,{'Content-Type':'text/html'});res.end(html)`,
    `  }else if(req.method==='POST'&&req.url==='/result'){`,
    `    const c=[];req.on('data',d=>c.push(d));req.on('end',()=>{`,
    `      fs.writeFileSync(outFile,Buffer.concat(c));res.writeHead(200);res.end('ok');server.close()`,
    `    })`,
    `  }else{res.writeHead(404);res.end()}`,
    `})`,
    `server.listen(0,'127.0.0.1',()=>{`,
    `  const port=server.address().port`,
    `  proc=spawn(browser,['--headless=new','--disable-gpu','--no-sandbox','http://127.0.0.1:'+port+'/'],{detached:process.platform!=='win32'})`,
    `  fs.writeFileSync(pidFile,String(proc.pid))`,
    `  const deadline=setTimeout(()=>{killTree(proc.pid);server.close();process.exit(1)},55000)`,
    `  server.on('close',()=>{clearTimeout(deadline);killTree(proc.pid);process.exit(0)})`,
    `})`,
  ].join('\n')

  writeFileSync(helperFile, helperLines)
  let results = null
  try {
    execFileSync(process.execPath, [helperFile], { timeout: 60000, maxBuffer: 1024 * 1024 })
    if (existsSync(outFile)) {
      try {
        const parsed = JSON.parse(readFileSync(outFile, 'utf8'))
        results = parsed.map(r => ({
          svg: r && r.svg ? r.svg : null,
          png: r && r.png ? Buffer.from(r.png, 'base64') : null
        }))
      } catch (e) {}
    }
  } catch (e) {
    // helper timed out or crashed — fall through to finally for cleanup
  } finally {
    if (existsSync(pidFile)) {
      try {
        const browserPid = parseInt(readFileSync(pidFile, 'utf8'), 10)
        if (browserPid) {
          if (process.platform === 'win32') {
            require('child_process').spawnSync('taskkill', ['/F', '/T', '/PID', String(browserPid)])
          } else {
            try { process.kill(-browserPid, 'SIGKILL') } catch (e) {}
          }
          try {
            process.kill(browserPid, 0)
            console.warn(`[specpress] WARNING: browser process ${browserPid} still alive after mermaid render — process tree may not have been killed`)
          } catch (e) { /* expected: process is dead */ }
        }
      } catch (e) {}
      try { unlinkSync(pidFile) } catch (e) {}
    }
    try { unlinkSync(helperFile) } catch (e) {}
    try { unlinkSync(outFile) } catch (e) {}
  }
  return results || codes.map(() => ({ svg: null, png: null }))
}

function renderMermaidToSvg(code, mermaidConfig) {
  return renderMermaidBatch([code], mermaidConfig)[0].svg
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
 * @param {string} storageDir - Directory to store the bundle.
 * @returns {Promise<string>} Absolute path to mermaid.min.js.
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

module.exports = {
  findBrowser,
  buildMermaidPageScript,
  renderMermaidBatch,
  renderMermaidToSvg,
  ensureMermaidBundle,
  DEFAULT_MERMAID_CONFIG_PATH,
}
