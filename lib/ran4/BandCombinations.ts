// BandCombinations.ts — Band combination data model & list

import { BaseClass, BaseList, KEYS, IsInt, listToString, UnsupportedKeyException, MissingParentObjectException } from "./Utils.js";
import { logger } from "./Logger.js";
import { BandNumber } from "./BandNumber.js";
import { BC_ID } from "./BC_ID.js";
import { BWC_ID, bwcValuesFR1, bwcValuesFR2 } from "./BWC_ID.js";
import { MAX_CARRIER_BW_MHZ, MissingBandNumberException, ChannelBandwidthList } from "./ChannelBandwidthPerBand.js";
import { RAN4JsonEncoder, LoadJsonFileToDict } from "./JsonTools.js";
import { HtmlTable } from "./HtmlTable.js";
import * as path from "node:path";

//////////////////////////////
//  CONSTANTS

/** Maximum valid BCS-ID value (inclusive). */
const MAX_BCS_ID = 31;

//////////////////////////////
//  Exceptions

/** Thrown when a BCS-ID value is out of range or not an integer. */
export class InvalidBcsIdException extends RangeError {}
/** Thrown when a carrier bandwidth value is invalid. */
export class InvalidCarrierBandwidthException extends RangeError {}
/** Thrown when a band number is not defined in the channel bandwidth table. */
export class UndefinedBandNumberException extends RangeError {}
/** Thrown when a band number does not match the BC-ID. */
export class UnexpectedBandNumberException extends RangeError {}
/** Thrown when non-contiguous variants are used incorrectly. */
export class NonContVariantException extends RangeError {}
/** Thrown when contiguous and non-contiguous carriers are mixed. */
export class ContNonContMixException extends RangeError {}
/** Thrown when more non-contiguous carriers are specified than the BC-ID allows. */
export class TooManyNonContCarrierException extends RangeError {}
/** Thrown when contiguous carrier variant counts are inconsistent. */
export class ContCarrierVariantMismatchException extends RangeError {}
/** Thrown when fewer than two contiguous carriers are specified. */
export class LessThanTwoContigiousCarriersException extends RangeError {}
/** Thrown when more contiguous carriers are specified than the BC-ID allows. */
export class TooManyContCarrierException extends RangeError {}
/** Thrown when expected carrier components are not defined. */
export class UndefinedCarriersException extends RangeError {}
/** Thrown when maxAggBwPerBand is not a valid positive integer. */
export class InvalidMaxBandwidthException extends RangeError {}
/** Thrown when a referenced BC-ID is not found in the BC table. */
export class UndefinedBandCombinationException extends RangeError {}
/** Thrown when a referenced channel bandwidth is not found. */
export class UndefinedChannelBandwidthException extends RangeError {}
/** Thrown when a band number in a RefComponent doesn't match its parent BandEntry. */
export class BandNumberMismatchException extends RangeError {}
/** Thrown when a BCS contains duplicate band entries for the same band. */
export class DuplicateBandEntryException extends RangeError {}
/** Thrown when a BCS is missing its bcsId. */
export class MissingBandwidthCombinationSetIdException extends RangeError {}
/** Thrown when a BCS has no band entries. */
export class MissingBandListException extends RangeError {}
/** Thrown when an UL configuration references an undefined band or BC. */
export class UndefinedUplinkConfigException extends RangeError {}
/** Thrown when a BC is missing its bcId. */
export class MissingBcIdException extends RangeError {}
/** Thrown when a RefComponent references a multi-band BC-ID. */
export class InvalidReferenceBcId extends RangeError {}
/** Thrown when a RefComponent's BWC doesn't match the BC-ID. */
export class UnexpectedBwcException extends RangeError {}
/** Thrown when a BC contains duplicate BCS entries. */
export class DuplicateBcsException extends RangeError {}
/** Thrown when a BC has no BCS entries. */
export class MissingBcsListException extends RangeError {}
/** Thrown when a referenced BCS-ID is not found in a BC. */
export class UndefinedBcsException extends RangeError {}
/** Thrown when a BCS contains duplicate UL configurations. */
export class DuplicateUplinkConfigException extends RangeError {}
/** Thrown when the BandCombinationList is empty during validation. */
export class NoBandCombinationsException extends RangeError {}
/** Thrown when the specification field does not match the expected value. */
export class InvalidSpecificationException extends Error {}

////////////////////////////////////////////////////////////////
//                          BCS_ID                            //
////////////////////////////////////////////////////////////////

/**
 * A Bandwidth Combination Set identifier (0–31).
 *
 * Wraps an integer BCS-ID with validation. Accepts numeric values,
 * string integers, or strings prefixed with `"BCS"`.
 */
export class BCS_ID {
    private value: number;

    /**
     * @param aValue — a number, string (e.g. `"0"`, `"BCS3"`), or existing BCS_ID to copy.
     * @throws InvalidBcsIdException if the value is out of range [0..31].
     */
    constructor(aValue: number | string | BCS_ID) {
        if (aValue instanceof BCS_ID) {
            this.value = aValue.value;
            return;
        }
        if (aValue === null || aValue === undefined) {
            throw new InvalidBcsIdException("The BCS_ID value shall not be None");
        }
        let v: string = String(aValue);
        if (v.startsWith("BCS")) {
            v = v.substring(3);
        }
        if (!IsInt(v)) {
            throw new InvalidBcsIdException(`The given BCS_ID value '${v}' is not an integer`);
        }
        const bcs = parseInt(v);
        if (bcs < 0 || bcs > MAX_BCS_ID) {
            throw new InvalidBcsIdException(`The BCS_ID must be in the range [0..31] but was ${bcs}`);
        }
        this.value = bcs;
    }

    /** Returns the numeric BCS-ID value. */
    valueOf(): number { return this.value; }
    /** Returns the BCS-ID as a string. */
    toString(): string { return String(this.value); }
    /** Returns true if this BCS-ID equals another. */
    equals(aOther: BCS_ID): boolean { return this.value === aOther.value; }
}

////////////////////////////////////////////////////////////////
//                      RefComponent                          //
////////////////////////////////////////////////////////////////

/**
 * A reference to another band combination or a single band number.
 *
 * Used within a BandEntry to indicate that the carrier configuration for
 * this band is defined by referencing another BC (with a specific BCS-ID)
 * or simply by the band's channel bandwidth table.
 */
export class RefComponent extends BaseClass {
    /** The referenced BC-ID, or null if referencing by band number. */
    bcId: BC_ID | null = null;
    /** The BCS-ID within the referenced BC, or -1 if not applicable. */
    bcsId: BCS_ID | number = -1;
    /** The referenced band number, or null if referencing by BC-ID. */
    bandNumber: BandNumber | null = null;

    /**
     * @param aValue — a dict from JSON or an existing RefComponent to copy.
     * @param aParent — the parent BandEntry.
     */
    constructor(aValue: Record<string, unknown> | RefComponent, aParent: BaseClass | null = null) {
        super(aParent);
        if (aValue instanceof RefComponent) {
            this.bcId = aValue.bcId;
            this.bcsId = aValue.bcsId;
            this.bandNumber = aValue.bandNumber;
        } else {
            for (const oneKey of Object.keys(aValue)) {
                if (oneKey === KEYS.bcId) {
                    this.bcId = new BC_ID(aValue[KEYS.bcId] as string);
                } else if (oneKey === KEYS.bcsId) {
                    this.bcsId = new BCS_ID(aValue[KEYS.bcsId] as number | string);
                } else if (oneKey === KEYS.bandNumber) {
                    this.bandNumber = new BandNumber(aValue[KEYS.bandNumber] as string | number);
                } else {
                    throw new UnsupportedKeyException(`${this.getDescriptor()}: Does not support the given key '${oneKey}' as element`);
                }
            }
        }
    }

