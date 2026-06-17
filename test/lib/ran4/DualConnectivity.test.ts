// DualConnectivity.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KEYS, UnsupportedKeyException, DuplicateEntryException, NoEntriesException } from "../../../lib/ran4/Utils.js";
import { MissingBcIdException } from "../../../lib/ran4/BandCombinations.js";
import { BC_ID } from "../../../lib/ran4/BC_ID.js";
import {
    UlConfigDC,
    DualConnectivityConfig,
    DcBandCombinationList,
} from "../../../lib/ran4/DualConnectivity.js";

////////////////////////////////////////////////////////////////
//                       UlConfigDC                           //
////////////////////////////////////////////////////////////////

describe("TestUlConfigDC", () => {
    it("testFromDictWithBcId", () => {
        const d = { [KEYS.bcId]: "DC_n1A-n78A" };
        const ul = new UlConfigDC(d, null, true);
        assert.equal((ul.bcId as BC_ID).valueOf(), "n1A-n78A");
    });
    it("testFromDictWithoutValidation", () => {
        const d = { [KEYS.bcId]: "some_string" };
        const ul = new UlConfigDC(d, null, false);
        assert.equal(ul.bcId, "some_string");
    });
    it("testFromDictWithNotes", () => {
        const d = { [KEYS.bcId]: "DC_n1A-n78A", [KEYS.notes]: { note1: "text" } };
        const ul = new UlConfigDC(d, null, true);
        assert.equal(ul.notes["note1"], "text");
    });
    it("testCopyConstruction", () => {
        const original = new UlConfigDC({ [KEYS.bcId]: "DC_n1A-n78A" }, null, true);
        const copy = new UlConfigDC(original, null, true);
        assert.equal(String(copy.bcId), String(original.bcId));
    });
    it("testValidateMissingBcIdRaises", () => {
        const ul = new UlConfigDC({ [KEYS.bcId]: "DC_n1A-n78A" }, null, true);
        ul.bcId = null;
        assert.throws(() => ul.validate(), Error);
    });
    it("testUnsupportedKeyRaises", () => {
        assert.throws(() => new UlConfigDC({ unknownKey: 42 }), UnsupportedKeyException);
    });
});

////////////////////////////////////////////////////////////////
//                 DualConnectivityConfig                     //
////////////////////////////////////////////////////////////////

describe("TestDualConnectivityConfig", () => {
    function makeSimpleDC(bcId: string = "DC_n1A-n78A"): DualConnectivityConfig {
        return new DualConnectivityConfig({
            [KEYS.bcId]: bcId,
            [KEYS.ulConfigList]: [{ [KEYS.bcId]: "DC_n1A-n78A" }],
        }, null, true, true);
    }

    it("testFromDict", () => {
        const dc = makeSimpleDC();
        assert.equal((dc.bcId as BC_ID).valueOf(), "n1A-n78A");
        assert.equal(dc.ulConfigList.length, 1);
    });
    it("testFromDictWithoutValidation", () => {
        const dc = new DualConnectivityConfig({
            [KEYS.bcId]: "some_id",
            [KEYS.ulConfigList]: [{ [KEYS.bcId]: "some_ul" }],
        }, null, false, false);
        assert.equal(dc.bcId, "some_id");
    });
    it("testWithSingleUlAllowed", () => {
        const dc = new DualConnectivityConfig({
            [KEYS.bcId]: "DC_n1A-n78A",
            [KEYS.ulConfigList]: [],
            [KEYS.singleUlAllowed]: "Yes",
        }, null, true, true);
        assert.equal(dc.singleUlAllowed, "Yes");
    });
    it("testWithDlInterruptionsAllowed", () => {
        const dc = new DualConnectivityConfig({
            [KEYS.bcId]: "DC_n1A-n78A",
            [KEYS.ulConfigList]: [],
            [KEYS.dlInterruptionsAllowed]: "No",
        }, null, true, true);
        assert.equal(dc.dlInterruptionsAllowed, "No");
    });
    it("testWithNotes", () => {
        const dc = new DualConnectivityConfig({
            [KEYS.bcId]: "DC_n1A-n78A",
            [KEYS.ulConfigList]: [],
            [KEYS.notes]: { n1: "value" },
        }, null, true, true);
        assert.equal(dc.notes["n1"], "value");
    });
    it("testCopyConstruction", () => {
        const original = makeSimpleDC();
        const copy = new DualConnectivityConfig(original, null, true, true);
        assert.equal(String(copy.bcId), String(original.bcId));
        assert.equal(copy.ulConfigList.length, original.ulConfigList.length);
    });
    it("testValidateMissingBcIdRaises", () => {
        const dc = makeSimpleDC();
        dc.bcId = null;
        assert.throws(() => dc.validate(), MissingBcIdException);
    });
    it("testUnsupportedKeyRaises", () => {
        assert.throws(
            () => new DualConnectivityConfig({ [KEYS.bcId]: "DC_n1A-n78A", badKey: 42 }),
            UnsupportedKeyException
        );
    });
    it("testGetTag", () => {
        const dc = makeSimpleDC();
        assert.equal(dc.getTag(), "n1A-n78A");
    });
    it("testStr", () => {
        const dc = makeSimpleDC();
        assert.equal(String(dc), "n1A-n78A");
    });
});

