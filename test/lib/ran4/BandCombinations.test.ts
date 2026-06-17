// BandCombinations.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KEYS, UnsupportedKeyException, DuplicateEntryException } from "../../../lib/ran4/Utils.js";
import { BandNumber } from "../../../lib/ran4/BandNumber.js";
import { MissingBandNumberException } from "../../../lib/ran4/ChannelBandwidthPerBand.js";
import {
    BCS_ID, InvalidBcsIdException,
    Carrier, InvalidCarrierBandwidthException,
    BandEntry,
    BCS, DuplicateBandEntryException,
    BC, MissingBcIdException, MissingBcsListException, DuplicateBcsException, InvalidSpecificationException,
    BandCombinationList, NoBandCombinationsException,
    RefComponent, UlConfig,
} from "../../../lib/ran4/BandCombinations.js";

////////////////////////////////////////////////////////////////
//                         BCS_ID                             //
////////////////////////////////////////////////////////////////

describe("TestBcsId", () => {
    it("testFromInt", () => {
        assert.equal(+new BCS_ID(0), 0);
    });
    it("testFromString", () => {
        assert.equal(+new BCS_ID("5"), 5);
    });
    it("testFromBcsPrefix", () => {
        assert.equal(+new BCS_ID("BCS3"), 3);
    });
    it("testMaxValue", () => {
        assert.equal(+new BCS_ID(31), 31);
    });
    it("testNoneRaises", () => {
        assert.throws(() => new BCS_ID(null as unknown as number), InvalidBcsIdException);
    });
    it("testNegativeRaises", () => {
        assert.throws(() => new BCS_ID(-1), InvalidBcsIdException);
    });
    it("testTooLargeRaises", () => {
        assert.throws(() => new BCS_ID(32), InvalidBcsIdException);
    });
    it("testNonIntStringRaises", () => {
        assert.throws(() => new BCS_ID("abc"), InvalidBcsIdException);
    });
});

////////////////////////////////////////////////////////////////
//                         Carrier                            //
////////////////////////////////////////////////////////////////

describe("TestCarrier", () => {
    it("testFromIntList", () => {
        const c = new Carrier([10, 20, 40]);
        assert.deepEqual(c.bwList, [10, 20, 40]);
    });
    it("testFromSingleInt", () => {
        const c = new Carrier([100]);
        assert.deepEqual(c.bwList, [100]);
    });
    it("testBandNumberReference", () => {
        const c = new Carrier(["n77"]);
        assert.equal(c.bwList.length, 1);
        assert.equal(String(c.bwList[0]), "n77");
    });
    it("testInvalidBandwidthRaises", () => {
        assert.throws(() => new Carrier(["not_a_number"]), InvalidCarrierBandwidthException);
    });
    it("testNegativeBandwidthRaises", () => {
        assert.throws(() => new Carrier([-5]), InvalidCarrierBandwidthException);
    });
    it("testCopyConstruction", () => {
        const original = new Carrier([10, 20]);
        const copy = new Carrier(original);
        assert.deepEqual(copy.bwList, [10, 20]);
    });
    it("testStringRepresentation", () => {
        const c = new Carrier([10, 20]);
        assert.equal(String(c), "[10,20]");
    });
    it("testBandNumberStringRepresentation", () => {
        const c = new Carrier(["n3"]);
        assert.ok(String(c).includes("n3"));
    });
});

////////////////////////////////////////////////////////////////
//                       BandEntry                            //
////////////////////////////////////////////////////////////////

