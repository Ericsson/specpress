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
const exportConfiguration = {
	exportType: { html: "html", docx: "docx", pdf: "pdf" },
	exportTool: { pandoc: "pandoc", remark: "remark" },
};

await exportWorkingFolder(
	pathWorkingDirectory,
	pathExportDirectory,
	exportConfiguration.exportType[args[0]],
	exportConfiguration.exportTool[args[1]]
);
