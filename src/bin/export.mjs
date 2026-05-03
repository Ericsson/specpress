#!/usr/bin/env node

import { normalize } from "path";
import { exportWorkingFolder } from "../api/index.mjs";
import {
	ensureDirectoryExists,
	getPathBeforeSourceFolder,
	getConfig,
} from "../helpers/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathExportDirectory;
try {
	const sourceFolderName = getConfig("sourceFolderName", pathWorkingDirectory);
	pathRootDirectory = getPathBeforeSourceFolder(pathWorkingDirectory, sourceFolderName);
} catch (error) {
	console.error(error.message);
	process.exit(1);
}

pathExportDirectory = normalize(`${pathRootDirectory}/export/`);
await ensureDirectoryExists(pathExportDirectory);

const args = process.argv.slice(2);
const exportType = args[0] === "html" ? "html" : "docx";

await exportWorkingFolder(pathWorkingDirectory, pathExportDirectory, exportType);
