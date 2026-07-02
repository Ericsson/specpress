// Test_ValidateData.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadAndValidateAll,
  EXIT_OK, EXIT_CONTENT_ERROR, EXIT_SCHEMA_ERROR
} from "../../../lib/ran4/ValidateData.js";

//////////////////////////////
// Exit code constants

describe("ExitCodes", () => {
  it("testBitwiseCombination", () => {
    assert.strictEqual(EXIT_OK, 0);
    assert.strictEqual(EXIT_CONTENT_ERROR, 1);
    assert.strictEqual(EXIT_SCHEMA_ERROR, 2);
    assert.strictEqual(EXIT_CONTENT_ERROR | EXIT_SCHEMA_ERROR, 3);
  });
});

//////////////////////////////
// loadAndValidateAll — requires test data on disk

describe("loadAndValidateAll", () => {
  let tmpDir: string;
  let schemasDir: string;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vd-"));
    schemasDir = join(tmpDir, "common", "jsonSchemas");
    mkdirSync(schemasDir, { recursive: true });

    // Minimal band schema
    writeFileSync(join(schemasDir, "Band.json"), JSON.stringify({
      type: "object",
      properties: { bandNumber: { type: "string" }, scsList: { type: "array" } },
      required: ["bandNumber", "scsList"]
    }));

    // Minimal CA schema
    writeFileSync(join(schemasDir, "BandCombinationsCarrierAggregation.json"), JSON.stringify({
      type: "object",
      properties: { bcId: { type: "string" }, bcsList: { type: "array" } },
      required: ["bcId", "bcsList"]
    }));

    // Minimal DC schema
    writeFileSync(join(schemasDir, "BandCombinationsDualConnectivity.json"), JSON.stringify({
      type: "object",
      properties: { bcId: { type: "string" }, ulConfigList: { type: "array" } },
      required: ["bcId", "ulConfigList"]
    }));

    // Create a band file
    const bandDir = join(tmpDir, "bands");
    mkdirSync(bandDir);
    writeFileSync(join(bandDir, "n1.json"), JSON.stringify({
      bandNumber: "n1",
      scsList: [{ scs: 15, bandwidthList: [{ bw: 5, uplink: "mandatory", downlink: "mandatory" }] }]
    }));
  });

  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it("testSuccessExitCode", () => {
    const { exitCode } = loadAndValidateAll(tmpDir, true, true);
    assert.strictEqual(exitCode, EXIT_OK);
  });

  it("testSkipBothValidations", () => {
    const { exitCode, db } = loadAndValidateAll(tmpDir, true, true);
    assert.strictEqual(exitCode, EXIT_OK);
    assert.strictEqual(db.chBwList.data.size, 1);
  });

  it("testSchemaErrorExitCode", () => {
    // Create a band file that violates the schema (missing required scsList)
    const badDir = join(tmpDir, "badbands");
    mkdirSync(badDir);
    writeFileSync(join(badDir, "n99.json"), JSON.stringify({ bandNumber: "n99" }));

    const { exitCode } = loadAndValidateAll(tmpDir, true, false, false);
    assert.strictEqual(exitCode & EXIT_SCHEMA_ERROR, EXIT_SCHEMA_ERROR);

    rmSync(badDir, { recursive: true, force: true });
  });

  it("testSchemaErrorAborts", () => {
    const badDir = join(tmpDir, "badbands2");
    mkdirSync(badDir);
    writeFileSync(join(badDir, "n98.json"), JSON.stringify({ bandNumber: "n98" }));

    assert.throws(
      () => loadAndValidateAll(tmpDir, true, false, true),
      { name: "SchemaValidationException" }
    );

    rmSync(badDir, { recursive: true, force: true });
  });

  it("testNonExistentRootThrows", () => {
    assert.throws(
      () => loadAndValidateAll("/nonexistent/path/xyz"),
      Error
    );
  });
});
