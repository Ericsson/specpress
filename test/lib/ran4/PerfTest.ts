#!/usr/bin/env node
// PerfTest.ts — Measures execution time and memory for the full load+validate+write cycle

import { RAN4DataHandler } from "../../../lib/ran4/RAN4DataHandler.js";
import { join, resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootFolder = resolve(__dirname, "..", "..");

function formatMB(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1);
}

function printMemory(label: string): void {
    const mem = process.memoryUsage();
    console.log(`  [${label}] RSS: ${formatMB(mem.rss)} MB | Heap Used: ${formatMB(mem.heapUsed)} MB | Heap Total: ${formatMB(mem.heapTotal)} MB`);
}

console.log("=== TypeScript Performance Benchmark ===\n");
printMemory("Start");

const t0 = performance.now();

// Phase 1: Load
const db = new RAN4DataHandler();

const t1 = performance.now();
db.chBwList.loadFromFolder(join(rootFolder, "ts-38.101-1", "FR1_NR_bands"));
db.chBwList.loadFromFolder(join(rootFolder, "ts-38.101-2", "FR2_NR_bands"));
const t2 = performance.now();
printMemory("After bands");

db.bcList.loadFromFolder(join(rootFolder, "ts-38.101-1", "NR_Intra-band_CA_FR1"), true);
db.bcList.loadFromFolder(join(rootFolder, "ts-38.101-1", "NR_Inter-band_CA_FR1"), true);
db.bcList.loadFromFolder(join(rootFolder, "ts-38.101-2", "NR_Intra-band_CA_FR2"), true);
db.bcList.loadFromFolder(join(rootFolder, "ts-38.101-2", "NR_Inter-band_CA_FR2"), true);
db.bcList.loadFromFolder(join(rootFolder, "ts-38.101-3", "NR_Inter-band_CA_FR1_and_FR2"));
const t3 = performance.now();
printMemory("After CA BCs");

db.dcBcList.loadFromFolder(join(rootFolder, "ts-38.101-1", "NR_Inter-band_DC_FR1"), true);
db.dcBcList.loadFromFolder(join(rootFolder, "ts-38.101-3", "NR_Inter-band_DC_FR1_and_FR2"), true);
db.dcBcList.loadFromFolder(join(rootFolder, "ts-38.101-3", "Intra-band_DC_FR1"), true);
db.dcBcList.loadFromFolder(join(rootFolder, "ts-38.101-3", "Inter-band_DC_FR1"), true);
db.dcBcList.loadFromFolder(join(rootFolder, "ts-38.101-3", "Inter-band_DC_Including_FR2"));
const t4 = performance.now();
printMemory("After DC BCs");

// Phase 2: Write
const outputDir = mkdtempSync(join(tmpdir(), "ran4_perf_"));
db.chBwList.storeAsJsonFiles(outputDir);
db.bcList.storeAsJsonFiles(outputDir);
db.dcBcList.storeAsJsonFiles(outputDir);
const t5 = performance.now();
printMemory("After write");

console.log("\n--- Timing ---");
console.log(`  Load bands:   ${((t2 - t1) / 1000).toFixed(2)}s`);
console.log(`  Load CA BCs:  ${((t3 - t2) / 1000).toFixed(2)}s`);
console.log(`  Load DC BCs:  ${((t4 - t3) / 1000).toFixed(2)}s`);
console.log(`  Write all:    ${((t5 - t4) / 1000).toFixed(2)}s`);
console.log(`  TOTAL:        ${((t5 - t0) / 1000).toFixed(2)}s`);
console.log(`\nOutput: ${outputDir}`);