////////////////////////////////////////////////////////////////
//                 DcBandCombinationList                      //
////////////////////////////////////////////////////////////////

describe("TestDcBandCombinationList", () => {
    function makeDC(bcId: string): DualConnectivityConfig {
        return new DualConnectivityConfig({
            [KEYS.bcId]: bcId,
            [KEYS.ulConfigList]: [{ [KEYS.bcId]: bcId }],
        }, null, true, true);
    }

    it("testAddAndHasBC", () => {
        const dcl = new DcBandCombinationList(null, true, true);
        dcl.add(makeDC("DC_n1A-n78A"));
        assert.ok(dcl.hasBC("DC_n1A-n78A"));
        assert.ok(!dcl.hasBC("DC_n7A"));
    });
    it("testGetDC", () => {
        const dcl = new DcBandCombinationList(null, true, true);
        dcl.add(makeDC("DC_n1A-n78A"));
        const dc = dcl.get("DC_n1A-n78A");
        assert.notEqual(dc, undefined);
    });
    it("testGetNonExistent", () => {
        const dcl = new DcBandCombinationList(null, true, true);
        assert.equal(dcl.get("n99A"), undefined);
    });
    it("testDuplicateAddRaises", () => {
        const dcl = new DcBandCombinationList(null, true, true);
        dcl.add(makeDC("DC_n1A-n78A"));
        assert.throws(() => dcl.add(makeDC("DC_n1A-n78A")), DuplicateEntryException);
    });
    it("testValidateEmptyRaises", () => {
        const dcl = new DcBandCombinationList(null, true, true);
        assert.throws(() => dcl.validate(), NoEntriesException);
    });
    it("testAddAll", () => {
        const dcl = new DcBandCombinationList(null, true, true);
        dcl.addAll([makeDC("DC_n1A-n78A"), makeDC("DC_n3A-n77A")]);
        assert.equal(dcl.data.size, 2);
    });
    it("testGetTag", () => {
        const dcl = new DcBandCombinationList();
        assert.equal(dcl.getTag(), "");
    });
});

////////////////////////////////////////////////////////////////
//                 HTML Generation Tests                      //
////////////////////////////////////////////////////////////////

describe("TestDcHtmlGeneration", () => {
    it("testAddTableHeaders", async () => {
        const { HtmlTable } = await import("../../../lib/ran4/HtmlTable.js");
        const table = new HtmlTable();
        DcBandCombinationList.addTableHeaders(table);
        
        assert.equal(table.getValue(0, 0), "DL Configuration");
        assert.equal(table.getValue(0, 1), "UL Configurations");
        assert.equal(table.getValue(0, 2), "Single UL");
        assert.equal(table.getValue(0, 3), "DL Interruptions");
        assert.equal(table.getValue(0, 4), "Notes");
    });
    
    it("testDcToHTML", async () => {
        const { HtmlTable } = await import("../../../lib/ran4/HtmlTable.js");
        const dc = new DualConnectivityConfig({
            [KEYS.bcId]: "DC_n1A-n78A",
            [KEYS.ulConfigList]: [
                { [KEYS.bcId]: "CA_n1A" },
                { [KEYS.bcId]: "CA_n78A" }
            ],
            [KEYS.singleUlAllowed]: "Yes",
            [KEYS.dlInterruptionsAllowed]: "No",
            [KEYS.notes]: { note1: true, note2: true }
        }, null, false, false);
        
        const table = new HtmlTable();
        DcBandCombinationList.addTableHeaders(table);
        dc.toHTML(table);
        
        assert.equal(table.getValue(1, 0), "DC_n1A-n78A");
        assert.equal(table.getValue(1, 1), "CA_n1A<br>CA_n78A");
        assert.equal(table.getValue(1, 2), "Yes");
        assert.equal(table.getValue(1, 3), "No");
        assert.ok(table.getValue(1, 4)!.includes("note1"));
        assert.ok(table.getValue(1, 4)!.includes("note2"));
    });
    
    it("testDcToHTMLWithEmptyFields", async () => {
        const { HtmlTable } = await import("../../../lib/ran4/HtmlTable.js");
        const dc = new DualConnectivityConfig({
            [KEYS.bcId]: "DC_n1A-n78A",
            [KEYS.ulConfigList]: []
        }, null, false, false);
        
        const table = new HtmlTable();
        DcBandCombinationList.addTableHeaders(table);
        dc.toHTML(table);
        
        assert.equal(table.getValue(1, 1), "–"); // Empty UL configs
        assert.equal(table.getValue(1, 2), "–"); // No single UL
        assert.equal(table.getValue(1, 3), "–"); // No DL interruptions
        assert.equal(table.getValue(1, 4), "–"); // No notes
    });
});
