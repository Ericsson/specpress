// Test_BWC_ID.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BWC_ID, BWCValue, IsValidBwcCharacter, InvalidBwcIdException, bwcValuesFR1, bwcValuesFR2, compareBwcValues } from "../../../lib/ran4/BWC_ID.js";


describe("BWCValue", () => {
  it("testNrofCarriers", () => {
    const v = new BWCValue(2, 20, 100, [2, 3]);
    assert.strictEqual(v.nrofCarriers, 2);
  });

  it("testMinBW", () => {
    const v = new BWCValue(2, 20, 100);
    assert.strictEqual(v.minBW, 20);
  });

  it("testMaxBW", () => {
    const v = new BWCValue(2, 20, 100);
    assert.strictEqual(v.maxBW, 100);
  });

  it("testFallbackGroupDefault", () => {
    const v = new BWCValue(1, 0, 100);
    assert.deepStrictEqual(v.fallbackGroup, []);
  });

  it("testFallbackGroupExplicit", () => {
    const v = new BWCValue(1, 0, 100, [1, 2, 3]);
    assert.deepStrictEqual(v.fallbackGroup, [1, 2, 3]);
  });
});


describe("IsValidBwcCharacter", () => {
  it("testValidFR1", () => {
    assert.strictEqual(IsValidBwcCharacter("A", 1), true);
  });

  it("testValidFR2", () => {
    assert.strictEqual(IsValidBwcCharacter("G", 2), true);
  });

  it("testInvalidFR1", () => {
    assert.strictEqual(IsValidBwcCharacter("R2", 1), false);
  });

  it("testValidFR2Extended", () => {
    assert.strictEqual(IsValidBwcCharacter("R2", 2), true);
  });

  it("testValidEitherRange", () => {
    assert.strictEqual(IsValidBwcCharacter("A", 0), true);
  });

  it("testInvalidCharacter", () => {
    assert.strictEqual(IsValidBwcCharacter("Z", 0), false);
  });

  it("testFR1OnlyInFR2", () => {
    assert.strictEqual(IsValidBwcCharacter("N", 2), false);
  });

  it("testFR2OnlyInFR1", () => {
    assert.strictEqual(IsValidBwcCharacter("R12", 1), false);
  });
});


