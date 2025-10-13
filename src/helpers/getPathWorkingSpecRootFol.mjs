import path from "path";
import { getConfig } from "./index.mjs";

/**
 * Extracts the part of the path before the 'src' folder.
 * @param {string} path - The full path.
 * @returns {string} - The part of the path before 'src'.
 */
function getPathWorkingSpecRootFolder(folderPath) {
	try {
		// Normalize the path to handle any inconsistencies
		const normalizedPath = path.normalize(folderPath);

		// Split the path into segments
		const pathSegments = normalizedPath.split(path.sep);

		// Find the index of the 'src' folder
		const srcIndex = pathSegments.indexOf(
			getConfig("sourceFolderName", folderPath)
		);

		if (srcIndex === -1) {
			console.error(
				`The ${getConfig(
					"sourceFolderName",
					folderPath
				)} folder is not present in the provided path.`
			);
			return null;
		}

		// Extract the part of the path after 'src'
		const pathAfterSrc = pathSegments.slice(srcIndex + 1).join(path.sep);

		return pathAfterSrc;
	} catch (error) {
		console.error("Error processing the path:", error);
		return null;
	}
}

export { getPathWorkingSpecRootFolder };
