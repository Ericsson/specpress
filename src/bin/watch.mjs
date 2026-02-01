#!/usr/bin/env node
import { normalize } from "path";
import { watchWorkingFolder } from "../api/index.mjs";
import {
	ensureDirectoryExists,
	getPathBeforeSourceFolder,
	getPathFiguresFolder,
	getConfig,
} from "../helpers/index.mjs";
const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathPublicDirectory, pathFiguresDirectory;
try {
	const sourceFolderName = getConfig("sourceFolderName", pathWorkingDirectory);
	pathRootDirectory = getPathBeforeSourceFolder(pathWorkingDirectory, sourceFolderName);
	const figuresFolder = getConfig("pathFiguresFolder", pathWorkingDirectory);
	pathFiguresDirectory = getPathFiguresFolder(pathWorkingDirectory, sourceFolderName, figuresFolder);
} catch (error) {
	console.error(error.message);
	process.exit(1); // Exit with a non-zero code to indicate an error
}
// public folder
pathPublicDirectory = normalize(`${pathRootDirectory}/public`);
ensureDirectoryExists(pathPublicDirectory);

//fugures folder
ensureDirectoryExists(pathFiguresDirectory);

watchWorkingFolder(
	pathWorkingDirectory,
	pathPublicDirectory,
	pathFiguresDirectory
);
