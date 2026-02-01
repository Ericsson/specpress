import plantuml from "node-plantuml";
import { createWriteStream } from "fs";
import { normalize, basename, parse, extname } from "path";
import { getAllFiles } from "../helpers/files.mjs";

const UML_EXTENSIONS = [".puml", ".txt"];

export async function generateUml(filePath, outputFolder) {
	return new Promise((resolve, reject) => {
		const fileName = parse(basename(filePath)).name;
		const outputPath = normalize(`${outputFolder}/${fileName}.png`);
		const gen = plantuml.generate(filePath);
		const writeStream = createWriteStream(outputPath);

		gen.out.pipe(writeStream);
		writeStream.on("finish", () => resolve(outputPath));
		writeStream.on("error", reject);
		gen.out.on("error", reject);
	});
}

export async function generateUmlForFolder(folderPath, outputFolder) {
	const files = await getAllFiles(folderPath);
	const umlFiles = files.filter(f => UML_EXTENSIONS.includes(extname(f)));
	await Promise.all(umlFiles.map(f => generateUml(f, outputFolder)));
}