    /**
     * Validates the RefComponent against the channel bandwidth and BC tables.
     * Checks that exactly one of bcId/bandNumber is set, band numbers match,
     * and referenced BCs/BCSs exist.
     */
    validate(aChBwList?: ChannelBandwidthList, aBcList?: BandCombinationList): void {
        if (this.bcId === null && this.bandNumber === null) {
            throw new Error(`${this.getDescriptor()}: Contains neither a BC-ID nor a BandNumber.`);
        }
        if (this.bcId !== null && this.bandNumber !== null) {
            throw new Error(`${this.getDescriptor()}: Contains both a BC-ID (${this.bcId}) and a BandNumber (${this.bandNumber}).`);
        }
        if (this.bandNumber !== null && +this.bcsId >= 0) {
            throw new Error(`${this.getDescriptor()}: Contains both a BandNumber (${this.bandNumber}) and a BCS-ID (${this.bcsId}).`);
        }

        const ownBandNumber = (this.getParent(BandEntry) as BandEntry).bandNumber!;

        if (this.bcId !== null) {
            const refBandNumber = this.bcId.getBandNumbers()[0];
            if (ownBandNumber.asInt() !== refBandNumber.asInt()) {
                throw new BandNumberMismatchException(`${this.getDescriptor()}: The RefComponent is in a BandEntry for band ${ownBandNumber} but refers to band ${refBandNumber}.`);
            }
            if (this.bcId.isSingleCarrier()) {
                throw new Error(`${this.getDescriptor()}: A single carrier configuration shall reference to the BandNumber (${ownBandNumber}) but referred to a single carrier BC-ID (${this.bcId})`);
            } else {
                if (+this.bcsId < 0) {
                    throw new MissingBandwidthCombinationSetIdException(`${this.getDescriptor()}: Does not contain a BCS-ID (bcsId).`);
                }
                if (this.bcId.getBandNumbers().length > 1) {
                    throw new InvalidReferenceBcId(`${this.getDescriptor()}: The reference BC-ID comprises of several bands ${this.bcId.getBandNumbers()}. This is not allowed.`);
                }
                if (aBcList === undefined) {
                    throw new Error(`${this.getDescriptor()}: Could not access BC table and hence not validate.`);
                }
                if (!aBcList.hasBC(this.bcId)) {
                    throw new UndefinedBandCombinationException(`${this.getDescriptor()}: Referenced BC-ID ${this.bcId} is not defined in BC-table.`);
                }
                const bc = aBcList.get(this.bcId.toString()) as BC;
                if (!bc.hasBCS(this.bcsId as BCS_ID)) {
                    throw new UndefinedBcsException(`${this.getDescriptor()}: Referenced BC-ID ${this.bcId} does not have a BCS-ID ${this.bcsId}.`);
                }
            }
        } else {
            if (!aChBwList!.hasBand(this.bandNumber!)) {
                throw new UndefinedChannelBandwidthException(`${this.getDescriptor()}: channelBandwidthTable does not have an entry for bandNumber ${this.bandNumber}.`);
            }
        }
    }

    toString(): string {
        if (this.bandNumber !== null) return this.bandNumber.toString();
        if (+this.bcsId >= 0) return `${this.bcId}_BCS${this.bcsId}`;
        return String(this.bcId);
    }

    toHTMLLink(): string {
        const text = this.toString();
        if (this.bandNumber !== null) {
            // Link to band file: n3.json
            return `<a href="#" class="bc-ref-link" data-ref="${this.bandNumber.toString()}">${text}</a>`;
        }
        if (this.bcId !== null) {
            // Link to BC file: CA_n3B.json (with BCS info in data attribute)
            const bcsInfo = +this.bcsId >= 0 ? `_BCS${this.bcsId}` : '';
            return `<a href="#" class="bc-ref-link" data-ref="${this.bcId.getPrefix()}${this.bcId.valueOf()}" data-bcs="${+this.bcsId}">${text}</a>`;
        }
        return text;
    }

    getTag(): string { return this.toString(); }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        anEncoder.write("{\n", aLevel);
        if (this.bandNumber !== null) {
            anEncoder.writeKeyAndValue(KEYS.bandNumber, this.bandNumber.toString(), aLevel + 1);
        } else {
            anEncoder.writeKeyAndValue(KEYS.bcId, this.bcId!.getPrefix() + this.bcId!.valueOf(), aLevel + 1);
            if (!this.bcId!.isSingleCarrier()) {
                anEncoder.writeKeyAndValue(KEYS.bcsId, +this.bcsId, aLevel + 1, ",\n");
            }
        }
        anEncoder.write("\n}", aLevel);
    }

    /** Returns the effective BWC-ID of this reference after validation. */
    getBWC_ID(aChBwList?: ChannelBandwidthList, aBcList?: BandCombinationList): BWC_ID {
        this.validate(aChBwList, aBcList);
        if (this.bandNumber !== null) return new BWC_ID("A");
        return [...new BC_ID(this.bcId!.valueOf()).getBwcIDsPerBand().values()][0] as BWC_ID;
    }
}

////////////////////////////////////////////////////////////////
//                         Carrier                            //
////////////////////////////////////////////////////////////////

/**
 * A single carrier component within a band entry.
 *
 * Contains a list of supported bandwidth values (integers in MHz) or a
 * single BandNumber reference indicating that the carrier uses the band's
 * full channel bandwidth table.
 */
export class Carrier extends BaseClass {
    /** Bandwidth values (integers) or a single BandNumber reference. */
    bwList: (number | BandNumber)[] = [];

    /**
     * @param aValue — an array of bandwidth values or an existing Carrier to copy.
     * @param aParent — the parent BandEntry.
     */
    constructor(aValue: unknown[] | Carrier, aParent: BaseClass | null = null) {
        super(aParent);

        let aBandwidthList: unknown[];
        if (aValue instanceof Carrier) {
            aBandwidthList = aValue.bwList;
        } else if (Array.isArray(aValue)) {
            aBandwidthList = aValue;
        } else {
            throw new Error(`${this.getDescriptor()}: Expecting a Carrier object or a list of integers but got ${aValue} (${typeof aValue}).`);
        }

        try {
            const first = String(aBandwidthList[0]);
            if (!first.startsWith("n")) throw new MissingBandNumberException("Not a band number");
            const refBandNumber = new BandNumber(aBandwidthList[0] as string | number);
            this.bwList = [refBandNumber];
        } catch {
            const bwAsIntList: number[] = [];
            for (const oneBW of aBandwidthList) {
                if (!IsInt(oneBW as string | number)) {
                    throw new InvalidCarrierBandwidthException(`${this.getDescriptor()}: Carrier bandwidths must be integer values but got: ${oneBW}`);
                }
                const oneBwAsInt = Number(oneBW);
                if (oneBwAsInt < 0 || oneBwAsInt > MAX_CARRIER_BW_MHZ) {
                    throw new InvalidCarrierBandwidthException(`${this.getDescriptor()}: Carrier bandwidths must be in the range (0..${MAX_CARRIER_BW_MHZ}] but got ${oneBwAsInt}.`);
                }
                bwAsIntList.push(oneBwAsInt);
            }
            this.bwList = bwAsIntList;
        }
    }