describe("TestBandEntry", () => {
    it("testFromDictWithNonContCarriers", () => {
        const d = {
            [KEYS.bandNumber]: "n1",
            [KEYS.nonContiguousCarriers]: [[10, 20]],
        };
        const be = new BandEntry(d);
        assert.equal(be.bandNumber!.asInt(), 1);
        assert.equal(be.nonContiguousCarriers.length, 1);
    });
    it("testFromDictWithMaxAggBw", () => {
        const d = {
            [KEYS.bandNumber]: "n78",
            [KEYS.nonContiguousCarriers]: [[100]],
            [KEYS.maxAggBwPerBand]: 200,
        };
        const be = new BandEntry(d);
        assert.equal(be.maxAggBwPerBand, 200);
    });
    it("testCopyConstruction", () => {
        const d = {
            [KEYS.bandNumber]: "n3",
            [KEYS.nonContiguousCarriers]: [[10, 20], [40]],
        };
        const original = new BandEntry(d);
        const copy = new BandEntry(original);
        assert.equal(copy.bandNumber!.asInt(), original.bandNumber!.asInt());
        assert.equal(copy.nonContiguousCarriers.length, 2);
    });
    it("testMissingBandNumberValidationFails", () => {
        const be = new BandEntry({ [KEYS.nonContiguousCarriers]: [[10]] });
        assert.throws(() => be.validate(), MissingBandNumberException);
    });
    it("testUnsupportedKeyRaises", () => {
        assert.throws(
            () => new BandEntry({ [KEYS.bandNumber]: "n1", unknownKey: 42 }),
            UnsupportedKeyException
        );
    });
    it("testFromDictWithReferencedComponents", () => {
        const d = {
            [KEYS.bandNumber]: "n78",
            [KEYS.referencedComponents]: [
                { [KEYS.bcId]: "CA_n78(2A)", [KEYS.bcsId]: 0 },
            ],
        };
        const be = new BandEntry(d);
        assert.equal(be.referencedComponents.length, 1);
    });
    it("testContiguousCarriersFromContCarrierGroups", () => {
        const d = {
            [KEYS.bandNumber]: "n78",
            [KEYS.contCarrierGroups]: [
                [[[100], [100]]],
            ],
        };
        const be = new BandEntry(d);
        assert.equal(be.contiguousCarriers.length, 1);
        assert.equal(be.contiguousCarriers[0].getNrofCarriers(), 2);
    });
});

////////////////////////////////////////////////////////////////
//                       RefComponent                         //
////////////////////////////////////////////////////////////////

describe("TestRefComponent", () => {
    it("testFromDictWithBcId", () => {
        const d = { [KEYS.bcId]: "CA_n78(2A)", [KEYS.bcsId]: 0 };
        const rc = new RefComponent(d);
        assert.ok(rc.bcId!.equals("n78(2A)"));
        assert.equal(+rc.bcsId, 0);
    });
    it("testFromDictWithBandNumber", () => {
        const d = { [KEYS.bandNumber]: "n77" };
        const rc = new RefComponent(d);
        assert.equal(rc.bandNumber!.toString(), "n77");
        assert.equal(rc.bcId, null);
    });
    it("testCopyConstruction", () => {
        const d = { [KEYS.bcId]: "CA_n78(2A)", [KEYS.bcsId]: 1 };
        const original = new RefComponent(d);
        const copy = new RefComponent(original);
        assert.equal(String(copy.bcId), String(original.bcId));
        assert.equal(+copy.bcsId, +original.bcsId);
    });
    it("testStringWithBcsId", () => {
        const d = { [KEYS.bcId]: "CA_n78(2A)", [KEYS.bcsId]: 0 };
        const rc = new RefComponent(d);
        assert.ok(String(rc).includes("n78(2A)"));
        assert.ok(String(rc).includes("BCS0"));
    });
    it("testStringWithBandNumber", () => {
        const d = { [KEYS.bandNumber]: "n77" };
        const rc = new RefComponent(d);
        assert.equal(String(rc), "n77");
    });
    it("testUnsupportedKeyRaises", () => {
        assert.throws(() => new RefComponent({ unknownKey: 42 }), UnsupportedKeyException);
    });
});

////////////////////////////////////////////////////////////////
//                         UlConfig                           //
////////////////////////////////////////////////////////////////

