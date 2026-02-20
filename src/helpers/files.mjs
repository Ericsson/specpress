import { promises as fs } from "fs";
import { join } from "path";

export async function getAllFiles(
	directory,
	ignoreFiles = [],
	ignoreFolders = [],
) {
	const files = [];
	const stack = [directory];

	while (stack.length) {
		const dir = stack.shift();
		const items = await fs.readdir(dir, { withFileTypes: true });
		items.sort((a, b) => a.name.localeCompare(b.name));
		for (const item of items) {
			const fullPath = join(dir, item.name);
			if (item.isDirectory()) {
				if (!ignoreFolders.includes(item.name)) {
					stack.push(fullPath);
				}
			} else if (!ignoreFiles.includes(item.name)) {
				files.push(fullPath);
			}
		}
	}

	return files;
}

export const ensureDirectoryExists = (path) =>
	fs
		.mkdir(path, { recursive: true })
		.catch((err) =>
			console.error(`Error creating directory: ${err.message}`),
		);

export async function writeFile(path, buffer) {
	await fs.writeFile(path, buffer);
	console.log(`File written: ${path}`);
}