    validate(aChBwList?: ChannelBandwidthList, aBcList?: BandCombinationList): void {
        if (this.bwList.length === 1 && this.bwList[0] instanceof BandNumber) {
            const refBandNumber = this.bwList[0] as BandNumber;
            const ownBandNumber = new BandNumber((this.getParent(BandEntry) as BandEntry).bandNumber!);
            if (ownBandNumber.asInt() !== refBandNumber.asInt()) {
                throw new BandNumberMismatchException(`${this.getDescriptor()}: Belongs to a BandEntry for band ${ownBandNumber} but the referenced BC is for band ${refBandNumber}.`);
            }
            if (!aChBwList!.hasBand(ownBandNumber)) {
                throw new UndefinedChannelBandwidthException(`${this.getDescriptor()}: channelBandwidthTable does not have an entry for bandNumber ${ownBandNumber}.`);
            }
        }
    }

    toString(): string {
        if (this.bwList.length === 1 && this.bwList[0] instanceof BandNumber) {
            return JSON.stringify([this.bwList[0].toString()]);
        }
        return JSON.stringify(this.bwList);
    }

    getTag(): string { return ""; }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        const serializable = this.bwList.map(v => v instanceof BandNumber ? v.toString() : v);
        anEncoder.writeValue(serializable, aLevel);
    }
}

////////////////////////////////////////////////////////////////
//                           CCGV                             //
////////////////////////////////////////////////////////////////

/**
 * A Contiguous Carrier Group Variant — one possible arrangement of
 * contiguous carriers within a band.
 *
 * Contains a list of Carrier objects representing the individual
 * component carriers in this contiguous group.
 */
export class CCGV extends BaseClass {
    /** The component carriers in this contiguous group. */
    ccList: Carrier[] = [];

    /**
     * @param aValue — an array of carrier arrays or an existing CCGV to copy.
     * @param aParent — the parent BandEntry or ContCarrierGroup.
     */
    constructor(aValue: unknown[] | CCGV, aParent: BaseClass | null = null) {
        super(aParent);
        const aCCList = aValue instanceof CCGV ? aValue.ccList : aValue as unknown[];
        for (const oneCC of aCCList) {
            this.ccList.push(new Carrier(oneCC as unknown[] | Carrier, this));
        }
    }

    toString(): string { return String(this.ccList); }
    getTag(): string { return ""; }

    validate(aChBwList?: ChannelBandwidthList, aBcList?: BandCombinationList): void {
        for (const oneCarrier of this.ccList) {
            oneCarrier.validate(aChBwList, aBcList);
        }
    }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        anEncoder.writeValue(this.ccList, aLevel);
    }

    /** Returns the number of component carriers in this group. */
    getNrofCarriers(): number { return this.ccList.length; }
}

////////////////////////////////////////////////////////////////
//                    ContCarrierGroup                        //
////////////////////////////////////////////////////////////////

/**
 * A Contiguous Carrier Group — a set of CCGV variants that all describe
 * the same number of contiguous carriers with different bandwidth options.
 */
export class ContCarrierGroup extends BaseClass {
    /** The list of CCGV variants. */
    ccgvList: CCGV[] = [];

    /**
     * @param aCCGVList — array of CCGV arrays from JSON.
     * @param aParent — the parent BandEntry.
     */
    constructor(aCCGVList: unknown[], aParent: BaseClass | null = null) {
        super(aParent);
        for (const oneCCGV of aCCGVList) {
            const ccgv = new CCGV(oneCCGV as unknown[] | CCGV, this);
            if (aCCGVList.length > 1 && ccgv.getNrofCarriers() === 1) {
                throw new NonContVariantException(`${this.getDescriptor()}: Multiple variants are not allowed for single-carrier configurations: ${aCCGVList}`);
            }
            this.ccgvList.push(ccgv);
        }
    }

    validate(aChBwList?: ChannelBandwidthList, aBcList?: BandCombinationList): void {
        let n = -1;
        for (const oneCCGVariant of this.ccgvList) {
            oneCCGVariant.validate(aChBwList, aBcList);
            if (n === -1) {
                n = oneCCGVariant.getNrofCarriers();
            } else if (oneCCGVariant.getNrofCarriers() !== n) {
                throw new ContCarrierVariantMismatchException(`${this.getDescriptor()}: All CCGVariants must have the same number of carriers.`);
            }
        }
    }

    toString(): string { return String(this.ccgvList); }
    getTag(): string { return ""; }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        anEncoder.writeValue(this.ccgvList, aLevel);
    }

    /** Returns the number of contiguous carriers (from the first variant). */
    getNrofContCarriers(): number {
        if (this.ccgvList.length === 0) return 0;
        return this.ccgvList[0].getNrofCarriers();
    }

    /** Returns the number of CCGV variants. */
    getNrofVariants(): number { return this.ccgvList.length; }
}


////////////////////////////////////////////////////////////////
//                        BandEntry                           //
////////////////////////////////////////////////////////////////

/**
 * A band entry within a Bandwidth Combination Set (BCS).
 *
 * Describes the carrier configuration for one band within a band combination:
 * non-contiguous carriers, contiguous carrier groups, referenced components,
 * and the maximum aggregated bandwidth.
 */
export class BandEntry extends BaseClass {
    /** The band number for this entry. */
    bandNumber: BandNumber | null = null;
    /** Non-contiguous (individual) carriers. */
    nonContiguousCarriers: Carrier[] = [];
    /** Contiguous carrier group variants. */
    contiguousCarriers: CCGV[] = [];
    /** References to other BCs or band numbers. */
    referencedComponents: RefComponent[] = [];
    /** Maximum aggregated bandwidth per band in MHz (0 if not specified). */
    maxAggBwPerBand: number = 0;

