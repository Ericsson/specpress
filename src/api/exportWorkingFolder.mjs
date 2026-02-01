import { normalize } from "path";
import { writeFile } from "fs/promises";
import { pandocBuffer, remarkBuffer } from "../utils/index.mjs";
import { concatenateFilesToBuffer, getFolderName } from "../helpers/index.mjs";

export const exportWorkingFolder = async (pathWorkingFolder, pathExportFolder, exportType = "pdf", exportTool = "remark") => {
	const workingFolderName = await getFolderName(pathWorkingFolder);
	const sourceBuffer = await concatenateFilesToBuffer(pathWorkingFolder);

	if (exportTool === "pandoc") {
		await pandocBuffer(sourceBuffer, exportType, pathExportFolder, workingFolderName);
	} else {
		const targetBuffer = await remarkBuffer(sourceBuffer, exportType);
		const outputPath = normalize(`${pathExportFolder}/${workingFolderName}.${exportType}`);
		await writeFile(outputPath, targetBuffer);
		console.log(`File written: ${outputPath}`);
	}
};
