import nodePandoc from "node-pandoc";
import { promisify } from "util";

const pandocAsync = promisify(nodePandoc);

export async function pandocBuffer(sourceBuffer, pandocType, pathExportFolder, exportName) {
	const args = `-f markdown -t ${pandocType} -o ${pathExportFolder}/${exportName}.${pandocType}`;
	try {
		return await pandocAsync(sourceBuffer, args);
	} catch (error) {
		const errorMsg = error.message || error.toString();
		
		// If it's just a warning, log it but don't fail
		if (errorMsg.includes('[WARNING]')) {
			console.warn("Pandoc warning:", errorMsg);
			return; // Continue despite warning
		}
		
		// For actual errors, throw
		console.error("Pandoc error:", errorMsg);
		throw new Error(`Pandoc conversion failed: ${errorMsg}`);
	}
}
