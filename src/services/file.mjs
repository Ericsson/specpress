import { promises as fs } from "fs";
import { extname, normalize, resolve } from "path";
import { getAllFiles } from "../helpers/files.mjs";

const FILE_TYPES = [".md", ".asn", ".json"];
const CODE_BLOCK_TYPES = [".asn", ".json"];
const NEWLINE = Buffer.from("\n");
const CODE_START = Buffer.from("```\n");
const CODE_END = Buffer.from("\n```");
const CONCURRENCY_LIMIT = 10;

export async function concatenateFiles(folderPath) {
	const files = (await getAllFiles(folderPath)).filter(f => FILE_TYPES.includes(extname(f)));
	const baseDir = normalize(`${resolve(folderPath, "src")}/src/`);
	
	const buffers = await processFilesInBatches(files, baseDir);
	return Buffer.concat(buffers);
}

async function processFilesInBatches(files, baseDir) {
	const results = [];
	for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
		const batch = files.slice(i, i + CONCURRENCY_LIMIT);
		const batchResults = await Promise.all(
			batch.map(async (file) => {
				const content = await fs.readFile(file);
				const ext = extname(file);
				const wrapped = CODE_BLOCK_TYPES.includes(ext)
					? Buffer.concat([CODE_START, content, CODE_END, NEWLINE])
					: Buffer.concat([content, NEWLINE]);
				return rewriteImagePaths(wrapped, baseDir);
			})
		);
		results.push(...batchResults);
	}
	return results;
}

function rewriteImagePaths(buffer, baseDir) {
	const IMG_REGEX = /!\[.*?\]\((.+?)\)/g;
	const PATH_REGEX = /\(([^)]+)\)/;
	return Buffer.from(
		buffer.toString().replace(IMG_REGEX, (match, p1) => 
			match.replace(PATH_REGEX, `(${resolve(baseDir, p1)})`)
		)
	);
}
