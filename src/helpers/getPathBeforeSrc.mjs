// pathUtils.js

/**
 * Extracts the part of the path before the 'src' folder.
 * @param {string} path - The full path.
 * @returns {string} - The part of the path before 'src'.
 */
function getPathBeforeSrc(path) {
	const srcIndex = path.indexOf("src");
	if (srcIndex === -1) {
		throw new Error("The path does not contain a 'src' folder.");
	}
	return path.substring(0, srcIndex);
}

export { getPathBeforeSrc };
