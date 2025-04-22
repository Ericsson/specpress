import plantuml from "node-plantuml";
import * as fs from "fs";
import { normalize } from "path";
import { getFileNameWithoutExtension } from "../helpers/index.mjs";

export function generateUmlFromTextFile(pathFile, pathFiguresFolder) {
	if (pathFile) {
		const fileName = getFileNameWithoutExtension(pathFile);

		let gen = plantuml.generate(pathFile);

		gen.out.pipe(
			fs.createWriteStream(
				normalize(`${pathFiguresFolder}/${fileName}.png`)
			)
		);
	}
}
