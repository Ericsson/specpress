// Test_BC_ID.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BWC_ID } from "../../../lib/ran4/BWC_ID.js";
import { BandNumber, RAT } from "../../../lib/ran4/BandNumber.js";
import { BC_ID, SplitBandEntry, GetRatComponents, BcType, InvalidBcIdException } from "../../../lib/ran4/BC_ID.js";


////////////////////////////////////////////////////////////////
//                       SplitBandEntry                        //
////////////////////////////////////////////////////////////////

describe("SplitBandEntry", () => {
  it("testNrBand", () => {
    const [rat, bn, bwc] = SplitBandEntry("n1A");
    assert.strictEqual(rat, RAT.NR);
    assert.strictEqual(+bn, 1);
    assert.strictEqual(bwc.toString(), "A");
  });

  it("testEutraBand", () => {
    const [rat, bn, bwc] = SplitBandEntry("1A");
    assert.strictEqual(rat, RAT.EUTRA);
    assert.strictEqual(+bn, 1);
    assert.strictEqual(bwc.toString(), "A");
  });

  it("testEndcBand", () => {
    const [rat, bn, bwc] = SplitBandEntry("(n)3AA");
    assert.strictEqual(rat, BcType.ENDC);
    assert.strictEqual(+bn, 3);
    assert.strictEqual(bwc, "AA");
  });

  it("testNedcBand", () => {
    const [rat, bn, bwc] = SplitBandEntry("3(n)AA");
    assert.strictEqual(rat, BcType.NEDC);
    assert.strictEqual(+bn, 3);
    assert.strictEqual(bwc, "AA");
  });

  it("testMultiComponentBwc", () => {
    const [rat, bn, bwc] = SplitBandEntry("n78(2A-C)");
    assert.strictEqual(rat, RAT.NR);
    assert.strictEqual(+bn, 78);
    assert.strictEqual(bwc.toString(), new BWC_ID("(2A-C)").toString());
  });
});


////////////////////////////////////////////////////////////////
//                     GetRatComponents                        //
////////////////////////////////////////////////////////////////

describe("GetRatComponents", () => {
  it("testNone", () => {
    assert.deepStrictEqual(GetRatComponents(null), []);
  });

  it("testEmpty", () => {
    assert.deepStrictEqual(GetRatComponents(""), []);
  });

  it("testNrOnly", () => {
    assert.deepStrictEqual(GetRatComponents("n3A-n7C"), ["n3A-n7C"]);
  });

  it("testEndcOnly", () => {
    assert.deepStrictEqual(GetRatComponents("(n)3AA"), ["(n)3AA"]);
  });

  it("testNedcOnly", () => {
    assert.deepStrictEqual(GetRatComponents("3(n)AA"), ["3(n)AA"]);
  });

  it("testEutraAndEndc", () => {
    assert.deepStrictEqual(GetRatComponents("1A-(n)3AA"), ["1A", "(n)3AA"]);
  });

  it("testEutraEndcAndNr", () => {
    assert.deepStrictEqual(GetRatComponents("1A-(n)3AA-n8A-n77A"), ["1A", "(n)3AA", "n8A-n77A"]);
  });

  it("testMultiEutraAndEndc", () => {
    assert.deepStrictEqual(GetRatComponents("20A-67A-(n)3AA"), ["20A-67A", "(n)3AA"]);
  });

  it("testNrAndNedc", () => {
    assert.deepStrictEqual(GetRatComponents("n257A-3(n)AA"), ["n257A", "3(n)AA"]);
  });

  it("testNrNedcAndEutra", () => {
    assert.deepStrictEqual(GetRatComponents("n257A-3(n)AA-7A"), ["n257A", "3(n)AA", "7A"]);
  });

  it("testInterRatSeparator", () => {
    assert.deepStrictEqual(GetRatComponents("3A_n40B"), ["3A", "n40B"]);
  });

  it("testIntraBandMultiComponent", () => {
    assert.deepStrictEqual(GetRatComponents("n3(2C-D)"), ["n3(2C-D)"]);
  });

  it("testEutraMultiBand", () => {
    assert.deepStrictEqual(GetRatComponents("1A-3B"), ["1A-3B"]);
  });
});


