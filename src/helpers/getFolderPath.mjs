import { dirname, normalize } from "path";
import { stat } from "fs/promises";

export async function getFolderPath(pathFiile) {
	// Normalize the path to handle any relative paths or extra slashes
	const normalizedPath = normalize(pathFiile);

	let directoryPath;

	try {
		const stats = await stat(normalizedPath);

		if (stats.isFile()) {
			return dirname(normalizedPath);
		} else if (stats.isDirectory()) {
			return normalizedPath;
		} else {
			throw new Error(`Error checking path`);
		}
	} catch (error) {
		throw new Error(`Error checking path: ${error.message}`);
	}

	return directoryPath;
}
