import { promises as fs } from "fs";
import { normalize, resolve, extname } from "path";
import { getAllFiles, rewriteFiguresPathsInBuffer } from "./index.mjs";

const FILE_TYPES = [".md", ".asn", ".json"];
const CODE_BLOCK_TYPES = [".asn", ".json"];
const NEWLINE = Buffer.from("\n");
const CODE_START = Buffer.from("```\n");
const CODE_END = Buffer.from("\n```");

export const concatenateFilesToBuffer = async (folderPath) => {
	const files = (await getAllFiles(folderPath)).filter(f => FILE_TYPES.includes(extname(f)));
	const baseDir = normalize(`${resolve(folderPath, "src")}/src/`);
	
	const buffers = await Promise.all(
		files.map(async (file) => {
			const content = await fs.readFile(file);
			const ext = extname(file);
			const wrapped = CODE_BLOCK_TYPES.includes(ext)
				? Buffer.concat([CODE_START, content, CODE_END, NEWLINE])
				: Buffer.concat([content, NEWLINE]);
			return rewriteFiguresPathsInBuffer(wrapped, baseDir);
		})
	);

	return Buffer.concat(buffers);
};
