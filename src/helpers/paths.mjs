import { dirname, basename, normalize, sep } from "path";
import { stat } from "fs/promises";

export async function getFolderPath(path) {
	const stats = await stat(path);
	return stats.isFile() ? dirname(path) : path;
}

export async function getFolderName(path) {
	const stats = await stat(path);
	return stats.isFile() ? basename(dirname(path)) : basename(path);
}

export function getPathBeforeSourceFolder(folderPath, sourceFolderName) {
	const srcIndex = folderPath.indexOf(sourceFolderName);
	if (srcIndex === -1) {
		throw new Error(`Path does not contain '${sourceFolderName}' folder`);
	}
	return folderPath.substring(0, srcIndex);
}

export function getPathWorkingSpecRootFolder(folderPath, sourceFolderName) {
	const pathSegments = normalize(folderPath).split(sep);
	const srcIndex = pathSegments.indexOf(sourceFolderName);
	if (srcIndex === -1) {
		throw new Error(`'${sourceFolderName}' folder not found in path`);
	}
	return pathSegments.slice(0, srcIndex + 2).join(sep);
}

export function getPathFiguresFolder(workingFolder, sourceFolderName, figuresFolder) {
	return normalize(`${getPathWorkingSpecRootFolder(workingFolder, sourceFolderName)}/${figuresFolder}`);
}