    /**
     * @param aValue — a dict from JSON or an existing BandEntry to copy.
     * @param aParent — the parent BCS.
     */
    constructor(aValue: Record<string, unknown> | BandEntry, aParent: BaseClass | null = null) {
        super(aParent);
        if (aValue instanceof BandEntry) {
            this.bandNumber = aValue.bandNumber;
            for (const oneElement of aValue.nonContiguousCarriers) {
                this.nonContiguousCarriers.push(new Carrier(oneElement, this));
            }
            for (const oneElement of aValue.contiguousCarriers) {
                this.contiguousCarriers.push(new CCGV(oneElement, this));
            }
            for (const oneElement of aValue.referencedComponents) {
                this.referencedComponents.push(new RefComponent(oneElement, this));
            }
            this.maxAggBwPerBand = aValue.maxAggBwPerBand;
        } else {
            for (const oneKey of Object.keys(aValue)) {
                if (oneKey === KEYS.bandNumber) {
                    this.bandNumber = new BandNumber(aValue[KEYS.bandNumber] as string | number);
                } else if (oneKey === KEYS.contCarrierGroups) {
                    const ccgs = aValue[KEYS.contCarrierGroups] as unknown[][];
                    if (ccgs.length > 1) {
                        for (const oneCCG of ccgs) {
                            const ccg = new ContCarrierGroup(oneCCG as unknown[], this);
                            if (ccg.getNrofVariants() > 1) {
                                throw new NonContVariantException(`${this.getDescriptor()}: For non-contiguous CA, multiple variants are not allowed in contCarrierGroups: '${ccg}'.`);
                            }
                            const oneCCGV = new CCGV(ccg.ccgvList[0], this);
                            if (oneCCGV.getNrofCarriers() > 1) {
                                throw new ContNonContMixException(`${this.getDescriptor()}: List of contCarrierGroups '${ccgs}' defines both contiguous and non-contiguous CA, which is not allowed.`);
                            }
                            this.nonContiguousCarriers.push(new Carrier(oneCCGV.ccList[0], this));
                        }
                    } else {
                        const oneCCG = new ContCarrierGroup(ccgs[0] as unknown[], this);
                        if (oneCCG.getNrofContCarriers() === 1) {
                            this.nonContiguousCarriers.push(oneCCG.ccgvList[0].ccList[0]);
                        } else {
                            for (const oneCCGV of oneCCG.ccgvList) {
                                this.contiguousCarriers.push(oneCCGV);
                            }
                        }
                    }
                } else if (oneKey === KEYS.nonContiguousCarriers) {
                    for (const oneElement of aValue[KEYS.nonContiguousCarriers] as unknown[]) {
                        this.nonContiguousCarriers.push(new Carrier(oneElement as unknown[], this));
                    }
                } else if (oneKey === KEYS.contiguousCarriers) {
                    for (const oneElement of aValue[KEYS.contiguousCarriers] as unknown[]) {
                        this.contiguousCarriers.push(new CCGV(oneElement as unknown[], this));
                    }
                } else if (oneKey === KEYS.referencedComponents) {
                    for (const oneElement of aValue[KEYS.referencedComponents] as unknown[]) {
                        this.referencedComponents.push(new RefComponent(oneElement as Record<string, unknown>, this));
                    }
                } else if (oneKey === KEYS.maxAggBwPerBand) {
                    const maxBW = aValue[KEYS.maxAggBwPerBand];
                    if (!IsInt(maxBW as string | number)) {
                        throw new InvalidMaxBandwidthException(`${this.getDescriptor()}: maxAggBwPerBand shall be a positive integer value but was '${maxBW}'.`);
                    }
                    this.maxAggBwPerBand = Number(maxBW);
                } else {
                    throw new UnsupportedKeyException(`${this.getDescriptor()}: Does not support the given key '${oneKey}' as element`);
                }
            }
        }
    }

    /**
     * Validates this band entry against the channel bandwidth and BC tables.
     * Checks band number existence, BWC-ID consistency, carrier counts, and
     * referenced component validity.
     */
    validate(aChBwList?: ChannelBandwidthList, aBcList?: BandCombinationList): void {
        if (this.bandNumber === null) {
            throw new MissingBandNumberException(`${this.getDescriptor()}: BandEntry must contain a 'bandNumber'.`);
        }
        if (!aChBwList!.hasBand(this.bandNumber)) {
            throw new UndefinedBandNumberException(`${this.getDescriptor()}: The bandNumber '${this.bandNumber}' is not defined in the channel-bandwidth list.`);
        }

        const bc = this.getParent(BC) as BC;
        const bwcMap = bc.bcId!.getBwcIDsPerBand();
        const bandKey = this.bandNumber.toString();
        if (!bwcMap.has(bandKey)) {
            throw new UnexpectedBandNumberException(`${this.getDescriptor()}: The bandNumber '${this.bandNumber}' of the band entry does not occur in the BC's bcId '${bc.bcId}'.`);
        }
        const bwcForBand = bwcMap.get(bandKey)!;
        const expectedBwcIds: string[] = [...(bwcForBand instanceof BWC_ID ? bwcForBand.getContGroups() : [bwcForBand as string])];

        if (this.referencedComponents.length > 0) {
            for (const oneRefComponent of this.referencedComponents) {
                oneRefComponent.validate(aChBwList, aBcList);
                for (const oneContGroupId of oneRefComponent.getBWC_ID(aChBwList, aBcList).getContGroups()) {
                    const idx = expectedBwcIds.indexOf(oneContGroupId);
                    if (idx < 0) {
                        throw new UnexpectedBwcException(`${this.getDescriptor()}: RefComponent '${oneRefComponent}' for band ${this.bandNumber} has a BWC value '${oneContGroupId}' which is not present according in the BandCombination's BC-ID '${bc.getTag()}'.`);
                    }
                    expectedBwcIds.splice(idx, 1);
                }
            }
        }

        if (this.nonContiguousCarriers.length > 0 && this.contiguousCarriers.length > 0) {
            throw new ContNonContMixException(`${this.getDescriptor()}: Contains both nonContiguousCarriers and contiguousCarriers which is not allowed.`);
        }

        if (this.nonContiguousCarriers.length > 0) {
            for (const oneCarrier of this.nonContiguousCarriers) {
                oneCarrier.validate(aChBwList, aBcList);
                const idx = expectedBwcIds.indexOf("A");
                if (idx >= 0) {
                    expectedBwcIds.splice(idx, 1);
                } else {
                    throw new TooManyNonContCarrierException(`${this.getDescriptor()}: nonContiguousCarriers '${this.nonContiguousCarriers}' specifies more carriers for band ${this.bandNumber} than the BandCombination's BC-ID '${bc.getTag()}' suggests.`);
                }
            }
        }

        if (this.contiguousCarriers.length > 0) {
            let nrofContCarriers = -1;
            for (const oneCCGVariant of this.contiguousCarriers) {
                oneCCGVariant.validate(aChBwList, aBcList);
                if (nrofContCarriers === -1) {
                    nrofContCarriers = oneCCGVariant.getNrofCarriers();
                } else if (oneCCGVariant.getNrofCarriers() !== nrofContCarriers) {
                    throw new ContCarrierVariantMismatchException(`${this.getDescriptor()}: All CCGVariants must have the same number of carriers.`);
                }
            }
            if (nrofContCarriers <= 1) {
                throw new LessThanTwoContigiousCarriersException(`${this.getDescriptor()}: There should be at least two contiguousCarriers but found only ${nrofContCarriers}: ${this.contiguousCarriers}`);
            }
            const bwcTable = this.getBwcTable();
            for (const oneExpectedBwcId of expectedBwcIds) {
                const expectedNrofCarriers = bwcTable[oneExpectedBwcId].nrofCarriers;
                if (nrofContCarriers === expectedNrofCarriers) {
                    expectedBwcIds.splice(expectedBwcIds.indexOf(oneExpectedBwcId), 1);
                    nrofContCarriers = 0;
                }
                break;
            }
            if (nrofContCarriers > 0) {
                throw new TooManyContCarrierException(`${this.getDescriptor()}: contiguousCarriers '${this.contiguousCarriers}' for band ${this.bandNumber} supports ${nrofContCarriers} (more) contiguous carriers. But this does not match the BandCombination's BC-ID '${bc.getTag()}'.`);
            }
        }

        if (this.nonContiguousCarriers.length > 0 || this.contiguousCarriers.length > 0 || this.referencedComponents.length > 0) {
            if (expectedBwcIds.length > 0) {
                throw new UndefinedCarriersException(`${this.getDescriptor()}: BandEntry shall specify the components ${expectedBwcIds} expected according to the BC's bcId '${bc.getTag()}'.`);
            }
        } else {
            if (aBcList === undefined) {
                throw new MissingParentObjectException(`${this.getDescriptor()}: Could not access BC table and hence not validate.`);
            }
            const refBWCs = String(bwcMap.get(bandKey)).replace(/\(/g, "").replace(/\)/g, "").split("-");
            for (const oneRefBWC of refBWCs) {
                let refBCID: BC_ID;
                try {
                    if (oneRefBWC[0] >= "0" && oneRefBWC[0] <= "9") {
                        refBCID = new BC_ID(`${this.bandNumber}(${oneRefBWC})`);
                    } else {
                        refBCID = new BC_ID(`${this.bandNumber}${oneRefBWC}`);
                    }
                } catch (e) {
                    throw new Error(`${this.getDescriptor()}: ${(e as Error).message}`);
                }
                if (!refBCID.isSingleCarrier()) {
                    if (!aBcList.hasBC(refBCID)) {
                        throw new UndefinedBandCombinationException(`${this.getDescriptor()}: Referenced BC-ID ${refBCID} is not defined in BC-table.`);
                    }
                }
            }
        }
    }

