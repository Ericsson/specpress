import { publishHtml, exportDocument } from "../services/publisher.mjs";
import { generateUml, generateUmlForFolder } from "../services/uml.mjs";
import { getFolderName } from "../helpers/paths.mjs";
import { validatePath, validateExportType } from "../validation/index.mjs";

/**
 * Publishes specification as HTML to public folder
 * @param {string} pathWorkingFolder - Source folder containing specification files
 * @param {string} pathPublicFolder - Output folder for HTML
 * @param {Object} [options={}] - Options (specRootPath, css, mermaidConfig)
 * @returns {Promise<void>}
 */
export async function publishHtmlToPublicFolder(pathWorkingFolder, pathPublicFolder, options = {}) {
	validatePath(pathWorkingFolder, 'pathWorkingFolder');
	validatePath(pathPublicFolder, 'pathPublicFolder');
	await publishHtml(pathWorkingFolder, pathPublicFolder, options);
}

/**
 * Exports specification to DOCX or HTML
 * @param {string} pathWorkingFolder - Source folder containing specification files
 * @param {string} pathExportFolder - Output folder for exported file
 * @param {'docx'|'html'} [exportType='docx'] - Export format
 * @param {Object} [options={}] - Options (specRootPath, mermaidConfigPath)
 * @returns {Promise<void>}
 */
export async function exportWorkingFolder(pathWorkingFolder, pathExportFolder, exportType = "docx", options = {}) {
	validatePath(pathWorkingFolder, 'pathWorkingFolder');
	validatePath(pathExportFolder, 'pathExportFolder');
	validateExportType(exportType);

	const folderName = await getFolderName(pathWorkingFolder);
	await exportDocument(pathWorkingFolder, pathExportFolder, folderName, exportType, options);
}

/**
 * Generates UML diagram PNG from text file
 * @param {string} pathFile - Path to .puml or .txt file
 * @param {string} pathFiguresFolder - Output folder for PNG
 * @returns {Promise<void>}
 */
export async function generateUmlForFile(pathFile, pathFiguresFolder) {
	validatePath(pathFile, 'pathFile');
	validatePath(pathFiguresFolder, 'pathFiguresFolder');
	await generateUml(pathFile, pathFiguresFolder);
}

export { generateUmlForFolder } from "../services/uml.mjs";

export { watchWorkingFolder } from "./watchWorkingFolder.mjs";
export { serveLocalhostFromPublicFolder } from "./serveLocalhostFromPublicFolder.mjs";