describe("TestUlConfig", () => {
    it("testFromDictWithBandNumber", () => {
        const d = { [KEYS.bandNumber]: "n1" };
        const ul = new UlConfig(d);
        assert.equal(ul.bandNumber!.asInt(), 1);
        assert.equal(ul.bcId, null);
    });
    it("testFromDictWithSingleCarrierBcId", () => {
        const d = { [KEYS.bcId]: "CA_n1A" };
        const ul = new UlConfig(d);
        assert.equal(ul.bandNumber!.asInt(), 1);
        assert.equal(ul.bcId, null);
    });
    it("testFromDictWithMultiCarrierBcId", () => {
        const d = { [KEYS.bcId]: "CA_n78(2A)" };
        const ul = new UlConfig(d);
        assert.notEqual(ul.bcId, null);
        assert.equal(ul.bandNumber, null);
    });
    it("testCopyConstruction", () => {
        const original = new UlConfig({ [KEYS.bandNumber]: "n3" });
        const copy = new UlConfig(original);
        assert.equal(copy.bandNumber!.asInt(), original.bandNumber!.asInt());
    });
    it("testWithNotes", () => {
        const d = { [KEYS.bandNumber]: "n1", [KEYS.notes]: { note1: "text" } };
        const ul = new UlConfig(d);
        assert.equal(ul.notes["note1"], "text");
    });
});

////////////////////////////////////////////////////////////////
//                           BCS                              //
////////////////////////////////////////////////////////////////

describe("TestBCS", () => {
    it("testFromDict", () => {
        const d = {
            [KEYS.bcsId]: 0,
            [KEYS.bandList]: [
                { [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10, 20]] },
                { [KEYS.bandNumber]: "n3", [KEYS.nonContiguousCarriers]: [[40]] },
            ],
        };
        const bcs = new BCS(d);
        assert.equal(+bcs.bcsId, 0);
        assert.equal(bcs.bandList.length, 2);
    });
    it("testWithUlConfigList", () => {
        const d = {
            [KEYS.bcsId]: 1,
            [KEYS.bandList]: [{ [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] }],
            [KEYS.ulConfigList]: [{ [KEYS.bandNumber]: "n1" }],
        };
        const bcs = new BCS(d);
        assert.equal(bcs.ulConfigList.length, 1);
    });
    it("testDuplicateBandEntryRaises", () => {
        const d = {
            [KEYS.bcsId]: 0,
            [KEYS.bandList]: [
                { [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] },
                { [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[20]] },
            ],
        };
        assert.throws(() => new BCS(d), DuplicateBandEntryException);
    });
    it("testHasBandEntry", () => {
        const d = {
            [KEYS.bcsId]: 0,
            [KEYS.bandList]: [{ [KEYS.bandNumber]: "n78", [KEYS.nonContiguousCarriers]: [[100]] }],
        };
        const bcs = new BCS(d);
        assert.ok(bcs.hasBandEntry(new BandNumber("n78")));
        assert.ok(!bcs.hasBandEntry(new BandNumber("n1")));
    });
});

////////////////////////////////////////////////////////////////
//                            BC                              //
////////////////////////////////////////////////////////////////

