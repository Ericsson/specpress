import { getConfig } from "./index.mjs";

/**
 * Extracts the part of the path before the 'src' folder.
 * @param {string} path - The full path.
 * @returns {string} - The part of the path before 'src'.
 */
function getPathBeforeSourceFolder(folderPath) {
	const srcIndex = folderPath.indexOf(
		getConfig("sourceFolderName", folderPath)
	);
	if (srcIndex === -1) {
		throw new Error(
			`The path does not contain a ${getConfig(
				"sourceFolderName",
				folderPath
			)} folder.`
		);
	}
	return folderPath.substring(0, srcIndex);
}

export { getPathBeforeSourceFolder };
