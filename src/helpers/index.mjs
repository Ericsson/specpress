// Consolidated modules
export * from "./paths.mjs";
export * from "./files.mjs";

// Existing modules (keep for now)
export { concatenateFilesToBuffer } from "./concatenateFilesToBuffer.mjs";
export { getConfig } from "./getConfig.mjs";
export { rewriteFiguresPathsInBuffer } from "./rewriteFiguresPathsInBuffer.mjs";

// Re-exports from Node.js (for backward compatibility)
import { parse } from "path";
export { extname as getFileExtension, basename as getFileName, parse } from "path";
export const getFileNameWithoutExtension = (path) => parse(path).name;
