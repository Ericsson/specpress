let remarkModule, pandocModule;

export async function publishHtml(workingFolder, publicFolder, tool = "remark") {
	const { concatenateFiles } = await import("./file.mjs");
	const { writeFile } = await import("fs/promises");
	const { normalize } = await import("path");
	const buffer = await concatenateFiles(workingFolder);
	
	if (tool === "pandoc") {
		if (!pandocModule) pandocModule = await import("../utils/pandocBuffer.mjs");
		await pandocModule.pandocBuffer(buffer, "html", publicFolder, "index");
	} else {
		if (!remarkModule) remarkModule = await import("../utils/remarkBuffer.mjs");
		const html = await remarkModule.remarkBuffer(buffer, "html");
		await writeFile(normalize(`${publicFolder}/index.html`), html);
		console.log(`File written: ${publicFolder}/index.html`);
	}
}

export async function exportDocument(workingFolder, exportFolder, fileName, type, tool = "remark") {
	const { concatenateFiles } = await import("./file.mjs");
	const { writeFile } = await import("fs/promises");
	const { normalize } = await import("path");
	const buffer = await concatenateFiles(workingFolder);

	if (tool === "pandoc") {
		if (!pandocModule) pandocModule = await import("../utils/pandocBuffer.mjs");
		await pandocModule.pandocBuffer(buffer, type, exportFolder, fileName);
	} else {
		if (!remarkModule) remarkModule = await import("../utils/remarkBuffer.mjs");
		const output = await remarkModule.remarkBuffer(buffer, type);
		const outputPath = normalize(`${exportFolder}/${fileName}.${type}`);
		await writeFile(outputPath, output);
		console.log(`File written: ${outputPath}`);
	}
}
