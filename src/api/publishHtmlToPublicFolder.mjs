import { normalize } from "path";
import {
	pandocBuffer,
	remarkBuffer,
	writeBufferToFile,
} from "../utils/index.mjs";
import { concatenateFilesToBuffer } from "../helpers/index.mjs";
export async function publishHtmlToPublicFolder(
	pathWorkingFolder,
	pathPublicFolder,
	publishTool = "renark"
) {
	// read all files from the working directory

	const buffer = await concatenateFilesToBuffer(pathWorkingFolder);
	if (publishTool === `pandoc`) {
		await pandocBuffer(buffer, `html`, pathPublicFolder, `index`);
	} else {
		const remarkedBuffer = await remarkBuffer(buffer, `html`);

		await writeBufferToFile(
			normalize(`${pathPublicFolder}/index.html`),
			remarkedBuffer
		);
	}
}
