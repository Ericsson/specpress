import { promises as fs } from "fs";
import { join } from "path";

export async function getAllFiles(directory) {
	const files = [];
	const stack = [directory];
	
	while (stack.length) {
		const dir = stack.pop();
		const items = await fs.readdir(dir, { withFileTypes: true });
		for (const item of items) {
			const fullPath = join(dir, item.name);
			item.isDirectory() ? stack.push(fullPath) : files.push(fullPath);
		}
	}
	return files;
}

export const ensureDirectoryExists = (path) => 
	fs.mkdir(path, { recursive: true }).catch(err => 
		console.error(`Error creating directory: ${err.message}`)
	);

export async function writeFile(path, buffer) {
	await fs.writeFile(path, buffer);
	console.log(`File written: ${path}`);
}
