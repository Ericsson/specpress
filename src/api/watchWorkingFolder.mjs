import chokidar from "chokidar";
import { extname, basename } from "path";
import { clearConfigCache } from "../helpers/index.mjs";

const SPEC_EXTENSIONS = [".md", ".asn", ".json"];
const UML_EXTENSIONS = [".puml", ".txt"];
const DEBOUNCE_MS = 300;

let publishTimeout;
const umlTimeouts = new Map();

export const watchWorkingFolder = (pathWorkingFolder, pathPublicFolder, pathFiguresFolder) => {
	const watcher = chokidar.watch(pathWorkingFolder, {
		ignored: /(^|[\/\\])\../,
		persistent: true,
	});

	watcher.on("change", async (pathFile) => {
		const ext = extname(pathFile);
		const fileName = basename(pathFile);
		console.log(`File changed: ${pathFile}`);

		if (fileName === "sp.config.json") {
			clearConfigCache();
			console.log("Config cache cleared");
		} else if (SPEC_EXTENSIONS.includes(ext)) {
			clearTimeout(publishTimeout);
			publishTimeout = setTimeout(async () => {
				const { publishHtmlToPublicFolder } = await import("./index.mjs");
				await publishHtmlToPublicFolder(pathWorkingFolder, pathPublicFolder);
			}, DEBOUNCE_MS);
		} else if (UML_EXTENSIONS.includes(ext)) {
			umlTimeouts.get(pathFile) && clearTimeout(umlTimeouts.get(pathFile));
			umlTimeouts.set(pathFile, setTimeout(async () => {
				const { generateUmlForFile } = await import("./generateUmlForFile.mjs");
				await generateUmlForFile(pathFile, pathFiguresFolder);
				umlTimeouts.delete(pathFile);
			}, DEBOUNCE_MS));
		}
	});

	console.log(`Watching for file changes in: ${pathWorkingFolder}`);
};
