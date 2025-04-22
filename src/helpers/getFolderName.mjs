import { dirname, basename, normalize } from "path";
import { stat } from "fs/promises";

export async function getFolderName(pathFiile) {
	// Normalize the path to handle any relative paths or extra slashes
	const normalizedPath = normalize(pathFiile);

	try {
		const stats = await stat(normalizedPath);

		if (stats.isFile()) {
			return basename(dirname(normalizedPath));
		} else if (stats.isDirectory()) {
			return basename(normalizedPath);
		} else {
			throw new Error(`Error checking path`);
		}
	} catch (error) {
		throw new Error(`Error checking path: ${error.message}`);
	}

	return folderName;
}
