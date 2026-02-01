import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const configCache = new Map();

export const getConfig = (key, folderPath) => {
	const configPath = findFileInParentFolders("sp.config.json", folderPath);
	if (!configPath) throw new Error("sp.config.json not found");
	
	if (!configCache.has(configPath)) {
		configCache.set(configPath, JSON.parse(readFileSync(configPath, "utf-8")));
	}
	
	return configCache.get(configPath)?.[key];
};

const findFileInParentFolders = (fileName, currentDir = process.cwd()) => {
	let dir = currentDir;
	
	while (true) {
		const filePath = join(dir, fileName);
		if (existsSync(filePath)) return filePath;
		
		const parentDir = resolve(dir, "..");
		if (parentDir === dir) return null;
		dir = parentDir;
	}
};