    toString(): string {
        if (this.bandNumber !== null) return this.bandNumber.toString();
        return super.toString();
    }

    getTag(): string { return this.toString(); }

    /** Returns the BWC value table (FR1 or FR2) based on this band's frequency range. */
    getBwcTable(): Record<string, { nrofCarriers: number }> {
        if (this.bandNumber!.isFr1()) return bwcValuesFR1;
        return bwcValuesFR2;
    }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        anEncoder.write("{\n", aLevel);
        anEncoder.writeKeyAndValue(KEYS.bandNumber, this.bandNumber!.toString(), aLevel + 1);
        if (this.nonContiguousCarriers.length > 0) {
            anEncoder.writeKeyAndValue(KEYS.nonContiguousCarriers, this.nonContiguousCarriers, aLevel + 1, ",\n");
        }
        if (this.contiguousCarriers.length > 0) {
            anEncoder.writeKeyAndValue(KEYS.contiguousCarriers, this.contiguousCarriers, aLevel + 1, ",\n");
        }
        if (this.referencedComponents.length > 0) {
            anEncoder.writeKeyAndValue(KEYS.referencedComponents, this.referencedComponents, aLevel + 1, ",\n");
        }
        if (this.maxAggBwPerBand > 0) {
            anEncoder.writeKeyAndValue(KEYS.maxAggBwPerBand, this.maxAggBwPerBand, aLevel + 1, ",\n");
        }
        anEncoder.write("\n}", aLevel);
    }

    toHTML(aHtmlTable: HtmlTable, aRow: number = 0, aColumn: number = 0): void {
        let rowIndexToUse = aRow;
        aHtmlTable.setValue(rowIndexToUse, aColumn, this.bandNumber!.toString());
        if (this.maxAggBwPerBand > 0) {
            aHtmlTable.setValue(rowIndexToUse, aColumn + 2, this.maxAggBwPerBand);
        } else {
            aHtmlTable.setValue(rowIndexToUse, aColumn + 2, "&nbsp;");
        }

        let noDefinitionYet = true;
        if (this.contiguousCarriers.length > 0) {
            noDefinitionYet = false;
            let s = "";
            for (const oneVariant of this.contiguousCarriers) {
                if (s !== "") s += "<br>";
                let cc = "";
                for (const oneCC of oneVariant.ccList) {
                    if (cc !== "") cc += " + ";
                    cc += String(oneCC);
                }
                s += "[" + cc + "]";
            }
            aHtmlTable.setValue(rowIndexToUse, aColumn + 1, s);
            rowIndexToUse = aHtmlTable.getNrofRows();
        }
        if (this.nonContiguousCarriers.length > 0) {
            noDefinitionYet = false;
            let s = "";
            for (const oneCarrier of this.nonContiguousCarriers) {
                if (s !== "") s += " + ";
                s += String(oneCarrier);
            }
            aHtmlTable.setValue(rowIndexToUse, aColumn + 1, s);
            rowIndexToUse = aHtmlTable.getNrofRows();
        }
        if (this.referencedComponents.length > 0) {
            noDefinitionYet = false;
            let s = "";
            for (const oneRef of this.referencedComponents) {
                if (s !== "") s += " + ";
                s += oneRef.toHTMLLink();
            }
            aHtmlTable.setValue(rowIndexToUse, aColumn + 1, s);
        }
        if (noDefinitionYet) {
            aHtmlTable.setValue(rowIndexToUse, aColumn + 1, "&nbsp;");
        }
    }
}


////////////////////////////////////////////////////////////////
//                         UlConfig                           //
////////////////////////////////////////////////////////////////

/**
 * An uplink configuration within a CA band combination.
 *
 * Identifies one UL component by either a BC-ID (for multi-carrier UL) or
 * a band number (for single-carrier UL). If the bcId is a single-carrier
 * configuration, it is automatically converted to a bandNumber.
 */
export class UlConfig extends BaseClass {
    /** The BC-ID for multi-carrier UL, or null. */
    bcId: BC_ID | null = null;
    /** The band number for single-carrier UL, or null. */
    bandNumber: BandNumber | null = null;
    /** Optional specification notes. */
    notes: Record<string, unknown> = {};

    /**
     * @param aValue — a dict from JSON or an existing UlConfig to copy.
     * @param aParent — the parent BCS.
     */
    constructor(aValue: Record<string, unknown> | UlConfig, aParent: BaseClass | null = null) {
        super(aParent);
        if (aValue instanceof UlConfig) {
            this.bcId = aValue.bcId;
            this.bandNumber = aValue.bandNumber;
            this.notes = { ...aValue.notes };
        } else {
            for (const oneKey of Object.keys(aValue)) {
                if (oneKey === KEYS.bcId) {
                    const newBcId = new BC_ID(aValue[KEYS.bcId] as string);
                    if (newBcId.isSingleCarrier()) {
                        this.bandNumber = new BandNumber(newBcId.getBandNumbers()[0]);
                    } else {
                        this.bcId = newBcId;
                    }
                } else if (oneKey === KEYS.bandNumber) {
                    this.bandNumber = new BandNumber(aValue[KEYS.bandNumber] as string | number);
                } else if (oneKey === KEYS.notes) {
                    this.notes = { ...(aValue[KEYS.notes] as Record<string, unknown>) };
                } else {
                    throw new UnsupportedKeyException(`${this.getDescriptor()}: Does not support the given key '${oneKey}' as element`);
                }
            }
        }
    }

    validate(aChBwList?: ChannelBandwidthList, aBcList?: BandCombinationList): void {
        if (this.bcId === null && this.bandNumber === null) {
            throw new Error(`${this.getDescriptor()}: Contains neither a valid bcId nor a valid bandNumber`);
        }
        if (this.bcId !== null && this.bandNumber !== null) {
            throw new Error(`${this.getDescriptor()}: Contains both a bcId (${this.bcId}) and a bandNumber (${this.bandNumber}) which is not allowed.`);
        }
        if (this.bandNumber !== null) {
            if (!aChBwList!.hasBand(this.bandNumber)) {
                throw new UndefinedUplinkConfigException(`${this.getDescriptor()}: UL-Config ${this.bandNumber} is not defined in ChBw-table.`);
            }
        } else {
            if (!aBcList!.hasBC(this.bcId!)) {
                throw new UndefinedUplinkConfigException(`${this.getDescriptor()}: UL-Config ${this.bcId} is not defined in BC-table.`);
            }
        }
    }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        anEncoder.write("{\n", aLevel);
        if (this.bcId !== null) {
            anEncoder.writeKeyAndValue(KEYS.bcId, this.bcId.getPrefix() + this.bcId.valueOf(), aLevel + 1);
        } else {
            anEncoder.writeKeyAndValue(KEYS.bandNumber, this.bandNumber!.toString(), aLevel + 1);
        }
        if (Object.keys(this.notes).length > 0) {
            anEncoder.writeKeyAndValue(KEYS.notes, this.notes, aLevel + 1, ",\n");
        }
        anEncoder.write("\n}", aLevel);
    }

    toString(): string {
        if (this.bcId !== null) return String(this.bcId);
        if (this.bandNumber !== null) return String(this.bandNumber);
        return super.toString();
    }

    toStringWithNotes(ulNoteDescriptions?: Record<string, string>): string {
        let base = this.toString();
        if (Object.keys(this.notes).length === 0) return base;
        
        const noteKeys = Object.keys(this.notes).filter(k => this.notes[k] === true).sort();
        if (noteKeys.length === 0) return base;
        
        const notesHtml = noteKeys.map(k => {
            const desc = ulNoteDescriptions && ulNoteDescriptions[k] ? ulNoteDescriptions[k] : k;
            return `<sup title="${desc}">${k}</sup>`;
        }).join(", ");
        return base + notesHtml;
    }

    getTag(): string { return this.toString(); }
}

