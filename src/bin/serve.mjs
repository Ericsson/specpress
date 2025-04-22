#!/usr/bin/env node
import { normalize } from "path";
import { ensureDirectoryExists, getPathBeforeSrc } from "../helpers/index.mjs";
import { serveLocalhostFromPublicFolder } from "../api/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());
let pathRootDirectory, pathPublicDirectory;
try {
	pathRootDirectory = getPathBeforeSrc(pathWorkingDirectory);
} catch (error) {
	console.error(error.message);
	process.exit(1); // Exit with a non-zero code to indicate an error
}
pathPublicDirectory = normalize(`${pathRootDirectory}/public`);
await ensureDirectoryExists(pathPublicDirectory);
serveLocalhostFromPublicFolder(pathRootDirectory, pathPublicDirectory);
