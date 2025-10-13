#!/usr/bin/env node
import { normalize } from "path";
import { watchWorkingFolder } from "../api/index.mjs";
import {
	ensureDirectoryExists,
	getPathBeforeSourceFolder,
	getPathFiguresFolder,
} from "../helpers/index.mjs";
const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathPublicDirectory, pathFiguresDirectory;
try {
	pathRootDirectory = getPathBeforeSourceFolder(pathWorkingDirectory);
} catch (error) {
	console.error(error.message);
	process.exit(1); // Exit with a non-zero code to indicate an error
}
// public folder
pathPublicDirectory = normalize(`${pathRootDirectory}/public`);
ensureDirectoryExists(pathPublicDirectory);

//fugures folder
pathFiguresDirectory = getPathFiguresFolder(
	pathRootDirectory,
	pathWorkingDirectory
);
ensureDirectoryExists(pathFiguresDirectory);

watchWorkingFolder(
	pathWorkingDirectory,
	pathPublicDirectory,
	pathFiguresDirectory
);
