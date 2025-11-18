#!/usr/bin/env node

import { normalize } from "path";
import { ensureDirectoryExists } from "../helpers/index.mjs";
import { writeBufferToFile } from "../utils/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());
// create the source folder ./src

await ensureDirectoryExists(`${pathWorkingDirectory}/src`);

// creates the config.json file
const spConfigFileContent = `{
"pathFiguresFolder": "/assets/figures",
"sourceFolderName": "src"
}\n`;

await writeBufferToFile(
	`${pathWorkingDirectory}/sp.config.json`,
	Buffer.from(spConfigFileContent)
);
