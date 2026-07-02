// RAN4DataHandler.ts — Top-level container for all tables

import { BaseClass } from "./Utils.js";
import { ChannelBandwidthList } from "./ChannelBandwidthPerBand.js";
import { BandCombinationList } from "./BandCombinations.js";
import { DcBandCombinationList } from "./DualConnectivity.js";
import { RAN4JsonEncoder } from "./JsonTools.js";

export class RAN4DataHandler extends BaseClass {
    chBwList: ChannelBandwidthList;
    bcList: BandCombinationList;
    dcBcList: DcBandCombinationList;

    constructor(aParent: BaseClass | null = null) {
        super(aParent);
        this.chBwList = new ChannelBandwidthList(this);
        this.bcList = new BandCombinationList(this);
        this.dcBcList = new DcBandCombinationList(this, true);
    }

    validate(): void {
        this.chBwList.validate();
        this.bcList.validate();
        this.dcBcList.validate();
    }

    getTag(): string { return ""; }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        throw new Error("RAN4DataHandler.toJSON() is not implemented");
    }
}
