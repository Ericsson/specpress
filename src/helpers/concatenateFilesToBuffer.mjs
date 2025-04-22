import { promises as fs } from "fs";
import { normalize, resolve } from "path";
import {
	getAllFiles,
	getFileExtension,
	rewriteFiguresPathsInBuffer,
} from "./index.mjs";

export async function concatenateFilesToBuffer(folderPath) {
	const fileTypesToMark = [".md", ".asn", ".json"];

	const fileTypesToMarkAsCodeBlock = [".asn", ".json"];

	const newlineBuffer = Buffer.from("\n");

	const files = await getAllFiles(folderPath);
	const buffers = await Promise.all(
		files
			.filter((file) => fileTypesToMark.includes(getFileExtension(file)))
			.map(async (file) => {
				const fileBuffer = await readFileAsBuffer(file);
				if (
					fileTypesToMarkAsCodeBlock.includes(getFileExtension(file))
				) {
					return Buffer.concat([
						Buffer.from("```\n"),
						fileBuffer,
						Buffer.from("\n```"),
						newlineBuffer,
					]);
				} else {
					return Buffer.concat([fileBuffer, newlineBuffer]);
				}
			})
	);

	const rewrtittenBuffers = buffers.map((buffer) => {
		const baseDir = normalize(`${resolve(folderPath, "src")}/src/`);
		return rewriteFiguresPathsInBuffer(buffer, baseDir);
	});

	return Buffer.concat(rewrtittenBuffers);
}

async function readFileAsBuffer(pathFiile) {
	return await fs.readFile(pathFiile);
}