////////////////////////////////////////////////////////////////
//                            BCS                             //
////////////////////////////////////////////////////////////////

/**
 * A Bandwidth Combination Set within a band combination.
 *
 * Groups a BCS-ID with its list of band entries (one per band) and
 * optional UL configurations. Each BCS represents one set of allowed
 * bandwidth combinations for the parent BC.
 */
export class BCS extends BaseClass {
    /** The BCS-ID (0–31). */
    bcsId: BCS_ID | number = -1;
    /** UL configurations for this BCS. */
    ulConfigList: UlConfig[] = [];
    /** Band entries (one per band in the combination). */
    bandList: BandEntry[] = [];

    /**
     * @param aValue — a dict from JSON or an existing BCS to copy.
     * @param aParent — the parent BC.
     */
    constructor(aValue: Record<string, unknown> | BCS, aParent: BaseClass | null = null) {
        super(aParent);
        if (aValue instanceof BCS) {
            this.bcsId = aValue.bcsId;
            this.ulConfigList = aValue.ulConfigList.slice();
            for (const oneElement of aValue.bandList) {
                if (this.hasBandEntry(oneElement.bandNumber!)) {
                    throw new DuplicateBandEntryException(`${this.getDescriptor()}: Contains already an entry for band '${oneElement.bandNumber}'`);
                }
                this.bandList.push(new BandEntry(oneElement, this));
            }
        } else {
            for (const oneKey of Object.keys(aValue)) {
                if (oneKey === KEYS.bcsId) {
                    this.bcsId = new BCS_ID(aValue[KEYS.bcsId] as number | string);
                } else if (oneKey === KEYS.bandList) {
                    for (const oneElement of aValue[KEYS.bandList] as unknown[]) {
                        const newBandEntry = new BandEntry(oneElement as Record<string, unknown>, this);
                        if (this.hasBandEntry(newBandEntry.bandNumber!)) {
                            throw new DuplicateBandEntryException(`${this.getDescriptor()}: Contains already an entry for band '${newBandEntry.bandNumber}'`);
                        }
                        this.bandList.push(newBandEntry);
                    }
                } else if (oneKey === KEYS.ulConfigList) {
                    for (const oneUlConfig of aValue[KEYS.ulConfigList] as unknown[]) {
                        const newUlConfig = new UlConfig(oneUlConfig as Record<string, unknown>, this);
                        if (this.hasUlConfig(newUlConfig)) {
                            throw new DuplicateUplinkConfigException(`${this.getDescriptor()}: Contains already an UL Config '${newUlConfig}'.`);
                        }
                        this.ulConfigList.push(newUlConfig);
                    }
                } else {
                    throw new UnsupportedKeyException(`${this.getDescriptor()}: Does not support the given key '${oneKey}' as element`);
                }
            }
        }
    }

    validate(aChBwList?: ChannelBandwidthList, aBcList?: BandCombinationList): void {
        if (+this.bcsId < 0) {
            throw new MissingBandwidthCombinationSetIdException(`${this.getDescriptor()}: A band combination shall contain a valid 'bcsId'`);
        }
        if (this.bandList.length === 0) {
            throw new MissingBandListException(`${this.getDescriptor()}: A band combination shall contain a 'bandList' with at least one entry.`);
        }
        for (const oneElement of this.bandList) {
            oneElement.validate(aChBwList, aBcList);
        }
        for (const oneUlConfig of this.ulConfigList) {
            oneUlConfig.validate(aChBwList, aBcList);
        }
    }

    /** Returns true if this BCS already contains a band entry for the given band. */
    hasBandEntry(aBandNumber: BandNumber): boolean {
        return this.bandList.some(one => one.bandNumber !== null && one.bandNumber.asInt() === aBandNumber.asInt());
    }

    /** Returns true if this BCS already contains the given UL configuration. */
    hasUlConfig(anUlConfig: UlConfig): boolean {
        for (const oneUlConfig of this.ulConfigList) {
            if (anUlConfig.bcId !== null && oneUlConfig.bcId !== null && anUlConfig.bcId.equals(oneUlConfig.bcId)) return true;
            if (anUlConfig.bandNumber !== null && oneUlConfig.bandNumber !== null && anUlConfig.bandNumber.asInt() === oneUlConfig.bandNumber.asInt()) return true;
        }
        return false;
    }

    toString(): string {
        if (+this.bcsId >= 0) return String(this.bcsId);
        return super.toString();
    }

    getTag(): string { return this.toString(); }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        anEncoder.write("{\n", aLevel);
        anEncoder.writeKeyAndValue(KEYS.bcsId, +this.bcsId, aLevel + 1);
        if (this.ulConfigList.length > 0) {
            const sorted = this.ulConfigList.slice().sort(compareUlConfigs);
            anEncoder.writeKeyAndValue(KEYS.ulConfigList, sorted, aLevel + 1, ",\n");
        }
        anEncoder.writeKeyAndValue(KEYS.bandList, this.bandList, aLevel + 1, ",\n");
        anEncoder.write("\n}", aLevel);
    }

    toHTML(aHtmlTable: HtmlTable, aRow: number = 0, aColumn: number = 0, ulNoteDescriptions?: Record<string, string>): void {
        let rowIndexToUse = aRow;
        aHtmlTable.setValue(rowIndexToUse, aColumn, +this.bcsId);
        if (this.ulConfigList.length > 0) {
            let s = "";
            for (const oneUlConfig of this.ulConfigList) {
                if (s !== "") s += ", ";
                s += oneUlConfig.toStringWithNotes(ulNoteDescriptions);
            }
            aHtmlTable.setValue(rowIndexToUse, aColumn + 1, s);
        } else {
            aHtmlTable.setValue(rowIndexToUse, aColumn + 1, "&nbsp;");
        }
        for (const oneBandEntry of this.bandList) {
            oneBandEntry.toHTML(aHtmlTable, rowIndexToUse, aColumn + 2);
            rowIndexToUse = aHtmlTable.getNrofRows();
        }
    }
}

////////////////////////////////////////////////////////////////
//                             BC                             //
////////////////////////////////////////////////////////////////

/**
 * A band combination (BC) — the top-level CA configuration.
 *
 * Contains a BC-ID, one or more Bandwidth Combination Sets (BCS), and
 * optional notes. Corresponds to one `CA_*.json` file.
 */
