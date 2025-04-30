#!/usr/bin/env node
import { normalize } from "path";
import {
	ensureDirectoryExists,
	getPathBeforeSrc,
	getPathFiguresFolder,
} from "../helpers/index.mjs";
import { generateUmlForFolder } from "../api/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathFiguresDirectory;
try {
	pathRootDirectory = getPathBeforeSrc(pathWorkingDirectory);
} catch (error) {
	console.error(error.message);
	process.exit(1); // Exit with a non-zero code to indicate an error
}
pathFiguresDirectory = getPathFiguresFolder(
	pathRootDirectory,
	pathWorkingDirectory
);

await ensureDirectoryExists(pathFiguresDirectory);
await generateUmlForFolder(pathWorkingDirectory, pathFiguresDirectory);
