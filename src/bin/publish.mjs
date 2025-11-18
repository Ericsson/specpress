#!/usr/bin/env node

import { normalize } from "path";
import { publishHtmlToPublicFolder } from "../api/index.mjs";
import {
	ensureDirectoryExists,
	getPathBeforeSourceFolder,
} from "../helpers/index.mjs";
const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathPublicDirectory;
try {
	pathRootDirectory = getPathBeforeSourceFolder(pathWorkingDirectory);
} catch (error) {
	console.error(error.message);
	process.exit(1); // Exit with a non-zero code to indicate an error
}

pathPublicDirectory = normalize(`${pathRootDirectory}/public`);
await ensureDirectoryExists(pathPublicDirectory);

const args = process.argv.slice(2);
const publishTool = { pandoc: "pandoc", remark: "remark" };
publishHtmlToPublicFolder(
	pathWorkingDirectory,
	pathPublicDirectory,
	publishTool[args[0]]
);
