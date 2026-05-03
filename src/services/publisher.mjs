import { createRequire } from 'module'
import { writeFile } from 'fs/promises'
import { normalize, resolve, join, dirname } from 'path'
import { mkdirSync, existsSync, readFileSync } from 'fs'

const require = createRequire(import.meta.url)
const { Md2Html, MarkdownToDocxConverter, collectFiles, concatenateFiles } = require('../../lib/index.js')

const defaultCssPath = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../../lib/css/3gpp.css')
const defaultMermaidPath = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../../lib/css/mermaid-config.json')

function loadFile(p) {
	if (p && existsSync(p)) return readFileSync(p, 'utf8')
	return ''
}

export async function publishHtml(workingFolder, publicFolder, options = {}) {
	const css = options.css || loadFile(defaultCssPath)
	const mermaidConfig = options.mermaidConfig || loadFile(defaultMermaidPath) || '{}'
	const specRootPath = options.specRootPath || ''

	const processor = new Md2Html({ css, mermaidConfig, specRootPath })
	const { fileCount, imageCount } = processor.exportHtmlFromDirectory(workingFolder, publicFolder)

	if (fileCount === 0) {
		console.error(`No .md / .markdown / .asn files found in ${resolve(workingFolder)}`)
		return
	}
	console.log(`Exported ${fileCount} file(s) → ${resolve(publicFolder, 'index.html')} (${imageCount} image(s))`)
}

export async function exportDocument(workingFolder, exportFolder, fileName, type, options = {}) {
	if (type === 'html') {
		return publishHtml(workingFolder, exportFolder, options)
	}

	if (type === 'docx') {
		const specRootPath = options.specRootPath || ''
		const mermaidConfigPath = options.mermaidConfigPath || (existsSync(defaultMermaidPath) ? defaultMermaidPath : null)

		const files = collectFiles(workingFolder)
		if (files.length === 0) {
			console.error(`No .md / .markdown / .asn files found in ${resolve(workingFolder)}`)
			return
		}

		const content = concatenateFiles(files, undefined, specRootPath)
		const os = await import('os')
		const fs = await import('fs')
		const tempMd = join(os.default.tmpdir(), `.~export_${Date.now()}.md`)
		fs.default.writeFileSync(tempMd, content)

		try {
			const outputPath = normalize(`${exportFolder}/${fileName}.docx`)
			mkdirSync(exportFolder, { recursive: true })
			const converter = new MarkdownToDocxConverter(mermaidConfigPath, specRootPath)
			await converter.convert(tempMd, outputPath, dirname(files[0]))
			console.log(`File written: ${outputPath}`)
		} finally {
			if (fs.default.existsSync(tempMd)) fs.default.unlinkSync(tempMd)
		}
	}
}
