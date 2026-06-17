// Test_JsonTools.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  RAN4JsonEncoder, LoadJsonFileToDict, GetAllJsonFilesInFolder,
  ValidateSchema, LoadSchema, InvalidJsonIndentationLevelException, JsonObject
} from "../../../lib/ran4/JsonTools.js";


describe("LoadJsonFileToDict", () => {
  let tmpDir: string;

  before(() => { tmpDir = mkdtempSync(join(tmpdir(), "jt-")); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it("testLoadFromFile", () => {
    const p = join(tmpDir, "test1.json");
    writeFileSync(p, JSON.stringify({ key: "value" }));
    const result = LoadJsonFileToDict(p);
    assert.deepStrictEqual(result, { key: "value" });
  });

  it("testNoneRaisesException", () => {
    assert.throws(() => LoadJsonFileToDict(null), Error);
  });

  it("testInvalidJsonRaisesException", () => {
    const p = join(tmpDir, "bad.json");
    writeFileSync(p, "not valid json {{{");
    assert.throws(() => LoadJsonFileToDict(p), Error);
  });
});


describe("GetAllJsonFilesInFolder", () => {
  let tmpDir: string;

  before(() => { tmpDir = mkdtempSync(join(tmpdir(), "jt-")); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it("testFindsJsonFiles", () => {
    writeFileSync(join(tmpDir, "a.json"), "{}");
    writeFileSync(join(tmpDir, "b.json"), "{}");
    writeFileSync(join(tmpDir, "c.txt"), "{}");
    const result = GetAllJsonFilesInFolder(tmpDir);
    assert.strictEqual(result.length, 2);
  });

  it("testNonExistentPathRaisesException", () => {
    assert.throws(() => GetAllJsonFilesInFolder("nonexistent_path_xyz"), Error);
  });

  it("testEmptyFolder", () => {
    const emptyDir = join(tmpDir, "empty");
    mkdirSync(emptyDir);
    const result = GetAllJsonFilesInFolder(emptyDir);
    assert.strictEqual(result.length, 0);
  });
});


describe("ValidateSchema", () => {
  it("testNoneSchemaSkipsValidation", () => {
    ValidateSchema({ key: "value" }, null, "test");
  });

  it("testValidDataPassesValidation", () => {
    const schemaFile = join(tmpdir(), "test_schema.json");
    writeFileSync(schemaFile, JSON.stringify({ type: "object", properties: { key: { type: "string" } } }));
    const compiled = LoadSchema(schemaFile);
    ValidateSchema({ key: "value" }, compiled, "test");
    rmSync(schemaFile);
  });
});


describe("RAN4JsonEncoder", () => {
  let tmpDir: string;
  let fileCounter = 0;

  before(() => { tmpDir = mkdtempSync(join(tmpdir(), "enc-")); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function makePath(): string {
    return join(tmpDir, `test${fileCounter++}.json`);
  }

  function writeAndRead(writeFunc: (enc: RAN4JsonEncoder) => void): string {
    const p = makePath();
    const enc = new RAN4JsonEncoder(p);
    writeFunc(enc);
    enc.flush();
    return readFileSync(p, "utf-8");
  }

  it("testWriteString", () => {
    const result = writeAndRead(enc => enc.write("hello\n", 0));
    assert.strictEqual(result, "hello\n");
  });

  it("testWriteWithIndentation", () => {
    const result = writeAndRead(enc => enc.write("hello\n", 1));
    assert.strictEqual(result, "  hello\n");
  });

  it("testNegativeLevelRaisesException", () => {
    const p = makePath();
    const enc = new RAN4JsonEncoder(p);
    assert.throws(() => enc.write("test", -1), InvalidJsonIndentationLevelException);
    enc.flush();
  });

  it("testWriteKeyAndValueString", () => {
    const result = writeAndRead(enc => enc.writeKeyAndValue("name", "test", 0));
    assert.ok(result.includes('"name": "test"'));
  });

  it("testWriteKeyAndValueInt", () => {
    const result = writeAndRead(enc => enc.writeKeyAndValue("count", 42, 0));
    assert.ok(result.includes('"count": 42'));
  });

  it("testWriteKeyAndValueBool", () => {
    const result = writeAndRead(enc => enc.writeKeyAndValue("flag", true, 0));
    assert.ok(result.includes('"flag": true'));
  });

  it("testWriteKeyAndValueFloat", () => {
    const result = writeAndRead(enc => enc.writeKeyAndValue("val", 3.14, 0));
    assert.ok(result.includes('"val": 3.14'));
  });

  it("testWriteValueList", () => {
    const result = writeAndRead(enc => enc.writeValue([1, 2, 3], 0));
    assert.ok(result.includes("[1, 2, 3]"));
  });

  it("testWriteValueDict", () => {
    const result = writeAndRead(enc => enc.writeValue({ a: 1 }, 0));
    assert.ok(result.includes('"a": 1'));
  });

  it("testWriteEmptyStringIgnored", () => {
    const result = writeAndRead(enc => { enc.write("", 0); enc.write("hello\n", 0); });
    assert.strictEqual(result, "hello\n");
  });

  it("testWriteNoneIgnored", () => {
    const result = writeAndRead(enc => { enc.write(null, 0); enc.write("hello\n", 0); });
    assert.strictEqual(result, "hello\n");
  });

  it("testNoneFileRaisesException", () => {
    assert.throws(() => new RAN4JsonEncoder(null), Error);
  });
});


describe("JsonObject", () => {
  it("testAbstractToJsonRaises", () => {
    // Create a concrete subclass that doesn't override toJSON
    class Dummy extends JsonObject {
      toJSON(_anEncoder: RAN4JsonEncoder, _aLevel: number): void {
        throw new Error("not implemented");
      }
    }
    const obj = new Dummy();
    assert.throws(() => obj.toJSON(null as unknown as RAN4JsonEncoder, 0), Error);
  });
});
