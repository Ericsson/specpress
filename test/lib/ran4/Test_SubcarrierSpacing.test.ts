// Test_SubcarrierSpacing.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SCS, InvalidScsException } from "../../../lib/ran4/SubcarrierSpacing.js";


describe("SCS", () => {
  it("testScsFromString", () => {
    assert.strictEqual(+new SCS("15"), 15);
  });

  it("testScsFromInt", () => {
    assert.strictEqual(+new SCS(30), 30);
  });

  it("testScsNoneRaisesException", () => {
    assert.throws(() => new SCS(null), InvalidScsException);
  });

  it("testScsInvalidValueRaisesException", () => {
    assert.throws(() => new SCS(99), InvalidScsException);
  });
});
