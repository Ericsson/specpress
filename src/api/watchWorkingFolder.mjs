// watcher.mjs
import chokidar from "chokidar";
import { generateUmlForFile } from "../api/index.mjs";
import { publishHtmlToPublicFolder } from "../api/index.mjs";

import { extname } from "path";

export function watchWorkingFolder(
	pathWorkingFolder,
	pathPublicFolder,
	pathFiguresFolder
) {
	const specificationFileExtensions = [".md", ".asn", ".json"];

	const umlTextFileExtensions = [".puml", ".txt"];

	// Initialize chokidar to watch the directory
	const watcher = chokidar.watch(pathWorkingFolder, {
		ignored: /(^|[\/\\])\../, // Ignore dotfiles
		persistent: true,
	});

	// Add event listener for file changes
	watcher.on("change", (pathFiile) => {
		// Determine which script to run based on file extension
		const fileExtension = extname(pathFiile);

		if (specificationFileExtensions.includes(fileExtension)) {
			publishHtmlToPublicFolder(pathWorkingFolder, pathPublicFolder);
			console.log(`File changed: ${pathFiile}`);
		} else if (umlTextFileExtensions.includes(fileExtension)) {
			console.log(`File changed: ${pathFiile}`);
			generateUmlForFile(pathFiile, pathFiguresFolder);
		} else {
			return;
		}
	});

	console.log(`Watching for file changes in: ${pathWorkingFolder}`);
}
