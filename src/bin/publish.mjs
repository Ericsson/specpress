#!/usr/bin/env node

import { normalize } from "path";
import { publishHtmlToPublicFolder } from "../api/index.mjs";
import {
	ensureDirectoryExists,
	getPathBeforeSourceFolder,
	getConfig,
} from "../helpers/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathPublicDirectory;
try {
	const sourceFolderName = getConfig("sourceFolderName", pathWorkingDirectory);
	pathRootDirectory = getPathBeforeSourceFolder(pathWorkingDirectory, sourceFolderName);
} catch (error) {
	console.error(error.message);
	process.exit(1);
}

pathPublicDirectory = normalize(`${pathRootDirectory}/public`);
await ensureDirectoryExists(pathPublicDirectory);

await publishHtmlToPublicFolder(pathWorkingDirectory, pathPublicDirectory);
