import { resolve } from "path";

// Function to replace relative paths with absolute paths in a Markdown buffer
export const rewriteFiguresPathsInBuffer = (markdownBuffer, baseDir) => {
	// Regular expression to match relative image paths
	const imagePathRegex = /!\[.*?\]\((.+?)\)/g;

	// Replace relative paths with absolute paths
	return Buffer.from(
		markdownBuffer.toString().replace(imagePathRegex, (match, p1) => {
			const absolutePath = resolve(baseDir, p1);
			const regex = /\(([^)]+)\)/;
			return match.replace(regex, `(${absolutePath})`);
		})
	);
};
