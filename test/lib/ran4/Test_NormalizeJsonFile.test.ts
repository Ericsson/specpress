// Test_NormalizeJsonFile.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { normalizeJsonFile } from "../../../lib/ran4/Utils.js";

describe("normalizeJsonFile", () => {
  let tmpDir: string;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "norm-"));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("normalizes a CA band combination file", async () => {
    const file = join(tmpDir, "CA_n1A-n78C.json");
    writeFileSync(file, JSON.stringify({
      bcId: "CA_n1A-n78C",
      bcsList: [{ bcsId: 0, bandList: [
        { bandNumber: 1, contCarrierGroups: [[[[20]]]] },
        { bandNumber: 78, contCarrierGroups: [[[[100], [100], [100]]]] }
      ]}]
    }));

    const result = await normalizeJsonFile(file);
    assert.strictEqual(result, file);

    const content = readFileSync(file, "utf8");
    assert.ok(content.includes('"bcId"'), "output contains bcId");
    assert.ok(content.includes('"bcsList"'), "output contains bcsList");
  });

  it("normalizes a Band (channel bandwidth) file", async () => {
    const file = join(tmpDir, "n78.json");
    writeFileSync(file, JSON.stringify({
      bandNumber: "n78",
      scsList: [{
        scs: 30,
        bandwidthList: [{ bw: 20, uplink: true, downlink: true }]
      }]
    }));

    const result = await normalizeJsonFile(file);
    assert.strictEqual(result, file);

    const content = readFileSync(file, "utf8");
    assert.ok(content.includes('"bandNumber"'), "output contains bandNumber");
    assert.ok(content.includes('"scsList"'), "output contains scsList");
  });

  it("normalizes a DC configuration file", async () => {
    const file = join(tmpDir, "DC_1A-n78A.json");
    writeFileSync(file, JSON.stringify({
      bcId: "DC_1A-n78A",
      ulConfigList: [{ bcId: "CA_1A" }, { bcId: "CA_n78A" }]
    }));

    const result = await normalizeJsonFile(file);
    assert.strictEqual(result, file);

    const content = readFileSync(file, "utf8");
    assert.ok(content.includes('"bcId"'), "output contains bcId");
    assert.ok(content.startsWith('{\n'), "output is formatted with newlines");
  });

  it("throws on invalid JSON file", async () => {
    const file = join(tmpDir, "invalid.json");
    writeFileSync(file, '{ not valid json }');

    await assert.rejects(() => normalizeJsonFile(file));
  });

  it("throws on non-existent file", async () => {
    await assert.rejects(() => normalizeJsonFile(join(tmpDir, "nope.json")));
  });
});
