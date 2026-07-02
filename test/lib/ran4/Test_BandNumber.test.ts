// Test_BandNumber.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BandNumber, RAT, InvalidBandNumberException } from "../../../lib/ran4/BandNumber.js";


describe("BandNumber", () => {
  it("testNrBandFromString", () => {
    assert.strictEqual(+new BandNumber("n1"), 1);
  });

  it("testNrBandToString", () => {
    assert.strictEqual(new BandNumber("n1").toString(), "n1");
  });

  it("testNrBandRat", () => {
    assert.strictEqual(new BandNumber("n1").rat, RAT.NR);
  });

  it("testEutraBandFromString", () => {
    assert.strictEqual(+new BandNumber("1", RAT.EUTRA), 1);
  });

  it("testEutraBandToString", () => {
    assert.strictEqual(new BandNumber("1", RAT.EUTRA).toString(), "1");
  });

  it("testEutraBandRat", () => {
    assert.strictEqual(new BandNumber("1", RAT.EUTRA).rat, RAT.EUTRA);
  });

  it("testNoneRaisesException", () => {
    assert.throws(() => new BandNumber(null), Error);
  });

  it("testInvalidStringRaisesException", () => {
    assert.throws(() => new BandNumber("xyz"), InvalidBandNumberException);
  });

  it("testOutOfRangeRaisesException", () => {
    assert.throws(() => new BandNumber("n0"), InvalidBandNumberException);
  });

  it("testFr1Classification", () => {
    assert.strictEqual(new BandNumber("n1").isFr1(), true);
    assert.strictEqual(new BandNumber("n1").isFr2(), false);
  });

  it("testFr2Classification", () => {
    assert.strictEqual(new BandNumber("n257").isFr2(), true);
    assert.strictEqual(new BandNumber("n257").isFr1(), false);
  });

  it("testGetSpecificationFr1", () => {
    assert.strictEqual(new BandNumber("n1").getSpecification(), "38.101-1");
    assert.strictEqual(new BandNumber("n78").getSpecification(), "38.101-1");
  });

  it("testGetSpecificationFr2", () => {
    assert.strictEqual(new BandNumber("n257").getSpecification(), "38.101-2");
    assert.strictEqual(new BandNumber("n260").getSpecification(), "38.101-2");
  });
});
