#!/usr/bin/env node

import { normalize } from "path";
import { exportWorkingFolder } from "../api/index.mjs";
import { ensureDirectoryExists, getPathBeforeSrc } from "../helpers/index.mjs";
const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathExportDirectory;
try {
	pathRootDirectory = getPathBeforeSrc(pathWorkingDirectory);
} catch (error) {
	console.error(error.message);
	process.exit(1); // Exit with a non-zero code to indicate an error
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
