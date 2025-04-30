#!/usr/bin/env node
import { normalize } from "path";
import {
	publishHtmlToPublicFolder,
	serveLocalhostFromPublicFolder,
	watchWorkingFolder,
} from "../api/index.mjs";
import {
	ensureDirectoryExists,
	getPathBeforeSrc,
	getPathFiguresFolder,
} from "../helpers/index.mjs";
const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathPublicDirectory, pathFiguresDirectory;
try {
	pathRootDirectory = getPathBeforeSrc(pathWorkingDirectory);
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

publishHtmlToPublicFolder(pathWorkingDirectory, pathPublicDirectory);

watchWorkingFolder(
	pathWorkingDirectory,
	pathPublicDirectory,
	pathFiguresDirectory
);

serveLocalhostFromPublicFolder(pathRootDirectory, pathPublicDirectory);
