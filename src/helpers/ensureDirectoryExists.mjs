import { mkdir } from "fs/promises";
import { normalize } from "path";

export async function ensureDirectoryExists(pathFiile) {
	const normalizedPath = normalize(pathFiile);
	try {
		// Create the directory if it does not exist
		await mkdir(normalizedPath, { recursive: true });
	} catch (error) {
		console.error(`Error creating the directory: ${error.message}`);
	}
}
