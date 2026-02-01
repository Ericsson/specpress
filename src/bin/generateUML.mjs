#!/usr/bin/env node
import { normalize } from "path";
import {
	ensureDirectoryExists,
	getPathBeforeSourceFolder,
	getPathFiguresFolder,
	getConfig,
} from "../helpers/index.mjs";
import { generateUmlForFolder } from "../api/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathFiguresDirectory;
try {
	const sourceFolderName = getConfig("sourceFolderName", pathWorkingDirectory);
	pathRootDirectory = getPathBeforeSourceFolder(pathWorkingDirectory, sourceFolderName);
	const figuresFolder = getConfig("pathFiguresFolder", pathWorkingDirectory);
	pathFiguresDirectory = getPathFiguresFolder(pathWorkingDirectory, sourceFolderName, figuresFolder);
} catch (error) {
	console.error(error.message);
	process.exit(1); // Exit with a non-zero code to indicate an error
}

await ensureDirectoryExists(pathFiguresDirectory);
await generateUmlForFolder(pathWorkingDirectory, pathFiguresDirectory);
