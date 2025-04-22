#!/usr/bin/env node
import fs from "fs";
import { normalize } from "path";
import { watchWorkingFolder } from "../api/index.mjs";
import { ensureDirectoryExists, getPathBeforeSrc } from "../helpers/index.mjs";
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
// Read the JSON configuration file
const config = JSON.parse(
	fs.readFileSync(`${pathRootDirectory}/sp.config.json`, "utf-8")
);
pathFiguresDirectory = normalize(
	`${pathRootDirectory}/src/${config.pathFiguresFolder}`
);
ensureDirectoryExists(pathFiguresDirectory);

watchWorkingFolder(
	pathWorkingDirectory,
	pathPublicDirectory,
	pathFiguresDirectory
);
