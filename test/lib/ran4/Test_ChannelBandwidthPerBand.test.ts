// Test_ChannelBandwidthPerBand.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChannelBandwidth, SCSEntry, ChBwOneBand, InvalidSpecificationException } from "../../../lib/ran4/ChannelBandwidthPerBand.js";


describe("ChannelBandwidth", () => {
  it("testInitFromInt", () => {
    assert.ok(new ChannelBandwidth(5).validate());
  });

  it("testInitFromDict", () => {
    assert.ok(new ChannelBandwidth({ bw: 10.0, uplink: "undefined", downlink: "optional" }).validate());
  });

  it("testInitFromDictPartial", () => {
    assert.ok(new ChannelBandwidth({ bw: 5.5, uplink: "undefined" }).validate());
  });

  it("testInitFromChannelBandwidth", () => {
    const original = new ChannelBandwidth({ bw: 5.5, uplink: "undefined", downlink: "optional" });
    assert.ok(new ChannelBandwidth(original).validate());
  });
});


describe("SCSEntry", () => {
  it("testInitFromIntList", () => {
    assert.ok(new SCSEntry({ scs: 30, bandwidthList: [10, 20, 40, 50] }).validate());
  });

  it("testInitFromDictList", () => {
    assert.ok(new SCSEntry({ scs: 30, bandwidthList: [
      { bw: 10.0 },
      { bw: 15.0 },
      { bw: 20.0 },
      { bw: 25.0, uplink: "undefined" },
      { bw: 30.0, uplink: "undefined" },
      { bw: 35.0, uplink: "undefined" },
    ]}).validate());
  });
});


describe("ChBwOneBand", () => {
  const minimalScsList = [{ scs: 15, bandwidthList: [20] }];

  it("testInitFromDict", () => {
    assert.ok(new ChBwOneBand({
      bandNumber: 102,
      scsList: [
        { scs: 15, bandwidthList: [20, 40] },
        { scs: 30, bandwidthList: [20, 40, 60, 80, 100] },
        { scs: 60, bandwidthList: [20, 40, 60, 80, 100] },
      ],
    }).validate());
  });

  it("testSpecificationAutoSetFr1", () => {
    const chBw = new ChBwOneBand({ bandNumber: "n78", scsList: minimalScsList });
    assert.strictEqual(chBw.specification, null);
    chBw.validate();
    assert.strictEqual(chBw.specification, "38.101-1");
  });

  it("testSpecificationAutoSetFr2", () => {
    const chBw = new ChBwOneBand({ bandNumber: "n257", scsList: minimalScsList });
    chBw.validate();
    assert.strictEqual(chBw.specification, "38.101-2");
  });

  it("testSpecificationCorrectValue", () => {
    const chBw = new ChBwOneBand({ bandNumber: "n78", specification: "38.101-1", scsList: minimalScsList });
    assert.doesNotThrow(() => chBw.validate());
  });

  it("testSpecificationWrongValueThrows", () => {
    const chBw = new ChBwOneBand({ bandNumber: "n78", specification: "38.101-2", scsList: minimalScsList });
    assert.throws(() => chBw.validate(), InvalidSpecificationException);
  });

  it("testSpecificationFromJson", () => {
    const chBw = new ChBwOneBand({ bandNumber: "n1", specification: "38.101-1", schemaVersion: "1.0", scsList: minimalScsList });
    assert.strictEqual(chBw.specification, "38.101-1");
    assert.strictEqual(chBw.schemaVersion, "1.0");
  });

  it("testSpecificationCopyConstruction", () => {
    const original = new ChBwOneBand({ bandNumber: "n78", specification: "38.101-1", schemaVersion: "1.0", scsList: minimalScsList });
    const copy = new ChBwOneBand(original);
    assert.strictEqual(copy.specification, "38.101-1");
    assert.strictEqual(copy.schemaVersion, "1.0");
  });
});

////////////////////////////////////////////////////////////////
//                 HTML Generation Tests                      //
////////////////////////////////////////////////////////////////

describe("TestBandHtmlGeneration", () => {
  it("testAddTableHeaders", async () => {
    const { HtmlTable } = await import("../../../lib/ran4/HtmlTable.js");
    const { ChannelBandwidthList } = await import("../../../lib/ran4/ChannelBandwidthPerBand.js");
    const table = new HtmlTable();
    ChannelBandwidthList.addTableHeaders(table);
    
    assert.equal(table.getValue(0, 0), "Band");
    assert.equal(table.getValue(0, 1), "SCS [kHz]");
    assert.equal(table.getValue(0, 2), "Bandwidths [MHz]");
  });
  
  it("testChBwOneBandToHTML", async () => {
    const { HtmlTable } = await import("../../../lib/ran4/HtmlTable.js");
    const band = new ChBwOneBand({
      bandNumber: "n78",
      scsList: [
        { scs: 15, bandwidthList: [5, 10, 20] },
        { scs: 30, bandwidthList: [10, 20, 40] }
      ]
    });
    
    const table = new HtmlTable();
    table.setValue(0, 0, 'Band');
    table.setValue(0, 1, 'SCS [kHz]');
    table.setValue(0, 2, 'Bandwidths [MHz]');
    band.toHTML(table);
    
    // Check band number appears in column 0
    assert.equal(table.getValue(1, 0), "n78");
    
    // Check SCS values appear in column 1
    assert.ok(table.getValue(1, 1)!.includes("15"));
    assert.ok(table.getValue(2, 1)!.includes("30"));
  });
});