describe("TestBC", () => {
    function makeSimpleBC(bcId: string = "CA_n1A-n3A"): BC {
        return new BC({
            [KEYS.bcId]: bcId,
            [KEYS.bcsList]: [{
                [KEYS.bcsId]: 0,
                [KEYS.bandList]: [
                    { [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] },
                    { [KEYS.bandNumber]: "n3", [KEYS.nonContiguousCarriers]: [[20]] },
                ],
            }],
        });
    }

    it("testFromDict", () => {
        const bc = makeSimpleBC();
        assert.ok(bc.bcId!.equals("n1A-n3A"));
        assert.equal(bc.bcsList.length, 1);
    });
    it("testHasBCS", () => {
        const bc = makeSimpleBC();
        assert.ok(bc.hasBCS(new BCS_ID(0)));
        assert.ok(!bc.hasBCS(new BCS_ID(1)));
    });
    it("testMissingBcIdValidationFails", () => {
        const bc = new BC({ [KEYS.bcsList]: [{ [KEYS.bcsId]: 0, [KEYS.bandList]: [{ [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] }] }] });
        // bcId is null since we didn't provide it — but BC constructor requires bcId key, so let's force it
        bc.bcId = null;
        assert.throws(() => bc.validate(), MissingBcIdException);
    });
    it("testEmptyBcsListValidationFails", () => {
        const bc = makeSimpleBC();
        bc.bcsList = [];
        assert.throws(() => bc.validate(), MissingBcsListException);
    });
    it("testDuplicateBcsRaises", () => {
        assert.throws(() => new BC({
            [KEYS.bcId]: "CA_n1A-n3A",
            [KEYS.bcsList]: [
                { [KEYS.bcsId]: 0, [KEYS.bandList]: [{ [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] }, { [KEYS.bandNumber]: "n3", [KEYS.nonContiguousCarriers]: [[20]] }] },
                { [KEYS.bcsId]: 0, [KEYS.bandList]: [{ [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] }, { [KEYS.bandNumber]: "n3", [KEYS.nonContiguousCarriers]: [[20]] }] },
            ],
        }), DuplicateBcsException);
    });
    it("testCopyConstruction", () => {
        const original = makeSimpleBC();
        const copy = new BC(original);
        assert.equal(String(copy.bcId), String(original.bcId));
        assert.equal(copy.bcsList.length, original.bcsList.length);
    });
    it("testWithNotes", () => {
        const bc = new BC({
            [KEYS.bcId]: "CA_n1A-n3A",
            [KEYS.bcsList]: [{
                [KEYS.bcsId]: 0,
                [KEYS.bandList]: [
                    { [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] },
                    { [KEYS.bandNumber]: "n3", [KEYS.nonContiguousCarriers]: [[20]] },
                ],
            }],
            [KEYS.notes]: { note1: "some note" },
        });
        assert.equal(bc.notes["note1"], "some note");
    });
    it("testGetTag", () => {
        const bc = makeSimpleBC();
        assert.equal(bc.getTag(), "CA_n1A-n3A");
    });
    it("testStr", () => {
        const bc = makeSimpleBC();
        assert.equal(String(bc), "CA_n1A-n3A");
    });
    it("testSpecificationAutoSet", () => {
        const bc = new BC({
            [KEYS.bcId]: "CA_n1A-n78A",
            [KEYS.bcsList]: [{ [KEYS.bcsId]: 0, [KEYS.bandList]: [
                { [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] },
                { [KEYS.bandNumber]: "n78", [KEYS.nonContiguousCarriers]: [[20]] },
            ]}],
        });
        assert.strictEqual(bc.specification, null);
        try { bc.validate(); } catch { /* BCS validation may fail without chBwList */ }
        assert.strictEqual(bc.specification, "38.101-1");
    });
    it("testSpecificationCorrectValue", () => {
        const bc = new BC({
            [KEYS.bcId]: "CA_n1A-n78A",
            [KEYS.specification]: "38.101-1",
            [KEYS.bcsList]: [{ [KEYS.bcsId]: 0, [KEYS.bandList]: [
                { [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] },
                { [KEYS.bandNumber]: "n78", [KEYS.nonContiguousCarriers]: [[20]] },
            ]}],
        });
        try { bc.validate(); } catch { /* BCS validation may fail without chBwList */ }
        assert.strictEqual(bc.specification, "38.101-1");
    });
    it("testSpecificationWrongValueThrows", () => {
        const bc = new BC({
            [KEYS.bcId]: "CA_n1A-n78A",
            [KEYS.specification]: "38.101-3",
            [KEYS.bcsList]: [{ [KEYS.bcsId]: 0, [KEYS.bandList]: [
                { [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] },
                { [KEYS.bandNumber]: "n78", [KEYS.nonContiguousCarriers]: [[20]] },
            ]}],
        });
        assert.throws(() => bc.validate(), InvalidSpecificationException);
    });
    it("testSpecificationFromJson", () => {
        const bc = new BC({
            [KEYS.bcId]: "CA_n1A-n3A",
            [KEYS.specification]: "38.101-1",
            [KEYS.schemaVersion]: "2.0",
            [KEYS.bcsList]: [{ [KEYS.bcsId]: 0, [KEYS.bandList]: [
                { [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] },
                { [KEYS.bandNumber]: "n3", [KEYS.nonContiguousCarriers]: [[20]] },
            ]}],
        });
        assert.strictEqual(bc.specification, "38.101-1");
        assert.strictEqual(bc.schemaVersion, "2.0");
    });
    it("testSpecificationCopyConstruction", () => {
        const original = new BC({
            [KEYS.bcId]: "CA_n1A-n3A",
            [KEYS.specification]: "38.101-1",
            [KEYS.schemaVersion]: "2.0",
            [KEYS.bcsList]: [{ [KEYS.bcsId]: 0, [KEYS.bandList]: [
                { [KEYS.bandNumber]: "n1", [KEYS.nonContiguousCarriers]: [[10]] },
                { [KEYS.bandNumber]: "n3", [KEYS.nonContiguousCarriers]: [[20]] },
            ]}],
        });
        const copy = new BC(original);
        assert.strictEqual(copy.specification, "38.101-1");
        assert.strictEqual(copy.schemaVersion, "2.0");
    });
});

