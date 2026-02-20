#!/usr/bin/env node

import { normalize } from "path";
import { writeFile } from "fs/promises";
import { ensureDirectoryExists } from "../helpers/index.mjs";
import {
	SOURCE_FOLDER_NAME,
	PATH_FIGURES_FOLDER,
	IGNORE_FILES,
	IGNORE_FOLDERS,
	FILE_EXTENSIONS,
} from "../constants/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());

await ensureDirectoryExists(`${pathWorkingDirectory}/${SOURCE_FOLDER_NAME}`);

const spConfig = {
	sourceFolderName: SOURCE_FOLDER_NAME,
	pathFiguresFolder: PATH_FIGURES_FOLDER,
	ignoreFiles: IGNORE_FILES,
	ignoreFolders: IGNORE_FOLDERS,
	specFiles: FILE_EXTENSIONS.SPEC_FILE_TYPES,
	codeBlockFiles: FILE_EXTENSIONS.CODE_BLOCK_FILE_TYPES,
	umlFiles: FILE_EXTENSIONS.UML_FILE_TYPES,
};

const configPath = `${pathWorkingDirectory}/sp.config.json`;
await writeFile(configPath, JSON.stringify(spConfig, null, 2));
console.log(`File written: ${configPath}`);
