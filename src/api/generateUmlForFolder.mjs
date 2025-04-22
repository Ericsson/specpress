import { getAllFiles, getFileExtension } from "../helpers/index.mjs";
import { generateUmlFromTextFile } from "../utils/index.mjs";
export async function generateUmlForFolder(
	pathWorkingFolder,
	pathFiguresFolder
) {
	const umlTextFileTypes = [".txt", ".puml"];

	const files = await getAllFiles(pathWorkingFolder);

	files
		.filter((file) => umlTextFileTypes.includes(getFileExtension(file)))
		.map((file) => generateUmlFromTextFile(file, pathFiguresFolder));
}
