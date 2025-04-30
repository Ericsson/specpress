#!/usr/bin/env node

import { normalize } from "path";
import { ensureDirectoryExists } from "../helpers/index.mjs";
import { writeBufferToFile } from "../utils/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());
// create the ./src folder

await ensureDirectoryExists(`${pathWorkingDirectory}/src`);

const gitignoreFileContent = `
#node_modules\n
node_modules\n\n
#public folder\n
public\n\n
# export folder\n
export\n\n
# log files\n
*.log\n\n`;

await writeBufferToFile(
	`${pathWorkingDirectory}/.gitignore`,
	Buffer.from(gitignoreFileContent)
);

// creates the config.json file
const spConfigFileContent = `{
"pathFiguresFolder": "/assets/figures",
"sourceFolderName": "src"
}\n`;

await writeBufferToFile(
	`${pathWorkingDirectory}/sp.config.json`,
	Buffer.from(spConfigFileContent)
);
