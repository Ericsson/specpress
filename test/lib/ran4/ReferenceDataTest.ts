#!/usr/bin/env node
// ReferenceDataTest.ts
//
// Loads and verifies all 38.101 JSON files and writes them to a temp directory.
//
// This is NOT a regular unit test.
// Run manually before and after refactoring to verify output stability:
//
//   npx tsx test/ReferenceDataTest.ts
//   npx tsx test/ReferenceDataTest.ts <refDir>
//
// First run:  generates reference data
// Second run: pass the first run's output path as argument to compare.

import { RAN4DataHandler } from "../../../lib/ran4/RAN4DataHandler.js";
import { join, relative, resolve } from "node:path";
import { mkdtempSync, readdirSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMP_DIR_PREFIX = "ran4_reftest_";

function loadAll(aDb: RAN4DataHandler, aRootFolder: string): void {
    // Bands
    aDb.chBwList.loadFromFolder(join(aRootFolder, "ts-38.101-1", "FR1_NR_bands"));
    aDb.chBwList.loadFromFolder(join(aRootFolder, "ts-38.101-2", "FR2_NR_bands"));

    // CA BCs
    aDb.bcList.loadFromFolder(join(aRootFolder, "ts-38.101-1", "NR_Intra-band_CA_FR1"), true);
    aDb.bcList.loadFromFolder(join(aRootFolder, "ts-38.101-1", "NR_Inter-band_CA_FR1"), true);
    aDb.bcList.loadFromFolder(join(aRootFolder, "ts-38.101-2", "NR_Intra-band_CA_FR2"), true);
    aDb.bcList.loadFromFolder(join(aRootFolder, "ts-38.101-2", "NR_Inter-band_CA_FR2"), true);
    aDb.bcList.loadFromFolder(join(aRootFolder, "ts-38.101-3", "NR_Inter-band_CA_FR1_and_FR2"));

    // DC BCs
    aDb.dcBcList.loadFromFolder(join(aRootFolder, "ts-38.101-1", "NR_Inter-band_DC_FR1"), true);
    aDb.dcBcList.loadFromFolder(join(aRootFolder, "ts-38.101-3", "NR_Inter-band_DC_FR1_and_FR2"), true);
    aDb.dcBcList.loadFromFolder(join(aRootFolder, "ts-38.101-3", "Intra-band_DC_FR1"), true);
    aDb.dcBcList.loadFromFolder(join(aRootFolder, "ts-38.101-3", "Inter-band_DC_FR1"), true);
    aDb.dcBcList.loadFromFolder(join(aRootFolder, "ts-38.101-3", "Inter-band_DC_Including_FR2"));
}

function writeAll(aDb: RAN4DataHandler, aOutputDir: string): void {
    aDb.chBwList.storeAsJsonFiles(aOutputDir);
    aDb.bcList.storeAsJsonFiles(aOutputDir);
    aDb.dcBcList.storeAsJsonFiles(aOutputDir);
}

function collectFiles(aDirectory: string): Map<string, string> {
    const result = new Map<string, string>();
    function walk(dir: string): void {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const absPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(absPath);
            } else {
                const relPath = relative(aDirectory, absPath);
                result.set(relPath, absPath);
            }
        }
    }
    walk(aDirectory);
    return result;
}

function compare(aReferenceDir: string, aNewDir: string): boolean {
    const refFiles = collectFiles(aReferenceDir);
    const newFiles = collectFiles(aNewDir);

    const refKeys = new Set(refFiles.keys());
    const newKeys = new Set(newFiles.keys());

    const missingInNew = [...refKeys].filter(k => !newKeys.has(k)).sort();
    const extraInNew = [...newKeys].filter(k => !refKeys.has(k)).sort();
    const commonFiles = [...refKeys].filter(k => newKeys.has(k)).sort();

    const differences: string[] = [];
    for (const oneRelPath of commonFiles) {
        const refContent = readFileSync(refFiles.get(oneRelPath)!, "utf-8").replace(/\r\n/g, "\n").replace(/\u00c2\u00b5/g, "\u00b5");
        const newContent = readFileSync(newFiles.get(oneRelPath)!, "utf-8").replace(/\r\n/g, "\n").replace(/\u00c2\u00b5/g, "\u00b5");
        if (refContent !== newContent) {
            differences.push(oneRelPath);
        }
    }

    let ok = true;
    if (missingInNew.length > 0) {
        ok = false;
        console.log(`\nERROR: Files missing in new output (${missingInNew.length}):`);
        for (const f of missingInNew) console.log(`  ${f}`);
    }
    if (extraInNew.length > 0) {
        ok = false;
        console.log(`\nERROR: Extra files in new output (${extraInNew.length}):`);
        for (const f of extraInNew) console.log(`  ${f}`);
    }
    if (differences.length > 0) {
        ok = false;
        console.log(`\nERROR: Files with different content (${differences.length}):`);
        for (const f of differences) console.log(`  ${f}`);
    }

    if (ok) {
        console.log(`\nAll ${commonFiles.length} files match the reference.`);
    }
    return ok;
}

// Main
const rootFolder = resolve(__dirname, "..", "..");

console.log("Loading and validating all data...");
const db = new RAN4DataHandler();
loadAll(db, rootFolder);

const outputDir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
console.log(`\nWriting output to: ${outputDir}`);
writeAll(db, outputDir);

// If a reference directory was passed as argument, compare against it:
if (process.argv.length > 2) {
    const referenceDir = process.argv[2];
    console.log(`\nComparing against reference: ${referenceDir}`);
    if (!statSync(referenceDir, { throwIfNoEntry: false })?.isDirectory()) {
        console.log(`ERROR: Reference directory does not exist: ${referenceDir}`);
        process.exit(1);
    }
    if (compare(referenceDir, outputDir)) {
        console.log("\nPASSED.");
        process.exit(0);
    } else {
        console.log("\nFAILED.");
        process.exit(1);
    }
} else {
    console.log("\nReference data generated. To compare after refactoring, run:");
    console.log(`  npx tsx test/ReferenceDataTest.ts ${outputDir}`);
}
