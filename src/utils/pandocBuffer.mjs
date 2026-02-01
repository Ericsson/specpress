import nodePandoc from "node-pandoc";
import { promisify } from "util";

const pandocAsync = promisify(nodePandoc);

export async function pandocBuffer(sourceBuffer, pandocType, pathExportFolder, exportName) {
	const args = `-f markdown -t ${pandocType} -o ${pathExportFolder}/${exportName}.${pandocType}`;
	try {
		return await pandocAsync(sourceBuffer, args);
	} catch (error) {
		throw new Error(`Pandoc conversion failed: ${error.message}`);
	}
}
