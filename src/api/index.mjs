import { publishHtml, exportDocument } from "../services/publisher.mjs";
import { generateUml, generateUmlForFolder } from "../services/uml.mjs";
import { getFolderName } from "../helpers/paths.mjs";
import { validatePath, validateExportType, validateExportTool } from "../validation/index.mjs";

/**
 * Publishes specification as HTML to public folder
 * @param {string} pathWorkingFolder - Source folder containing specification files
 * @param {string} pathPublicFolder - Output folder for HTML
 * @param {'remark'|'pandoc'} [publishTool='remark'] - Processing tool to use
 * @returns {Promise<void>}
 * @throws {ValidationError} If parameters are invalid
 * @example
 * await publishHtmlToPublicFolder('./src/spec', './public', 'remark');
 */
export async function publishHtmlToPublicFolder(pathWorkingFolder, pathPublicFolder, publishTool = "remark") {
	validatePath(pathWorkingFolder, 'pathWorkingFolder');
	validatePath(pathPublicFolder, 'pathPublicFolder');
	await publishHtml(pathWorkingFolder, pathPublicFolder, publishTool);
}

/**
 * Exports specification to PDF, DOCX, or HTML
 * @param {string} pathWorkingFolder - Source folder containing specification files
 * @param {string} pathExportFolder - Output folder for exported file
 * @param {'pdf'|'docx'|'html'} [exportType='pdf'] - Export format
 * @param {'remark'|'pandoc'} [exportTool='remark'] - Processing tool to use
 * @returns {Promise<void>}
 * @throws {ValidationError} If parameters are invalid
 * @example
 * await exportWorkingFolder('./src/spec', './output', 'pdf', 'remark');
 */
export async function exportWorkingFolder(pathWorkingFolder, pathExportFolder, exportType = "pdf", exportTool = "remark") {
	validatePath(pathWorkingFolder, 'pathWorkingFolder');
	validatePath(pathExportFolder, 'pathExportFolder');
	validateExportType(exportType);
	validateExportTool(exportTool);
	
	const folderName = await getFolderName(pathWorkingFolder);
	await exportDocument(pathWorkingFolder, pathExportFolder, folderName, exportType, exportTool);
}

/**
 * Generates UML diagram PNG from text file
 * @param {string} pathFile - Path to .puml or .txt file
 * @param {string} pathFiguresFolder - Output folder for PNG
 * @returns {Promise<void>}
 * @throws {ValidationError} If parameters are invalid
 * @example
 * await generateUmlForFile('./diagrams/sequence.puml', './output/figures');
 */
export async function generateUmlForFile(pathFile, pathFiguresFolder) {
	validatePath(pathFile, 'pathFile');
	validatePath(pathFiguresFolder, 'pathFiguresFolder');
	await generateUml(pathFile, pathFiguresFolder);
}

/**
 * Generates UML diagrams for all .puml and .txt files in folder
 * @param {string} pathWorkingFolder - Folder to search for UML files
 * @param {string} pathFiguresFolder - Output folder for PNGs
 * @returns {Promise<void>}
 * @throws {ValidationError} If parameters are invalid
 * @example
 * await generateUmlForFolder('./diagrams', './output/figures');
 */
export { generateUmlForFolder } from "../services/uml.mjs";

export { watchWorkingFolder } from "./watchWorkingFolder.mjs";
export { serveLocalhostFromPublicFolder } from "./serveLocalhostFromPublicFolder.mjs";
