import { basename, parse } from "path";

export function getFileNameWithoutExtension(pathFiile) {
	// Get the base name of the file path
	const baseName = basename(pathFiile);

	// Remove the file extension
	const fileNameWithoutExtension = parse(baseName).name;

	return fileNameWithoutExtension;
}
