#!/usr/bin/env node
import { normalize } from "path";
import { publishHtmlToPublicFolder, serveLocalhostFromPublicFolder, watchWorkingFolder } from "../api/index.mjs";
import { ensureDirectoryExists, getPathBeforeSourceFolder, getPathFiguresFolder, getConfig } from "../helpers/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());

try {
	const sourceFolderName = getConfig("sourceFolderName", pathWorkingDirectory);
	const figuresFolder = getConfig("pathFiguresFolder", pathWorkingDirectory);
	
	const pathRootDirectory = getPathBeforeSourceFolder(pathWorkingDirectory, sourceFolderName);
	const pathPublicDirectory = normalize(`${pathRootDirectory}/public`);
	const pathFiguresDirectory = getPathFiguresFolder(pathWorkingDirectory, sourceFolderName, figuresFolder);

	await Promise.all([
		ensureDirectoryExists(pathPublicDirectory),
		ensureDirectoryExists(pathFiguresDirectory)
	]);

	await publishHtmlToPublicFolder(pathWorkingDirectory, pathPublicDirectory);
	watchWorkingFolder(pathWorkingDirectory, pathPublicDirectory, pathFiguresDirectory);
	serveLocalhostFromPublicFolder(pathRootDirectory, pathPublicDirectory);
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
