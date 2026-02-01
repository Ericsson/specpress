#!/usr/bin/env node
import { normalize } from "path";
import {
	ensureDirectoryExists,
	getPathBeforeSourceFolder,
	getPathFiguresFolder,
	getConfig,
} from "../helpers/index.mjs";
import { generateUmlForFile } from "../api/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());

let pathRootDirectory, pathFiguresDirectory, pathFile;
try {
	const sourceFolderName = getConfig("sourceFolderName", pathWorkingDirectory);
	pathRootDirectory = getPathBeforeSourceFolder(pathWorkingDirectory, sourceFolderName);
	const figuresFolder = getConfig("pathFiguresFolder", pathWorkingDirectory);
	pathFiguresDirectory = getPathFiguresFolder(pathWorkingDirectory, sourceFolderName, figuresFolder);
} catch (error) {
	console.error(error.message);
	process.exit(1); // Exit with a non-zero code to indicate an error
}

// Read the JSON configuration file

await ensureDirectoryExists(pathFiguresDirectory);

const args = process.argv.slice(2);
if (args[0]) {
	pathFile = normalize(args[0]);
	generateUmlForFile(pathFile, pathFiguresDirectory);
} else {
	console.log("File path has to be provided ");
}
