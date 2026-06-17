// Test_HtmlTable.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HtmlTable } from "../../../lib/ran4/HtmlTable.js";


describe("HtmlTableInit", () => {
  it("testInitialSize", () => {
    const t = new HtmlTable();
    assert.strictEqual(t.getNrofRows(), 1);
    assert.strictEqual(t.getNrofColumns(), 1);
  });

  it("testInitialValueEmpty", () => {
    const t = new HtmlTable();
    assert.strictEqual(t.getValue(0, 0), "");
  });
});


describe("HtmlTableSetGetValue", () => {
  it("testSetAndGet", () => {
    const t = new HtmlTable();
    t.setValue(0, 0, "hello");
    assert.strictEqual(t.getValue(0, 0), "hello");
  });

  it("testExpandColumns", () => {
    const t = new HtmlTable();
    t.setValue(0, 3, "far right");
    assert.strictEqual(t.getNrofColumns(), 4);
    assert.strictEqual(t.getValue(0, 3), "far right");
    assert.strictEqual(t.getValue(0, 1), "");
  });

  it("testExpandRows", () => {
    const t = new HtmlTable();
    t.setValue(5, 0, "deep");
    assert.strictEqual(t.getNrofRows(), 6);
    assert.strictEqual(t.getValue(5, 0), "deep");
    assert.strictEqual(t.getValue(3, 0), "");
  });

  it("testExpandBoth", () => {
    const t = new HtmlTable();
    t.setValue(2, 2, "corner");
    assert.strictEqual(t.getNrofRows(), 3);
    assert.strictEqual(t.getNrofColumns(), 3);
    assert.strictEqual(t.getValue(2, 2), "corner");
  });

  it("testGetValueOutOfBounds", () => {
    const t = new HtmlTable();
    assert.strictEqual(t.getValue(10, 10), null);
  });

  it("testNegativeRowRaises", () => {
    const t = new HtmlTable();
    assert.throws(() => t.setValue(-1, 0, "bad"), RangeError);
  });

  it("testNegativeColRaises", () => {
    const t = new HtmlTable();
    assert.throws(() => t.setValue(0, -1, "bad"), RangeError);
  });

  it("testValueConvertedToString", () => {
    const t = new HtmlTable();
    t.setValue(0, 0, 42);
    assert.strictEqual(t.getValue(0, 0), "42");
  });
});


describe("HtmlTableStr", () => {
  it("testStrRepresentation", () => {
    const t = new HtmlTable();
    t.setValue(1, 2, "x");
    assert.strictEqual(t.toString(), "HtmlTable[2|3]");
  });
});


describe("HtmlTableDump", () => {
  let tmpDir: string;

  before(() => { tmpDir = mkdtempSync(join(tmpdir(), "html-")); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it("testDumpCreatesFile", () => {
    const t = new HtmlTable();
    t.setValue(0, 0, "Header");
    t.setValue(1, 0, "Data");
    const filePath = join(tmpDir, "test1.html");
    t.dump(filePath);
    const content = readFileSync(filePath, "utf-8");
    assert.ok(content.includes("<table>"));
    assert.ok(content.includes("Header"));
    assert.ok(content.includes("Data"));
    assert.ok(content.includes("<!DOCTYPE html>"));
  });

  it("testDumpWithoutCompleteHtml", () => {
    const t = new HtmlTable();
    t.setValue(0, 0, "H");
    const filePath = join(tmpDir, "test2.html");
    t.dump(filePath, "  ", false);
    const content = readFileSync(filePath, "utf-8");
    assert.ok(!content.includes("<!DOCTYPE html>"));
    assert.ok(content.includes("<table>"));
  });

  it("testDumpInvalidExtensionRaises", () => {
    const t = new HtmlTable();
    assert.throws(() => t.dump("test.txt"), Error);
  });

  it("testDumpNonExistentPathRaises", () => {
    const t = new HtmlTable();
    assert.throws(() => t.dump("C:/nonexistent_path_xyz_abc/test.html"), Error);
  });

  it("testRowSpanMerging", () => {
    const t = new HtmlTable();
    t.setValue(0, 0, "Header");
    t.setValue(1, 0, "Merged");
    t.setValue(2, 0, "");
    t.setValue(3, 0, "Next");
    const filePath = join(tmpDir, "test3.html");
    t.dump(filePath);
    const content = readFileSync(filePath, "utf-8");
    assert.ok(content.includes("rowSpan=2"));
  });
});
