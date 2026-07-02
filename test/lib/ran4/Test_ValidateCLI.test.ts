// Test_ValidateCLI.test.ts — Tests for CLI argument parsing in validate.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../../../lib/ran4/ValidateData.js";

//////////////////////////////
// parseArgs tests

describe("parseArgs", () => {
  it("testRootFolderOnly", () => {
    const opts = parseArgs(["node", "script", "/some/path"]);
    assert.notStrictEqual(opts, null);
    assert.strictEqual(opts!.rootFolder, "/some/path");
    assert.strictEqual(opts!.skipValidation, false);
    assert.strictEqual(opts!.skipSchema, false);
    assert.strictEqual(opts!.noAbort, false);
    assert.strictEqual(opts!.outputFile, null);
  });

  it("testAllFlags", () => {
    const opts = parseArgs(["node", "script", "--skip-validation", "--skip-schema", "--no-abort", "/root"]);
    assert.notStrictEqual(opts, null);
    assert.strictEqual(opts!.rootFolder, "/root");
    assert.strictEqual(opts!.skipValidation, true);
    assert.strictEqual(opts!.skipSchema, true);
    assert.strictEqual(opts!.noAbort, true);
  });

  it("testOutputFlag", () => {
    const opts = parseArgs(["node", "script", "--output", "out.txt", "/root"]);
    assert.notStrictEqual(opts, null);
    assert.strictEqual(opts!.outputFile, "out.txt");
    assert.strictEqual(opts!.rootFolder, "/root");
  });

  it("testOutputFlagAfterRoot", () => {
    const opts = parseArgs(["node", "script", "/root", "--output", "out.txt"]);
    assert.notStrictEqual(opts, null);
    assert.strictEqual(opts!.outputFile, "out.txt");
    assert.strictEqual(opts!.rootFolder, "/root");
  });

  it("testMissingRootReturnsNull", () => {
    const opts = parseArgs(["node", "script", "--skip-schema"]);
    assert.strictEqual(opts, null);
  });

  it("testEmptyArgsReturnsNull", () => {
    const opts = parseArgs(["node", "script"]);
    assert.strictEqual(opts, null);
  });

  it("testOutputValueNotTreatedAsRoot", () => {
    const opts = parseArgs(["node", "script", "--output", "log.txt"]);
    assert.strictEqual(opts, null);
  });
});
