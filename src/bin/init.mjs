#!/usr/bin/env node

import { normalize } from "path";
import { writeFile } from "fs/promises";
import { ensureDirectoryExists } from "../helpers/index.mjs";

const pathWorkingDirectory = normalize(process.cwd());

await ensureDirectoryExists(`${pathWorkingDirectory}/src`);

const spConfigFileContent = `{
"pathFiguresFolder": "/assets/figures",
"sourceFolderName": "src"
}
`;

const configPath = `${pathWorkingDirectory}/sp.config.json`;
await writeFile(configPath, spConfigFileContent);
console.log(`File written: ${configPath}`);
