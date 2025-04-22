import { basename, normalize } from "path";

export function getFileName(pathFiile) {
	// Normalize the path to handle any relative paths or extra slashes
	const normalizedPath = normalize(pathFiile);

	// Get the base name of the path, which is the file name
	const fileName = basename(normalizedPath);

	return fileName;
}
