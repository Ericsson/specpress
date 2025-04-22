import { normalize } from "path";
import {
	pandocBuffer,
	remarkBuffer,
	writeBufferToFile,
} from "../utils/index.mjs";
import { concatenateFilesToBuffer, getFolderName } from "../helpers/index.mjs";
export async function exportWorkingFolder(
	pathWorkingFolder,
	pathExportFolder,
	exportType = "pdf",
	exportTool = "renark"
) {
	let targetBuffer;

	const workingFolderName = await getFolderName(pathWorkingFolder);
	// read all files from the working directory

	const sourceBuffer = await concatenateFilesToBuffer(pathWorkingFolder);

	if (exportTool === `pandoc`) {
		await pandocBuffer(
			sourceBuffer,
			exportType,
			pathExportFolder,
			workingFolderName
		);
	} else {
		targetBuffer = await remarkBuffer(sourceBuffer, exportType);
		await writeBufferToFile(
			normalize(`${pathExportFolder}/${workingFolderName}.${exportType}`),
			targetBuffer
		);
	}
}
