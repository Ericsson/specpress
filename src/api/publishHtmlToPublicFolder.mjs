import { normalize } from "path";
import { writeFile } from "fs/promises";
import { pandocBuffer, remarkBuffer } from "../utils/index.mjs";
import { concatenateFiles } from "../services/file.mjs";

export const publishHtmlToPublicFolder = async (pathWorkingFolder, pathPublicFolder, publishTool = "remark") => {
	const buffer = await concatenateFiles(pathWorkingFolder);
	
	if (publishTool === "pandoc") {
		await pandocBuffer(buffer, "html", pathPublicFolder, "index");
	} else {
		const remarkedBuffer = await remarkBuffer(buffer, "html");
		const outputPath = normalize(`${pathPublicFolder}/index.html`);
		await writeFile(outputPath, remarkedBuffer);
		console.log(`File written: ${outputPath}`);
	}
};