////////////////////////////////////////////////////////////////
//                   BandCombinationList                      //
////////////////////////////////////////////////////////////////

describe("TestBandCombinationList", () => {
    function makeBC(bcId: string, bands: string[]): BC {
        const bandList = bands.map(b => ({ [KEYS.bandNumber]: b, [KEYS.nonContiguousCarriers]: [[10]] }));
        return new BC({ [KEYS.bcId]: bcId, [KEYS.bcsList]: [{ [KEYS.bcsId]: 0, [KEYS.bandList]: bandList }] });
    }

    it("testAddAndHasBC", () => {
        const bcl = new BandCombinationList();
        bcl.add(makeBC("CA_n1A-n3A", ["n1", "n3"]));
        assert.ok(bcl.hasBC("CA_n1A-n3A"));
        assert.ok(!bcl.hasBC("CA_n7A"));
    });
    it("testGetBC", () => {
        const bcl = new BandCombinationList();
        bcl.add(makeBC("CA_n1A-n3A", ["n1", "n3"]));
        const bc = bcl.get("CA_n1A-n3A") as BC;
        assert.notEqual(bc, undefined);
        assert.ok(bc.bcId!.equals("n1A-n3A"));
    });
    it("testGetNonExistent", () => {
        const bcl = new BandCombinationList();
        assert.equal(bcl.get("CA_n99A"), undefined);
    });
    it("testDuplicateAddRaises", () => {
        const bcl = new BandCombinationList();
        bcl.add(makeBC("CA_n1A-n3A", ["n1", "n3"]));
        assert.throws(() => bcl.add(makeBC("CA_n1A-n3A", ["n1", "n3"])), DuplicateEntryException);
    });
    it("testValidateEmptyRaises", () => {
        const bcl = new BandCombinationList();
        assert.throws(() => bcl.validate(), NoBandCombinationsException);
    });
    it("testAddAll", () => {
        const bcl = new BandCombinationList();
        bcl.addAll([
            makeBC("CA_n1A-n3A", ["n1", "n3"]),
            makeBC("CA_n7A-n78A", ["n7", "n78"]),
        ]);
        assert.equal(bcl.data.size, 2);
    });
});
