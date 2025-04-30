import fs from "fs";
import { resolve, join } from "path";
/**
 * Return the value for a key in config file.
 * @param {string} key - The key in the config file
 * @param {string} path - The full path.
 * @returns {string} - The part of the path before 'src'.
 */
function getConfig(key, folderPath) {
	// Read the JSON configuration file

	const spConfigFilePath = findFileInParentFolders(
		"sp.config.json",
		folderPath
	);
	const config = JSON.parse(fs.readFileSync(spConfigFilePath, "utf-8"));

	return config[key];
}

/* Finds a file in the closest parent folder.
 * @param {string} fileName - The name of the file to find.
 * @param {string} [currentDir] - The directory to start the search from. Defaults to the current working directory.
 * @returns {string|null} - The path to the file if found, otherwise null.
 */
function findFileInParentFolders(fileName, currentDir) {
	// Start from the current directory or the provided directory
	let dir = currentDir || process.cwd();

	// Loop until we reach the root directory
	while (true) {
		// Construct the path to the file
		const filePath = join(dir, fileName);

		// Check if the file exists
		if (fs.existsSync(filePath)) {
			return filePath; // Return the path if the file is found
		}

		// Get the parent directory
		const parentDir = resolve(dir, "..");

		// If we've reached the root directory, stop the loop
		if (parentDir === dir) {
			break;
		}

		// Move up to the parent directory
		dir = parentDir;
	}

	// Return null if the file is not found
	return null;
}
export { getConfig };
