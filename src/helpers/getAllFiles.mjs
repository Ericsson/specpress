import { promises as fs } from "fs";
import path from "path";

export async function getAllFiles(directory) {
  const files = [];
  const items = await fs.readdir(directory, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(directory, item.name);
    if (item.isDirectory()) {
      files.push(...(await getAllFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}
