#!/usr/bin/env node
import fs from "fs";
import { normalize } from "path";
import { ensureDirectoryExists, getPathBeforeSrc } from "../helpers/index.mjs";
import { generateUmlForFile } from "../api/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());

let pathRootDirectory, pathFiguresDirectory, pathFile;
try {
	pathRootDirectory = getPathBeforeSrc(pathWorkingDirectory);
} catch (error) {
	console.error(error.message);
	process.exit(1); // Exit with a non-zero code to indicate an error
}

// Read the JSON configuration file
const config = JSON.parse(
	fs.readFileSync(`${pathRootDirectory}/sp.config.json`, "utf-8")
);
pathFiguresDirectory = normalize(
	`${pathRootDirectory}/src/${config.pathFiguresFolder}`
);
await ensureDirectoryExists(pathFiguresDirectory);

const args = process.argv.slice(2);
if (args[0]) {
	pathFile = normalize(args[0]);
	generateUmlForFile(pathFile, pathFiguresDirectory);
} else {
	console.log("File path has to be provided ");
}
