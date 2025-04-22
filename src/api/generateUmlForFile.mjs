import { getAllFiles, getFileExtension } from "../helpers/index.mjs";
import { generateUmlFromTextFile } from "../utils/index.mjs";
export function generateUmlForFile(pathFile, pathFiguresFolder) {
	const umlTextFileTypes = [".txt", ".puml"];

	if (umlTextFileTypes.includes(getFileExtension(pathFile))) {
		generateUmlFromTextFile(pathFile, pathFiguresFolder);
	} else {
		return;
	}
}