describe("BWC_ID", () => {
  // Simple single-character BWC_IDs
  it("testSingleCharA", () => {
    const bwc = new BWC_ID("A");
    assert.strictEqual(bwc.isValid, true);
    assert.strictEqual(bwc.getNrofNonContiguousCarriers(), 1);
  });

  it("testSingleCharC", () => {
    const bwc = new BWC_ID("C");
    assert.deepStrictEqual(bwc.getContGroups(), ["C"]);
  });

  // Multi-component BWC_IDs
  it("testTwoComponentAC", () => {
    const bwc = new BWC_ID("(A-C)");
    assert.strictEqual(bwc.getNrofNonContiguousCarriers(), 2);
    assert.deepStrictEqual(bwc.getContGroups(), ["A", "C"]);
  });

  it("testMultiplierTwoA", () => {
    const bwc = new BWC_ID("(2A)");
    assert.strictEqual(bwc.getNrofNonContiguousCarriers(), 2);
    assert.deepStrictEqual(bwc.getContGroups(), ["A", "A"]);
  });

  it("testMultiplierWithMixed", () => {
    const bwc = new BWC_ID("(2A-C)");
    assert.strictEqual(bwc.getNrofNonContiguousCarriers(), 3);
    assert.deepStrictEqual(bwc.getContGroups(), ["A", "A", "C"]);
  });

  it("testThreeComponents", () => {
    const bwc = new BWC_ID("(A-2G-O)");
    assert.strictEqual(bwc.getNrofNonContiguousCarriers(), 4);
    assert.deepStrictEqual(bwc.getContGroups(), ["A", "G", "G", "O"]);
  });

  // Invalid BWC_IDs
  it("testInvalidSingleChar", () => {
    assert.throws(() => new BWC_ID("Z"), InvalidBwcIdException);
  });

  it("testInvalidTooShort", () => {
    assert.throws(() => new BWC_ID("(A)"), InvalidBwcIdException);
  });

  it("testInvalidNoBrackets", () => {
    assert.throws(() => new BWC_ID("XY"), InvalidBwcIdException);
  });

  it("testInvalidWrongOrder", () => {
    assert.throws(() => new BWC_ID("(C-A)"), InvalidBwcIdException);
  });

  // Natural sort order for numbered BWC values
  it("testR9LessThanR10", () => {
    assert.strictEqual(new BWC_ID("R9").lessThan(new BWC_ID("R10")), true);
  });

  it("testR10LessThanR11", () => {
    assert.strictEqual(new BWC_ID("R10").lessThan(new BWC_ID("R11")), true);
  });

  it("testR12GreaterThanR9", () => {
    assert.strictEqual(new BWC_ID("R12").greaterThan(new BWC_ID("R9")), true);
  });

  it("testRLessThanR2", () => {
    assert.strictEqual(new BWC_ID("R").lessThan(new BWC_ID("R2")), true);
  });

  it("testSortOrderOfNumberedBwcValues", () => {
    const bwcs = ["R12", "R2", "R10", "R9", "R3", "R11"].map(s => new BWC_ID(s));
    bwcs.sort((a, b) => a.lessThan(b) ? -1 : a.equals(b) ? 0 : 1);
    assert.deepStrictEqual(bwcs.map(b => b.toString()), ["R2", "R3", "R9", "R10", "R11", "R12"]);
  });

  // Comparison operators
  it("testLessThanByCarrierCount", () => {
    assert.strictEqual(new BWC_ID("A").lessThan(new BWC_ID("(2A)")), true);
  });

  it("testLessThanByContStr", () => {
    assert.strictEqual(new BWC_ID("(2A)").lessThan(new BWC_ID("(A-C)")), true);
  });

  it("testGreaterThan", () => {
    assert.strictEqual(new BWC_ID("(A-C)").greaterThan(new BWC_ID("A")), true);
  });

  it("testEqual", () => {
    assert.strictEqual(new BWC_ID("A").equals(new BWC_ID("A")), true);
  });

  it("testLessOrEqual", () => {
    assert.strictEqual(new BWC_ID("A").lessOrEqual(new BWC_ID("A")), true);
    assert.strictEqual(new BWC_ID("A").lessOrEqual(new BWC_ID("(2A)")), true);
  });

  it("testGreaterOrEqual", () => {
    assert.strictEqual(new BWC_ID("(2A)").greaterOrEqual(new BWC_ID("A")), true);
    assert.strictEqual(new BWC_ID("A").greaterOrEqual(new BWC_ID("A")), true);
  });

  // String representation
  it("testStringEquality", () => {
    assert.strictEqual(new BWC_ID("(2A-C)").toString(), "(2A-C)");
  });

  it("testImmutability", () => {
    const bwc = new BWC_ID("A");
    assert.strictEqual(bwc.toString(), "A");
  });

  // getNrofCarriers tests
  it("testGetNrofCarriersSingleA_FR1", () => {
    const bwc = new BWC_ID("A");
    assert.strictEqual(bwc.getNrofCarriers(1), 1);
  });

  it("testGetNrofCarriersSingleC_FR1", () => {
    const bwc = new BWC_ID("C");
    assert.strictEqual(bwc.getNrofCarriers(1), 2);
  });

  it("testGetNrofCarriersSingleD_FR1", () => {
    const bwc = new BWC_ID("D");
    assert.strictEqual(bwc.getNrofCarriers(1), 3);
  });

  it("testGetNrofCarriersTwoA_FR1", () => {
    const bwc = new BWC_ID("(2A)");
    assert.strictEqual(bwc.getNrofCarriers(1), 2); // 1+1
  });

  it("testGetNrofCarriersTwoA_C_FR1", () => {
    const bwc = new BWC_ID("(2A-C)");
    assert.strictEqual(bwc.getNrofCarriers(1), 4); // 1+1+2
  });

  it("testGetNrofCarriersA_C_FR1", () => {
    const bwc = new BWC_ID("(A-C)");
    assert.strictEqual(bwc.getNrofCarriers(1), 3); // 1+2
  });

  it("testGetNrofCarriersA_2G_O_FR1", () => {
    const bwc = new BWC_ID("(A-2G-O)");
    assert.strictEqual(bwc.getNrofCarriers(1), 1 + 3 + 3 + 5); // A=1, G=3, G=3, O=5
  });

  it("testGetNrofCarriersSingleR2_FR2", () => {
    const bwc = new BWC_ID("R2");
    assert.strictEqual(bwc.getNrofCarriers(2), 2);
  });

  it("testGetNrofCarriersSingleR10_FR2", () => {
    const bwc = new BWC_ID("R10");
    assert.strictEqual(bwc.getNrofCarriers(2), 10);
  });

  it("testGetNrofCarriersAutoDetectFR1", () => {
    const bwc = new BWC_ID("(2A-C)");
    assert.strictEqual(bwc.getNrofCarriers(0), 4); // Should find in FR1
  });

  it("testGetNrofCarriersAutoDetectFR2", () => {
    const bwc = new BWC_ID("R10");
    assert.strictEqual(bwc.getNrofCarriers(0), 10); // Should find in FR2
  });
});


describe("compareBwcValues", () => {
  it("testLetterOnlyOrdering", () => {
    assert.strictEqual(compareBwcValues("A", "B") < 0, true);
    assert.strictEqual(compareBwcValues("B", "A") > 0, true);
  });

  it("testSameLetterEqual", () => {
    assert.strictEqual(compareBwcValues("A", "A"), 0);
  });

  it("testLetterBeforeLetterWithNumber", () => {
    assert.strictEqual(compareBwcValues("R", "R2") < 0, true);
  });

  it("testNumericSuffix", () => {
    assert.strictEqual(compareBwcValues("R9", "R10") < 0, true);
    assert.strictEqual(compareBwcValues("R10", "R9") > 0, true);
  });

  it("testDifferentLetterPrefix", () => {
    assert.strictEqual(compareBwcValues("R12", "S") < 0, true);
  });
});


describe("BwcTableContents", () => {
  it("testFR1HasExpectedKeys", () => {
    for (const key of ["A", "B", "C", "D", "E"]) {
      assert.ok(key in bwcValuesFR1);
    }
  });

  it("testFR2HasExpectedKeys", () => {
    for (const key of ["A", "B", "R2", "R12"]) {
      assert.ok(key in bwcValuesFR2);
    }
  });

  it("testFR1SingleCarrierA", () => {
    assert.strictEqual(bwcValuesFR1["A"].nrofCarriers, 1);
  });

  it("testFR2TwoCarrierB", () => {
    assert.strictEqual(bwcValuesFR2["B"].nrofCarriers, 2);
  });
});