export class BC extends BaseClass {
    /** The BC-ID identifying this band combination. */
    bcId: BC_ID | null = null;
    /** The list of Bandwidth Combination Sets. */
    bcsList: BCS[] = [];
    /** Optional specification notes. */
    notes: Record<string, unknown> = {};
    /** Specification number (e.g. "38.101-1"). */
    specification: string | null = null;
    /** Schema version */
    schemaVersion: string | null = null;

    /**
     * @param aValue — a dict from JSON or an existing BC to copy.
     * @param aParent — the parent BandCombinationList.
     */
    constructor(aValue: Record<string, unknown> | BC, aParent: BaseClass | null = null) {
        super(aParent);
        if (aValue instanceof BC) {
            this.bcId = aValue.bcId;
            for (const oneElement of aValue.bcsList) {
                const newBCS = new BCS(oneElement, this);
                if (this.hasBCS(newBCS.bcsId as BCS_ID)) {
                    throw new DuplicateBcsException(`${this.getDescriptor()}: BC contains already a BCS with bcsId '${newBCS.bcsId}' as element`);
                }
                this.bcsList.push(newBCS);
            }
            this.notes = { ...aValue.notes };
            this.specification = aValue.specification;
            this.schemaVersion = aValue.schemaVersion;
        } else {
            for (const oneKey of Object.keys(aValue)) {
                if (oneKey === KEYS.bcId) {
                    try {
                        this.bcId = new BC_ID(aValue[KEYS.bcId] as string);
                    } catch (e) {
                        throw new Error(`BC('${aValue[KEYS.bcId]}'): ${(e as Error).message}`);
                    }
                } else if (oneKey === KEYS.bcsList) {
                    for (const oneElement of aValue[KEYS.bcsList] as unknown[]) {
                        const newBCS = new BCS(oneElement as Record<string, unknown>, this);
                        if (this.hasBCS(newBCS.bcsId as BCS_ID)) {
                            throw new DuplicateBcsException(`${this.getDescriptor()}: BC contains already a BCS with bcsId '${newBCS.bcsId}' as element`);
                        }
                        this.bcsList.push(newBCS);
                    }
                } else if (oneKey === KEYS.notes) {
                    this.notes = { ...(aValue[KEYS.notes] as Record<string, unknown>) };
                } else if (oneKey === KEYS.specification) {
                    this.specification = aValue[KEYS.specification] as string;
                } else if (oneKey === KEYS.schemaVersion) {
                    this.schemaVersion = aValue[KEYS.schemaVersion] as string;
                } else {
                    throw new UnsupportedKeyException(`${this.getDescriptor()}: Does not support the given key '${oneKey}' as element`);
                }
            }
        }
    }

    validate(aChBwList?: ChannelBandwidthList, aBcList?: BandCombinationList): void {
        if (this.bcId === null) {
            throw new MissingBcIdException(`${this.getDescriptor()}: A band combination shall contain a 'bcId' key`);
        }
        const expectedSpec = this.bcId.getSpecification();
        if (this.specification === null) {
            this.specification = expectedSpec;
        } else if (this.specification !== expectedSpec) {
            throw new InvalidSpecificationException(`${this.getDescriptor()}: specification is '${this.specification}' but expected '${expectedSpec}' based on BC-ID.`);
        }
        if (this.bcsList.length === 0) {
            throw new MissingBcsListException(`${this.getDescriptor()}: A band combination shall contain at least one BCS`);
        }
        for (const oneBCS of this.bcsList) {
            oneBCS.validate(aChBwList, aBcList);
        }
    }

    /** Returns true if this BC contains a BCS with the given BCS-ID. */
    hasBCS(aBcsId: BCS_ID | number): boolean {
        return this.bcsList.some(one => +one.bcsId === +aBcsId);
    }

    toString(): string {
        if (this.bcId !== null) return this.bcId.toString();
        return super.toString();
    }

    getTag(): string {
        if (this.bcId !== null) return this.bcId.toString();
        return super.toString();
    }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        anEncoder.write("{\n", aLevel);
        if (this.specification !== null) {
            anEncoder.writeKeyAndValue(KEYS.specification, this.specification, aLevel + 1, "", ",\n");
        }
        if (this.schemaVersion !== null) {
            anEncoder.writeKeyAndValue(KEYS.schemaVersion, this.schemaVersion, aLevel + 1, "", ",\n");
        }
        anEncoder.writeKeyAndValue(KEYS.bcId, this.bcId!.getPrefix() + this.bcId!.valueOf(), aLevel + 1, "", ",\n");
        anEncoder.writeKeyAndValue(KEYS.bcsList, this.bcsList, aLevel + 1);
        if (Object.keys(this.notes).length > 0) {
            anEncoder.writeKeyAndValue(KEYS.notes, this.notes, aLevel + 1, ",\n");
        }
        anEncoder.write("\n}", aLevel);
    }

    toHTML(aHtmlTable: HtmlTable, aRow: number = 0, aColumn: number = 0, ulNoteDescriptions?: Record<string, string>, dlNoteDescriptions?: Record<string, string>): void {
        let rowIndexToUse = aHtmlTable.getNrofRows();
        let bcIdStr = this.bcId!.valueOf();
        
        // Add BC-level notes as superscript footnotes
        if (Object.keys(this.notes).length > 0) {
            const noteKeys = Object.keys(this.notes).filter(k => this.notes[k] === true).sort();
            if (noteKeys.length > 0) {
                const notesHtml = noteKeys.map(k => {
                    const desc = dlNoteDescriptions && dlNoteDescriptions[k] ? dlNoteDescriptions[k] : k;
                    return `<sup title="${desc}">${k}</sup>`;
                }).join(", ");
                bcIdStr += notesHtml;
            }
        }
        
        aHtmlTable.setValue(rowIndexToUse, aColumn, bcIdStr);
        for (const oneBCS of this.bcsList) {
            oneBCS.toHTML(aHtmlTable, rowIndexToUse, aColumn + 1, ulNoteDescriptions);
            rowIndexToUse = aHtmlTable.getNrofRows();
        }
    }
}


////////////////////////////////////////////////////////////////
//                   BandCombinationList                      //
////////////////////////////////////////////////////////////////

function compareUlConfigs(a: UlConfig, b: UlConfig): number {
    // Band numbers come before BC-IDs
    if (a.bandNumber !== null && b.bandNumber !== null) {
        return a.bandNumber.asInt() - b.bandNumber.asInt();
    }
    if (a.bandNumber !== null) return -1;
    if (b.bandNumber !== null) return 1;
    // Both have BC-IDs: use BC_ID sort order
    if (a.bcId!.lessThan(b.bcId!)) return -1;
    if (a.bcId!.greaterThan(b.bcId!)) return 1;
    return 0;
}

function compareBCs(bc1: BC, bc2: BC): number {
    if (bc1.bcId!.lessThan(bc2.bcId!)) return -1;
    if (bc1.bcId!.greaterThan(bc2.bcId!)) return 1;
    return 0;
}

/**
 * Collection of CA band combinations.
 *
 * Keyed by BC-ID string (e.g. `"CA_n1A-n78C"`). Supports loading from
 * individual JSON files or a single multi-BC file, cross-reference
 * validation against the channel bandwidth table, and export to JSON or HTML.
 */
export class BandCombinationList extends BaseList {
    /** HTML table used for HTML export. */
    html: HtmlTable;
    private _skipSingleCarrierBCs: boolean = true;

