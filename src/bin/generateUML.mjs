#!/usr/bin/env node
import fs from "fs";
import { normalize } from "path";
import { ensureDirectoryExists, getPathBeforeSrc } from "../helpers/index.mjs";
import { generateUmlForFolder } from "../api/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathFiguresDirectory;
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
await generateUmlForFolder(pathWorkingDirectory, pathFiguresDirectory);
