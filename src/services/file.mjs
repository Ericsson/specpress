import { promises as fs } from "fs";
import { extname, normalize, resolve, isAbsolute, dirname } from "path";
import { getAllFiles, getConfig } from "../helpers/index.mjs";
import { FILE_EXTENSIONS } from "../constants/index.mjs";

const NEWLINE = Buffer.from("\n");
const CODE_START = Buffer.from("```\n");
const CODE_END = Buffer.from("\n```");
const CONCURRENCY_LIMIT = 10;

export async function concatenateFiles(folderPath) {
	const ignoreFiles = getConfig("ignoreFiles", folderPath) || [];
	const ignoreFolders = getConfig("ignoreFolders", folderPath) || [];
	const specFiles = getConfig("specFiles", folderPath) || FILE_EXTENSIONS.SPEC_FILE_TYPES;
	const codeBlockFiles = getConfig("codeBlockFiles", folderPath) || FILE_EXTENSIONS.CODE_BLOCK_FILE_TYPES;

	const files = (await getAllFiles(folderPath, ignoreFiles, ignoreFolders)).filter(f => specFiles.includes(extname(f)));
	
	const buffers = await processFilesInBatches(files, codeBlockFiles);
	return Buffer.concat(buffers);
}

async function processFilesInBatches(files, codeBlockFiles) {
	const results = [];
	for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
		const batch = files.slice(i, i + CONCURRENCY_LIMIT);
		const batchResults = await Promise.all(
			batch.map(async (file) => {
				const content = await fs.readFile(file);
				const ext = extname(file);
				const wrapped = codeBlockFiles.includes(ext)
					? Buffer.concat([CODE_START, content, CODE_END, NEWLINE])
					: Buffer.concat([content, NEWLINE]);
				const fileDir = dirname(file);
				return rewriteImagePaths(wrapped, fileDir);
			})
		);
		results.push(...batchResults);
	}
	return results;
}

function rewriteImagePaths(buffer, fileDir) {
	const IMG_REGEX = /!\[.*?\]\((.+?)\)/g;
	const PATH_REGEX = /\(([^)]+)\)/;
	return Buffer.from(
		buffer.toString().replace(IMG_REGEX, (match, p1) => {
			// Skip if already absolute or starts with http/https
			if (isAbsolute(p1) || p1.startsWith('http://') || p1.startsWith('https://') || p1.startsWith('/')) {
				return match;
			}
			
			const absolutePath = normalize(resolve(fileDir, p1));
			return match.replace(PATH_REGEX, `(${absolutePath})`);
		})
	);
}
