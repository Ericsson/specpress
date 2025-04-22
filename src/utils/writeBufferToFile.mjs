import { writeFile } from "fs/promises";

/**
 * Writes a buffer to a specified file.
 * @param {string} pathFiile - The path to the file where the buffer will be written.
 * @param {Buffer} buffer - The buffer to write to the file.
 * @returns {Promise<void>} A promise that resolves when the file has been written.
 */
export async function writeBufferToFile(pathFiile, buffer) {
	try {
		await writeFile(pathFiile, buffer);
		console.log(`Buffer successfully written to ${pathFiile}`);
	} catch (error) {
		console.error("Error writing buffer to file:", error);
	}
}
