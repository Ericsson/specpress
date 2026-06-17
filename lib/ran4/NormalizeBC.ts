// NormalizeBC.ts — Normalize a single BC JSON file (library function)

import { resolve } from "node:path";
import { LoadJsonFileToDict, RAN4JsonEncoder } from "./JsonTools.js";
import { BC } from "./BandCombinations.js";

/**
 * Normalizes a single Band Combination JSON file.
 * 
 * Normalization effects:
 * - Key ordering enforced by toJSON() methods (e.g. bcsId → ulConfigList → bandList)
 * - UL configs sorted: band numbers first (numerically), then BC-IDs (using BC_ID sort order)
 * - notes object keys sorted alphabetically
 * - Consistent indentation via RAN4JsonEncoder
 * 
 * @param filePath - Path to the BC JSON file to normalize
 * @returns The absolute path of the normalized file
 * @throws Error if the file is not a valid BandCombination JSON file
 */
export function normalizeBC(filePath: string): string {
  const absPath = resolve(filePath);
  const dict = LoadJsonFileToDict(absPath);
  const bc = new BC(dict);
  const enc = new RAN4JsonEncoder(absPath);
  bc.toJSON(enc, 0);
  enc.flush();
  return absPath;
}