////////////////////////////////////////////////////////////////
//                         BC_ID                               //
////////////////////////////////////////////////////////////////

describe("BC_ID", () => {
  // Equality and string representation
  it("testCaPrefixStripped", () => {
    assert.strictEqual(new BC_ID("CA_n3A-n7C").equals("n3A-n7C"), true);
  });

  it("testDcEndcParsing", () => {
    assert.strictEqual(new BC_ID("DC_1A-(n)3AA").equals("1A-(n)3AA"), true);
  });

  it("testDcMultiBandParsing", () => {
    assert.strictEqual(new BC_ID("DC_1A-(n)3AA-n8A-n77A").equals("1A-(n)3AA-n8A-n77A"), true);
  });

  it("testDcPrefix", () => {
    assert.strictEqual(new BC_ID("DC_1A-(n)3AA-n8A-n77A").getPrefix(), "DC_");
  });

  it("testDcBandNumbers", () => {
    const bands = new BC_ID("DC_1A-(n)3AA-n8A-n77A").getBandNumbers().map(b => +b);
    assert.deepStrictEqual(bands, [1, 3, 8, 77]);
  });

  it("testDcBwcIdsPerBand", () => {
    const bc = new BC_ID("DC_1A-(n)3AA-n8A-n77A");
    const bwcMap = bc.getBwcIDsPerBand();
    // EUTRA band 1 -> "A", NR band 3 -> "AA", NR band 8 -> "A", NR band 77 -> "A"
    assert.strictEqual(bwcMap.get("1")?.toString(), "A");
    assert.strictEqual(bwcMap.get("n3"), "AA");
    assert.strictEqual(bwcMap.get("n8")?.toString(), "A");
    assert.strictEqual(bwcMap.get("n77")?.toString(), "A");
  });

  it("testDcMultiEutra", () => {
    assert.strictEqual(new BC_ID("DC_20A-67A-(n)3AA").equals("20A-67A-(n)3AA"), true);
  });

  it("testDcFr2Nedc", () => {
    assert.strictEqual(new BC_ID("DC_n257A-3(n)AA").equals("n257A-3(n)AA"), true);
  });

  it("testDcNedcOnly", () => {
    assert.strictEqual(new BC_ID("DC_3(n)AA").equals("3(n)AA"), true);
  });

  it("testDcEndcOnly", () => {
    assert.strictEqual(new BC_ID("DC_(n)3AA").equals("(n)3AA"), true);
  });

  it("testDcDuplicateBand", () => {
    assert.strictEqual(new BC_ID("DC_1A-1A_n28A").equals("1A-1A_n28A"), true);
  });

  it("testDcInterRat", () => {
    assert.strictEqual(new BC_ID("DC_3A_n40B").equals("3A_n40B"), true);
  });

  // Comparison operators
  it("testSingleCarrierEquality", () => {
    assert.strictEqual(new BC_ID("CA_n7A").equals("n7A"), true);
  });

  it("testLessThanByBandNumber", () => {
    assert.strictEqual(new BC_ID("n1A").lessThan(new BC_ID("n7A")), true);
  });

  it("testGreaterThanByBwc", () => {
    assert.strictEqual(new BC_ID("CA_n1(2A)").greaterThan(new BC_ID("n1A")), true);
  });

  it("testLessThanIntraBandVsInterBand", () => {
    assert.strictEqual(new BC_ID("CA_n1(2A)").lessThan(new BC_ID("CA_n1A-n3A")), true);
  });

  it("testGreaterThanBySecondBand", () => {
    assert.strictEqual(new BC_ID("CA_n12A-n13A").greaterThan(new BC_ID("CA_n11A-n200A")), true);
  });

  it("testLessThanTwoBandsVsThreeBands", () => {
    assert.strictEqual(new BC_ID("CA_n30A-n31A").lessThan(new BC_ID("CA_n1A-n7A-n9A")), true);
  });

  it("testLessThanByBwcType", () => {
    assert.strictEqual(new BC_ID("CA_n1A-n3C").lessThan(new BC_ID("CA_n1A-n3(2A)")), true);
  });

  it("testLessThanByBwcComponents", () => {
    assert.strictEqual(new BC_ID("CA_n3(2C)").lessThan(new BC_ID("CA_n3(2C-D)")), true);
  });

  it("testGreaterThanOrEqual", () => {
    assert.strictEqual(new BC_ID("CA_n3(2C-D)").greaterOrEqual(new BC_ID("CA_n3(2C)")), true);
  });

  // Sort order with numbered BWC values
  it("testSortOrderWithNumberedBwc", () => {
    const ids = ["CA_n258R12", "CA_n258R2", "CA_n258R10", "CA_n258R9", "CA_n258R3"].map(s => new BC_ID(s));
    ids.sort((a, b) => a.lessThan(b) ? -1 : a.equals(b) ? 0 : 1);
    assert.deepStrictEqual(ids.map(b => b.toString()), ["CA_n258R2", "CA_n258R3", "CA_n258R9", "CA_n258R10", "CA_n258R12"]);
  });

  it("testR9BcLessThanR10Bc", () => {
    assert.strictEqual(new BC_ID("CA_n258R9").lessThan(new BC_ID("CA_n258R10")), true);
  });

  // Prefix detection
  it("testCaPrefix", () => {
    assert.strictEqual(new BC_ID("CA_n7C").getPrefix(), "CA_");
  });

  it("testDcPrefixFr2", () => {
    assert.strictEqual(new BC_ID("DC_n7C-n258G").getPrefix(), "DC_");
  });

  it("testImplicitCaPrefix", () => {
    assert.strictEqual(new BC_ID("n7C").getPrefix(), "CA_");
  });

  it("testImplicitCaPrefixMultiBand", () => {
    assert.strictEqual(new BC_ID("n7C-n258G").getPrefix(), "CA_");
  });

  it("testSingleCarrierNoPrefix", () => {
    assert.strictEqual(new BC_ID("n7A").getPrefix(), "");
  });

  // Copy construction
  it("testDcMultiBandEquality", () => {
    assert.strictEqual(new BC_ID("DC_n3A-n7A-n20A-n67A-n78(2A)").equals("n3A-n7A-n20A-n67A-n78(2A)"), true);
  });

  it("testDcMultiBandPrefix", () => {
    assert.strictEqual(new BC_ID("DC_n3A-n7A-n20A-n67A-n78(2A)").getPrefix(), "DC_");
  });

  it("testCopyConstructionEquality", () => {
    assert.strictEqual(new BC_ID(new BC_ID("DC_n3A-n7A-n20A-n67A-n78(2A)")).equals("n3A-n7A-n20A-n67A-n78(2A)"), true);
  });

  it("testCopyConstructionPrefix", () => {
    assert.strictEqual(new BC_ID(new BC_ID("DC_n3A-n7A-n20A-n67A-n78(2A)")).getPrefix(), "DC_");
  });

  // SUL
  it("testSulEquality", () => {
    assert.strictEqual(new BC_ID("DC_3A_SUL_n78A-n84A").equals("3A_n78A-n84A"), true);
  });

  it("testSulToString", () => {
    assert.strictEqual(new BC_ID("DC_3A_SUL_n78A-n84A").toString(), "DC_3A_SUL_n78A-n84A");
  });

  it("testSulDetection", () => {
    assert.strictEqual(new BC_ID("DC_3A_SUL_n78A-n84A").isSUL(), true);
  });

  it("testNonSulDetection", () => {
    assert.strictEqual(new BC_ID("DC_3A_n78A-n84A").isSUL(), false);
  });

  // getSpecification
  it("testSpecificationFr1NrCa", () => {
    assert.strictEqual(new BC_ID("CA_n1A-n78C").getSpecification(), "38.101-1");
  });

  it("testSpecificationFr1NrSingleCarrier", () => {
    assert.strictEqual(new BC_ID("n78A").getSpecification(), "38.101-1");
  });

  it("testSpecificationFr2NrCa", () => {
    assert.strictEqual(new BC_ID("CA_n257A-n258A").getSpecification(), "38.101-2");
  });

  it("testSpecificationFr1Fr2Mix", () => {
    assert.strictEqual(new BC_ID("CA_n1A-n257A").getSpecification(), "38.101-3");
  });

  it("testSpecificationEndc", () => {
    assert.strictEqual(new BC_ID("DC_1A_n78A").getSpecification(), "38.101-3");
  });

  it("testSpecificationNrDcFr1", () => {
    assert.strictEqual(new BC_ID("DC_n1A-n78A").getSpecification(), "38.101-1");
  });

  // getNrofCarriers tests
  it("testGetNrofCarriersSingleBand", () => {
    const bc = new BC_ID("CA_n1A");
    assert.strictEqual(bc.getNrofCarriers(), 1);
  });

  it("testGetNrofCarriersTwoBandsSingleCarrier", () => {
    const bc = new BC_ID("CA_n1A-n3A");
    assert.strictEqual(bc.getNrofCarriers(), 2); // 1+1
  });

  it("testGetNrofCarriersIntraBandContiguous", () => {
    const bc = new BC_ID("CA_n3B");
    assert.strictEqual(bc.getNrofCarriers(), 2); // B=2 contiguous
  });

  it("testGetNrofCarriersIntraBandC", () => {
    const bc = new BC_ID("CA_n3C");
    assert.strictEqual(bc.getNrofCarriers(), 2); // C=2
  });

  it("testGetNrofCarriersIntraBandD", () => {
    const bc = new BC_ID("CA_n3D");
    assert.strictEqual(bc.getNrofCarriers(), 3); // D=3
  });

  it("testGetNrofCarriersMultiplier", () => {
    const bc = new BC_ID("CA_n25(2A)");
    assert.strictEqual(bc.getNrofCarriers(), 2); // 2*1
  });

  it("testGetNrofCarriersComplexExample", () => {
    const bc = new BC_ID("CA_n25(2A)-n41(A-C)");
    assert.strictEqual(bc.getNrofCarriers(), 5); // 2*1 + 1 + 2
  });

  it("testGetNrofCarriersThreeBands", () => {
    const bc = new BC_ID("CA_n1A-n3C-n78B");
    assert.strictEqual(bc.getNrofCarriers(), 5); // 1 + 2 + 2
  });

  it("testGetNrofCarriersFR2", () => {
    const bc = new BC_ID("CA_n257A-n258R2");
    assert.strictEqual(bc.getNrofCarriers(), 3); // 1 + 2
  });

  it("testGetNrofCarriersFR2R10", () => {
    const bc = new BC_ID("CA_n258R10");
    assert.strictEqual(bc.getNrofCarriers(), 10);
  });

  it("testGetNrofCarriersMixedFR1FR2", () => {
    const bc = new BC_ID("CA_n1A-n257A");
    assert.strictEqual(bc.getNrofCarriers(), 2); // 1 + 1
  });

  it("testGetNrofCarriersDC", () => {
    const bc = new BC_ID("DC_1A_n78A");
    // EUTRA uses heuristic (count letters), NR uses proper counting
    assert.strictEqual(bc.getNrofCarriers(), 2); // 1 (heuristic) + 1
  });
});
