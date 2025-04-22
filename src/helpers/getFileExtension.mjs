import { extname } from "path";

export function getFileExtension(pathFiile) {
	// Get the file extension
	const fileExtension = extname(pathFiile);

	return fileExtension;
}
