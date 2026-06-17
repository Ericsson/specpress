// Test_Utils.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FindAll, IsInt, listToString, BaseClass, KEYS } from "../../../lib/ran4/Utils.js";
import { RAN4JsonEncoder } from "../../../lib/ran4/JsonTools.js";

// Concrete subclass for testing abstract BaseClass
class ConcreteBase extends BaseClass {
  validate(): void {}
  getTag(): string { return ""; }
  toJSON(_anEncoder: RAN4JsonEncoder, _aLevel: number): void {}
}

class GrandParent extends BaseClass {
  validate(): void {}
  getTag(): string { return "GP"; }
  toJSON(_anEncoder: RAN4JsonEncoder, _aLevel: number): void {}
}


describe("FindAll", () => {
  it("testFindAllWithOffset", () => {
    assert.deepStrictEqual(FindAll("abababa", "aba", 1), [2, 4]);
  });

  it("testFindAllFromStart", () => {
    assert.deepStrictEqual(FindAll("abababa", "aba"), [0, 2, 4]);
  });

  it("testFindAllNoMatch", () => {
    assert.deepStrictEqual(FindAll("abababa", "ze"), []);
  });

  it("testFindAllSubstringLongerThanString", () => {
    assert.deepStrictEqual(FindAll("abababa", "zvt3w5tvw45te"), []);
  });

  it("testFindAllNoneSubstring", () => {
    assert.deepStrictEqual(FindAll("abababa", null), []);
  });

  it("testFindAllEmptySubstring", () => {
    assert.deepStrictEqual(FindAll("abababa", ""), []);
  });

  it("testFindAllEmptyString", () => {
    assert.deepStrictEqual(FindAll("", "zvt3w5tvw45te"), []);
  });

  it("testFindAllNoneString", () => {
    assert.deepStrictEqual(FindAll(null, "zvt3w5tvw45te"), []);
  });
});


describe("IsInt", () => {
  it("testIntValue", () => {
    assert.strictEqual(IsInt(42), true);
  });

  it("testIntZero", () => {
    assert.strictEqual(IsInt(0), true);
  });

  it("testStringInteger", () => {
    assert.strictEqual(IsInt("123"), true);
  });

  it("testStringFloat", () => {
    assert.strictEqual(IsInt("3.14"), false);
  });

  it("testStringWholeFloat", () => {
    assert.strictEqual(IsInt("5.0"), false);
  });

  it("testNonNumericString", () => {
    assert.strictEqual(IsInt("abc"), false);
  });

  it("testEmptyString", () => {
    assert.strictEqual(IsInt(""), false);
  });

  it("testNegativeInt", () => {
    assert.strictEqual(IsInt(-5), true);
  });
});


describe("listToString", () => {
  it("testSimpleList", () => {
    assert.strictEqual(listToString([1, 2, 3]), "1, 2, 3");
  });

  it("testStringList", () => {
    assert.strictEqual(listToString(["a", "b"]), "a, b");
  });

  it("testEmptyList", () => {
    assert.strictEqual(listToString([]), "");
  });

  it("testSingleElement", () => {
    assert.strictEqual(listToString([42]), "42");
  });
});


describe("BaseClass", () => {
  it("testGetParentNone", () => {
    const obj = new ConcreteBase();
    assert.strictEqual(obj.getParent(), null);
  });

  it("testGetParentDirect", () => {
    const parent = new ConcreteBase();
    const child = new ConcreteBase(parent);
    assert.strictEqual(child.getParent(), parent);
  });

  it("testGetParentByType", () => {
    const grandparent = new ConcreteBase();
    const parent = new ConcreteBase(grandparent);
    const child = new ConcreteBase(parent);
    assert.strictEqual(child.getParent(ConcreteBase), parent);
  });

  it("testGetParentByTypeTraversal", () => {
    const gp = new GrandParent();
    const parent = new ConcreteBase(gp);
    const child = new ConcreteBase(parent);
    assert.strictEqual(child.getParent(GrandParent), gp);
  });

  it("testGetParentByTypeMissing", () => {
    const parent = new ConcreteBase();
    const child = new ConcreteBase(parent);
    // Use a class that no parent is an instance of
    assert.strictEqual(child.getParent(GrandParent), null);
  });

  it("testGetDescriptor", () => {
    const parent = new ConcreteBase();
    const child = new ConcreteBase(parent);
    const desc = child.getDescriptor();
    assert.ok(desc.includes("ConcreteBase"));
  });

  it("testGetDescriptorMaxLevels", () => {
    const parent = new ConcreteBase();
    const child = new ConcreteBase(parent);
    const desc = child.getDescriptor(1);
    const count = (desc.match(/ConcreteBase/g) || []).length;
    assert.strictEqual(count, 1);
  });
});


describe("KEYS", () => {
  it("testKeysExist", () => {
    assert.strictEqual(KEYS.scs, "scs");
    assert.strictEqual(KEYS.bandNumber, "bandNumber");
    assert.strictEqual(KEYS.bcId, "bcId");
    assert.strictEqual(KEYS.bcsList, "bcsList");
    assert.strictEqual(KEYS.bcsId, "bcsId");
  });
});