    constructor(aParent: BaseClass | null = null) {
        super(aParent);
        this.html = new HtmlTable();
    }

    protected _createEntry(aValue: unknown, aParent: BaseList): BaseClass {
        return new BC(aValue as Record<string, unknown> | BC, aParent);
    }

    protected _getEntryId(anEntry: BaseClass): string {
        return (anEntry as BC).bcId!.toString();
    }

    /** Returns true if a BC with the given BC-ID exists in this list. */
    hasBC(aBcId: BC_ID | string): boolean {
        const key = aBcId instanceof BC_ID ? aBcId.toString() : String(aBcId);
        return this.data.has(key);
    }

    /**
     * Validates all BCs, passing the channel bandwidth table and this list
     * for cross-reference checks. Throws on the first error.
     */
    validate(): void {
        if (this.data.size === 0) {
            throw new NoBandCombinationsException(`${this.getDescriptor()}: List contains no entries.`);
        }
        const parent = this.getParent();
        const chBwList = parent !== null && "chBwList" in (parent as Record<string, unknown>) ? (parent as Record<string, unknown>).chBwList as ChannelBandwidthList : undefined;
        for (const oneEntry of this.data.values()) {
            (oneEntry as BC).validate(chBwList, this);
        }
    }

    /**
     * Validates all BCs, collecting errors instead of throwing.
     * @returns an array of error messages (empty if all valid).
     */
    validateCollectErrors(): string[] {
        const errors: string[] = [];
        if (this.data.size === 0) {
            errors.push(`${this.getDescriptor()}: List contains no entries.`);
            return errors;
        }
        const parent = this.getParent();
        const chBwList = parent !== null && "chBwList" in (parent as Record<string, unknown>) ? (parent as Record<string, unknown>).chBwList as ChannelBandwidthList : undefined;
        for (const oneEntry of this.data.values()) {
            try {
                (oneEntry as BC).validate(chBwList, this);
            } catch (e) {
                errors.push(String((e as Error).message ?? e));
            }
        }
        return errors;
    }

    /** Loads BCs from a single JSON file containing a bandCombinationList array. */
    loadFromFile(aJsonFile: string): void {
        const tempDict = LoadJsonFileToDict(aJsonFile);
        logger.log(`${this.getDescriptor()}: Adding band combinations.`);
        for (const oneKey of Object.keys(tempDict)) {
            if (oneKey === KEYS.bandCombinationList) {
                this.addAll(tempDict[KEYS.bandCombinationList] as unknown[]);
            } else {
                throw new UnsupportedKeyException(`${this.getDescriptor()}: Unknown key: '${oneKey}'`);
            }
        }
        logger.log(`${this.getDescriptor()}: Starting validation.`);
        this.validate();
        logger.log(`${this.getDescriptor()}: Successfully imported ${(tempDict[KEYS.bandCombinationList] as unknown[]).length} Band Combinations from file '${aJsonFile}' and validated the entire list of ${this.data.size} BCs.`);
    }

    protected _getTargetSubfolder(anEntry: BaseClass): string {
        const bcId = (anEntry as BC).bcId!;
        if (!(bcId instanceof BC_ID)) {
            throw new Error(`${this.getDescriptor()}: Got undetected BC element. Cannot store this: '${bcId}'.`);
        }
        if (bcId.isFr1()) {
            if (bcId.isDualConnectivity()) return path.join("ts-38.101-1", "NR_Inter-band_DC_FR1");
            if (bcId.isIntraBand()) return path.join("ts-38.101-1", "NR_Intra-band_CA_FR1");
            return path.join("ts-38.101-1", "NR_Inter-band_CA_FR1");
        }
        if (bcId.isFr2()) {
            if (bcId.isDualConnectivity()) {
                throw new Error(`${this.getDescriptor()}: Found FR2-only DC combination which should not exist: '${bcId.getPrefix()}${bcId.valueOf()}'.`);
            }
            if (bcId.isIntraBand()) return path.join("ts-38.101-2", "NR_Intra-band_CA_FR2");
            return path.join("ts-38.101-2", "NR_Inter-band_CA_FR2");
        }
        if (bcId.isDualConnectivity()) {
            throw new Error(`${this.getDescriptor()}: Found DC configurations for 38.101-3. Unexpected since their BC_ID was not decoded thus far: '${bcId.getPrefix()}${bcId.valueOf()}'.`);
        }
        return path.join("ts-38.101-3", "NR_Inter-band_CA_FR1_and_FR2");
    }

    protected _getFileName(anEntry: BaseClass): string {
        const bc = anEntry as BC;
        return `${bc.bcId!.getPrefix()}${bc.bcId!.valueOf()}.json`;
    }

    protected _shouldStoreEntry(anEntry: BaseClass): boolean {
        if (this._skipSingleCarrierBCs && (anEntry as BC).bcId!.isSingleCarrier()) return false;
        return true;
    }

    /**
     * Stores all BCs as individual JSON files under the appropriate subfolders.
     * @param aFolder — the root output folder.
     * @param skipSingleCarrierBCs — if true (default), omit single-carrier BCs.
     */
    storeAsJsonFiles(aFolder: string, skipSingleCarrierBCs: boolean = true): void {
        this._skipSingleCarrierBCs = skipSingleCarrierBCs;
        super.storeAsJsonFiles(aFolder);
    }

    /** Exports all BCs to an HTML table file, sorted by BC-ID. */
    storeAsHtmlFile(aFileName: string): void {
        BandCombinationList.addTableHeaders(this.html);

        const sorted = [...this.data.values()].sort((a, b) => compareBCs(a as BC, b as BC));
        for (const oneBC of sorted) {
            (oneBC as BC).toHTML(this.html);
        }

        this.html.dump(aFileName);
        logger.log(`${this.getDescriptor()}: Wrote ${this.data.size} BCs to HTML file '${aFileName}'`);
    }

    /**
     * Adds the standard BC table headers to an HtmlTable.
     * @param aHtmlTable — the table to add headers to (modifies row 0).
     */
    static addTableHeaders(aHtmlTable: HtmlTable): void {
        aHtmlTable.setValue(0, 0, "DL Configuration");
        aHtmlTable.setValue(0, 1, "BCS-ID");
        aHtmlTable.setValue(0, 2, "UL Configurations");
        aHtmlTable.setValue(0, 3, "Bands");
        aHtmlTable.setValue(0, 4, "Carrier bandwidths [MHz] or referenced BCs");
        aHtmlTable.setValue(0, 5, "Max aggregated BW [MHz]");
    }

    /**
     * Renders a single BC as a complete HTML table string.
     * @param data — Raw JSON object containing BC data
     * @param ulNoteDescriptions — UL note descriptions for tooltips
     * @param dlNoteDescriptions — DL note descriptions for tooltips
     * @returns HTML table string with headers and one BC row
     */
    static renderAsHtml(data: Record<string, unknown>, ulNoteDescriptions?: Record<string, string>, dlNoteDescriptions?: Record<string, string>): string {
        const bc = new BC(data);
        const htmlTable = new HtmlTable();
        BandCombinationList.addTableHeaders(htmlTable);
        bc.toHTML(htmlTable, 0, 0, ulNoteDescriptions, dlNoteDescriptions);
        return htmlTable.toHtmlString();
    }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        throw new Error("BandCombinationList.toJSON() is not implemented");
    }
}

export { MAX_BCS_ID };
