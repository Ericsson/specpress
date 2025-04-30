import { normalize } from "path";
import { getConfig } from "./index.mjs";

/**
 * Extracts the part of the path before the 'src' folder.
 * @param {string} pathRootFolder - The path for the root folder.
 * @param {string} pathWorkingFolder - The path for the root folder.
 * @returns {string} - The path for the figures folder.
 */
function getPathFiguresFolder(pathRootFolder, pathWorkingFolder) {
	return normalize(
		`${pathRootFolder}/${getConfig(
			"sourceFolderName",
			pathWorkingFolder
		)}/${getConfig("pathFiguresFolder", pathWorkingFolder)}`
	);
}

export { getPathFiguresFolder };
