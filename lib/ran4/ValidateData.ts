#!/usr/bin/env node
// ValidateData.ts — Core validation logic (library export)

import { join, resolve } from "node:path";
import { RAN4DataHandler } from "./RAN4DataHandler.js";
import { LoadSchema, CompiledSchema } from "./JsonTools.js";

//////////////////////////////
// Exit codes (bitwise OR)

export const EXIT_OK              = 0;
export const EXIT_CONTENT_ERROR   = 1;
export const EXIT_SCHEMA_ERROR    = 2;

//////////////////////////////
// Result type

export interface ValidationResult {
  db: RAN4DataHandler;
  exitCode: number;
}

/**
 * Loads all channel-bandwidth, CA band-combination, and DC band-combination
 * JSON files from the 38.101 data repository, validates them against their
 * JSON schemas and cross-references, and returns the populated RAN4DataHandler
 * together with an exit code.
 *
 * Exit codes (bitwise OR):
 *   0 — success
 *   1 — one or more content validation errors
 *   2 — one or more schema validation errors
 *   3 — both content and schema validation errors
 *
 * Uses glob patterns (n*.json, CA_*.json, DC_*.json) so the function is
 * independent of the exact subfolder names in the data repository.
 *
 * @param aRootFolder — path to the 38.101 repository root
 *   (the folder that contains common/, ts-38.101-1/, ts-38.101-2/, ts-38.101-3/).
 * @param skipValidation — if true, skip content validation of loaded data.
 * @param skipSchemaValidation — if true, skip JSON schema validation of loaded files.
 * @param abortOnError — if true (default), abort on the first validation error.
 *   If false, collect and print all errors without aborting.
 */
export function loadAndValidateAll(
  aRootFolder: string,
  skipValidation: boolean = false,
  skipSchemaValidation: boolean = false,
  abortOnError: boolean = true
): ValidationResult {
  const rootFolder = resolve(aRootFolder);
  const db = new RAN4DataHandler();
  let exitCode = EXIT_OK;

  // Load and compile schema files (once) — unless schema validation is disabled
  let schemaBand: CompiledSchema | null = null;
  let schemaCA:   CompiledSchema | null = null;
  let schemaDC:   CompiledSchema | null = null;
  if (!skipSchemaValidation) {
    schemaBand = LoadSchema(join(rootFolder, "common/jsonSchemas/Band.json"));
    schemaCA   = LoadSchema(join(rootFolder, "common/jsonSchemas/BandCombinationsCarrierAggregation.json"));
    schemaDC   = LoadSchema(join(rootFolder, "common/jsonSchemas/BandCombinationsDualConnectivity.json"));
  }

  // Bands (n*.json)
  const r1 = db.chBwList.loadByPattern(rootFolder, "n*.json", skipValidation, schemaBand, abortOnError);

  // CA BCs (CA_*.json)
  const r2 = db.bcList.loadByPattern(rootFolder, "CA_*.json", skipValidation, schemaCA, abortOnError);

  // DC BCs (DC_*.json)
  const r3 = db.dcBcList.loadByPattern(rootFolder, "DC_*.json", skipValidation, schemaDC, abortOnError);

  const totalSchemaErrors  = r1.schemaErrors  + r2.schemaErrors  + r3.schemaErrors;
  const totalContentErrors = r1.contentErrors + r2.contentErrors + r3.contentErrors;

  if (totalContentErrors > 0) exitCode |= EXIT_CONTENT_ERROR;
  if (totalSchemaErrors  > 0) exitCode |= EXIT_SCHEMA_ERROR;

  return { db, exitCode };
}

//////////////////////////////
// CLI argument parsing (exported for testing)

export interface CliOptions {
  rootFolder: string;
  skipValidation: boolean;
  skipSchema: boolean;
  noAbort: boolean;
  outputFile: string | null;
}

export function parseArgs(argv: string[]): CliOptions | null {
  const args = argv.slice(2);
  const skipValidation = args.includes("--skip-validation");
  const skipSchema     = args.includes("--skip-schema");
  const noAbort        = args.includes("--no-abort");

  const outputIdx  = args.indexOf("--output");
  const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : null;

  const rootFolder = args.find((a, i) => !a.startsWith("--") && (outputIdx < 0 || i !== outputIdx + 1));

  if (!rootFolder) {
    return null;
  }

  return { rootFolder, skipValidation, skipSchema, noAbort, outputFile };
}
