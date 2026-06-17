// ChannelBandwidthPerBand.ts — Channel bandwidth data model

import { RAN4JsonEncoder, LoadJsonFileToDict } from "./JsonTools.js";
import { BaseClass, BaseList, KEYS, UnsupportedKeyException, InvalidInputTypeException } from "./Utils.js";
import { logger } from "./Logger.js";
import { HtmlTable } from "./HtmlTable.js";
import { BandNumber } from "./BandNumber.js";
import { SCS } from "./SubcarrierSpacing.js";
import { join } from "node:path";

//////////////////////////////
// Constants
/** Maximum supported carrier bandwidth in MHz. */
export const MAX_CARRIER_BW_MHZ = 2400;

//////////////////////////////
// Exceptions
/** Thrown when a carrier bandwidth value is out of range. */
export class InvalidCarrierBandwidthException extends Error {
  constructor(message: string) { super(message); this.name = "InvalidCarrierBandwidthException"; }
}
/** Thrown when a required SCS value is missing. */
export class MissingScsException extends Error {
  constructor(message: string) { super(message); this.name = "MissingScsException"; }
}
/** Thrown when a required bandwidth list is missing. */
export class MissingBandwidthListException extends Error {
  constructor(message: string) { super(message); this.name = "MissingBandwidthListException"; }
}
/** Thrown when a required band number is missing. */
export class MissingBandNumberException extends Error {
  constructor(message: string) { super(message); this.name = "MissingBandNumberException"; }
}
/** Thrown when a required SCS list is missing. */
export class MissingScsListException extends Error {
  constructor(message: string) { super(message); this.name = "MissingScsListException"; }
}
/** Thrown when the specification field does not match the expected value. */
export class InvalidSpecificationException extends Error {
  constructor(message: string) { super(message); this.name = "InvalidSpecificationException"; }
}

/** Enumeration of uplink/downlink support types for a channel bandwidth. */
export class ENUMS {
  static readonly OPTIONAL = "optional";
  static readonly MANDATORY = "mandatory";
  static readonly UNDEFINED = "undefined";
  static readonly SCELL_ONLY = "scell_only";
}

const VALID_UL_DL_TYPES = [ENUMS.OPTIONAL, ENUMS.MANDATORY, ENUMS.UNDEFINED, ENUMS.SCELL_ONLY];

////////////////////////////////////////////////////////////////
//                    ChannelBandwidth                         //
////////////////////////////////////////////////////////////////

/**
 * A single channel bandwidth entry with uplink/downlink support type.
 *
 * Represents one supported bandwidth value (in MHz) for a given band and SCS,
 * along with whether uplink and downlink are mandatory, optional, undefined,
 * or SCell-only.
 */
export class ChannelBandwidth extends BaseClass {
  /** Bandwidth in MHz. */
  bw: number = 0.0;
  /** Uplink support type (mandatory, optional, undefined, scell_only). */
  uplink: string = ENUMS.MANDATORY;
  /** Downlink support type (mandatory, optional, undefined, scell_only). */
  downlink: string = ENUMS.MANDATORY;

  /**
   * @param aValue — a dict from JSON, an existing ChannelBandwidth to copy, or a plain number.
   * @param aParent — the parent SCSEntry.
   */
  constructor(aValue: Record<string, unknown> | ChannelBandwidth | number, aParent: BaseClass | null = null) {
    super(aParent);

    if (aValue instanceof ChannelBandwidth) {
      this.bw = aValue.bw;
      this.uplink = aValue.uplink;
      this.downlink = aValue.downlink;
    } else if (typeof aValue === "number") {
      this.bw = aValue;
    } else if (typeof aValue === "object" && aValue !== null) {
      for (const oneKey of Object.keys(aValue)) {
        if (oneKey === KEYS.bw) {
          this.bw = aValue[oneKey] as number;
        } else if (oneKey === KEYS.uplink) {
          this.uplink = aValue[oneKey] as string;
        } else if (oneKey === KEYS.downlink) {
          this.downlink = aValue[oneKey] as string;
        } else {
          throw new UnsupportedKeyException(`${this.getDescriptor()}: Does not support the given key '${oneKey}' as element`);
        }
      }
    } else {
      throw new InvalidInputTypeException(`Cannot initialize ChannelBandwidth with an input type of ${typeof aValue}`);
    }
  }

  /** Validates that bw is in range and uplink/downlink types are valid. */
  validate(): this {
    if (this.bw === null || this.bw === undefined || this.bw <= 0.0 || this.bw > MAX_CARRIER_BW_MHZ) {
      throw new InvalidCarrierBandwidthException(
        `Carrier bandwdiths must be in the range (0..${MAX_CARRIER_BW_MHZ}] but was ${this.bw}.`);
    }
    if (!VALID_UL_DL_TYPES.includes(this.uplink)) {
      throw new Error(`The type '${this.uplink}' is not valid for Bandwidth->uplink.`);
    }
    if (!VALID_UL_DL_TYPES.includes(this.downlink)) {
      throw new Error(`The type '${this.downlink}' is not valid for Bandwidth->downlink.`);
    }
    return this;
  }

  getTag(): string { return `${this.bw}`; }

  /** Sets the uplink support type. @returns this for chaining. */
  setUplink(aType: string): this {
    if (!VALID_UL_DL_TYPES.includes(aType)) {
      throw new Error(`The type '${aType}' is not valid for Bandwidth->uplink.`);
    }
    if (aType === ENUMS.UNDEFINED && this.downlink === ENUMS.UNDEFINED) {
      throw new Error(`Uplink cannot be ${ENUMS.UNDEFINED} if downlink is ${ENUMS.UNDEFINED}`);
    }
    this.uplink = aType;
    return this;
  }

  /** Returns the uplink support type. */
  getUplink(): string { return this.uplink; }

  /** Sets the downlink support type. @returns this for chaining. */
  setDownlink(aType: string): this {
    if (!VALID_UL_DL_TYPES.includes(aType)) {
      throw new Error(`The type '${aType}' is not valid for Bandwidth->downlink.`);
    }
    if (aType === ENUMS.UNDEFINED && this.uplink === ENUMS.UNDEFINED) {
      throw new Error(`Donwlink cannot be ${ENUMS.UNDEFINED} if uplink is ${ENUMS.UNDEFINED}`);
    }
    this.downlink = aType;
    return this;
  }

  /** Returns the downlink support type. */
  getDownlink(): string { return this.downlink; }

  /** Returns the bandwidth as a float (MHz). */
  asFloat(): number { return this.bw; }

  toString(): string {
    let s = `${this.bw}`;
    if (this.uplink !== ENUMS.MANDATORY || this.downlink !== ENUMS.MANDATORY) {
      if (this.uplink === ENUMS.MANDATORY) s += "(u";
      else if (this.uplink === ENUMS.OPTIONAL) s += "((u)|";
      else if (this.uplink === ENUMS.SCELL_ONLY) s += "((us)|";
      else s += "(-|";

      if (this.downlink === ENUMS.MANDATORY) s += "d)";
      else if (this.downlink === ENUMS.OPTIONAL) s += "(d))";
      else if (this.downlink === ENUMS.SCELL_ONLY) s += "(ds))";
      else s += "-)";
    }
    return s;
  }

  toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
    anEncoder.write("{\n", aLevel);
    anEncoder.writeKeyAndValue(KEYS.bw, this.bw, aLevel + 1, "", ",\n");
    anEncoder.writeKeyAndValue(KEYS.uplink, this.uplink, aLevel + 1, "", ",\n");
    anEncoder.writeKeyAndValue(KEYS.downlink, this.downlink, aLevel + 1, "", "\n");
    anEncoder.write("}", aLevel);
  }
}

////////////////////////////////////////////////////////////////
//                        SCSEntry                             //
////////////////////////////////////////////////////////////////

/**
 * Groups a subcarrier spacing value with its list of supported channel bandwidths.
 *
 * Each SCSEntry belongs to a ChBwOneBand and contains one SCS value
 * (e.g. 15 kHz, 30 kHz) and the bandwidths supported at that SCS.
 */
export class SCSEntry extends BaseClass {
  /** The subcarrier spacing in kHz. */
  scs!: SCS;
  /** The list of supported channel bandwidths at this SCS. */
  bandwidthList: ChannelBandwidth[] = [];

  /**
   * @param aValue — a dict from JSON or an existing SCSEntry to copy.
   * @param aParent — the parent ChBwOneBand.
   */
  constructor(aValue: Record<string, unknown> | SCSEntry, aParent: BaseClass | null = null) {
    super(aParent);

    if (aValue instanceof SCSEntry) {
      this.scs = aValue.scs;
      for (const oneBw of aValue.bandwidthList) {
        this.bandwidthList.push(new ChannelBandwidth(oneBw, this));
      }
    } else if (typeof aValue === "object" && aValue !== null) {
      for (const oneKey of Object.keys(aValue)) {
        if (oneKey === KEYS.scs) {
          this.scs = new SCS(aValue[KEYS.scs] as number);
        } else if (oneKey === KEYS.bandwidthList) {
          for (const oneBw of aValue[KEYS.bandwidthList] as unknown[]) {
            this.bandwidthList.push(new ChannelBandwidth(oneBw as Record<string, unknown> | number, this));
          }
        } else {
          throw new UnsupportedKeyException(`${this.getDescriptor()}: Does not support the given key '${oneKey}' as element`);
        }
      }
    } else {
      throw new InvalidInputTypeException(`Cannot initialize SCSEntry with an input type of ${typeof aValue}`);
    }
  }

  /** Validates that scs and bandwidthList are present, and validates each bandwidth. */
  validate(): this {
    if (this.scs === null || this.scs === undefined) {
      throw new MissingScsException(`${this.getDescriptor()}: Shall contain a 'scs' key`);
    }
    if (this.bandwidthList === null || this.bandwidthList === undefined) {
      throw new MissingBandwidthListException(`${this.getDescriptor()}: Shall contain a 'bandwidthList' key`);
    }
    for (const oneBW of this.bandwidthList) {
      oneBW.validate();
    }
    return this;
  }

  /** Returns true if the given bandwidth (MHz) is in this SCS entry's bandwidth list. */
  isBandwidthSupported(aBandwidth: number): boolean {
    for (const oneBW of this.bandwidthList) {
      if (oneBW.asFloat() === aBandwidth) return true;
    }
    return false;
  }

  getTag(): string { return `${+this.scs}`; }

  toString(): string { return `${+this.scs} kHz: ${this.bandwidthList}`; }

  toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
    anEncoder.write("{\n", aLevel);
    anEncoder.writeKeyAndValue(KEYS.scs, +this.scs, aLevel + 1, "", ",\n");
    anEncoder.writeKeyAndValue(KEYS.bandwidthList, this.bandwidthList, aLevel + 1, "", "\n");
    anEncoder.write("}", aLevel);
  }

  toHTML(aHtmlTable: HtmlTable, aRow: number = 0, aColumn: number = 0): void {
    aHtmlTable.setValue(aRow, aColumn, `${+this.scs}`);
    aHtmlTable.setValue(aRow, aColumn + 1, this.bandwidthList.map(b => b.toString()).join(", "));
  }
}

////////////////////////////////////////////////////////////////
//                       ChBwOneBand                           //
////////////////////////////////////////////////////////////////

/**
 * Channel bandwidth definition for one NR band.
 *
 * Contains the band number, a list of SCS entries (each with its supported
 * bandwidths), and optional notes. Corresponds to one JSON file in the
 * `FR1_NR_bands` or `FR2_NR_bands` folders.
 */
export class ChBwOneBand extends BaseClass {
  /** The NR band number (e.g. n1, n78). */
  bandNumber: BandNumber | null = null;
  /** SCS entries with their supported bandwidths. */
  scsList: SCSEntry[] = [];
  /** Optional specification notes. */
  notes: Record<string, boolean> = {};
  /** Specification number (e.g. "38.101-1"). */
  specification: string | null = null;
  /** Schema version. */
  schemaVersion: string | null = null;

  /**
   * @param aDict — a dict from JSON or an existing ChBwOneBand to copy.
   * @param aParent — the parent ChannelBandwidthList.
   */
  constructor(aDict: Record<string, unknown> | ChBwOneBand, aParent: BaseClass | null = null) {
    super(aParent);

    if (aDict instanceof ChBwOneBand) {
      this.bandNumber = aDict.bandNumber;
      for (const oneElement of aDict.scsList) {
        this.scsList.push(new SCSEntry(oneElement, this));
      }
      this.notes = { ...aDict.notes };
      this.specification = aDict.specification;
      this.schemaVersion = aDict.schemaVersion;
    } else {
      for (const oneKey of Object.keys(aDict)) {
        if (oneKey === KEYS.bandNumber) {
          this.bandNumber = new BandNumber(aDict[KEYS.bandNumber] as string | number);
        } else if (oneKey === KEYS.scsList) {
          for (const oneScsEntry of aDict[KEYS.scsList] as unknown[]) {
            this.scsList.push(new SCSEntry(oneScsEntry as Record<string, unknown>, this));
          }
        } else if (oneKey === KEYS.notes) {
          for (const oneNote of Object.keys(aDict[KEYS.notes] as Record<string, unknown>)) {
            this.notes[oneNote] = true;
          }
        } else if (oneKey === KEYS.specification) {
          this.specification = aDict[KEYS.specification] as string;
        } else if (oneKey === KEYS.schemaVersion) {
          this.schemaVersion = aDict[KEYS.schemaVersion] as string;
        } else {
          throw new UnsupportedKeyException(`${this.getDescriptor()}: Does not support the given key '${oneKey}' as element`);
        }
      }
    }
  }

  /** Validates that bandNumber and scsList are present, and validates each SCS entry. */
  validate(): this {
    if (this.bandNumber === null) {
      throw new MissingBandNumberException(`${this.getDescriptor()}: Shall contain a 'bandNumber' key`);
    }
    const expectedSpec = this.bandNumber.getSpecification();
    if (this.specification === null) {
      this.specification = expectedSpec;
    } else if (this.specification !== expectedSpec) {
      throw new InvalidSpecificationException(`${this.getDescriptor()}: specification is '${this.specification}' but expected '${expectedSpec}' based on band number.`);
    }
    if (this.scsList.length === 0) {
      throw new MissingScsListException(`${this.getDescriptor()}: Shall contain a 'scsList' key`);
    }
    for (const oneScsEntry of this.scsList) {
      oneScsEntry.validate();
    }
    return this;
  }

  /** Returns true if the given bandwidth (MHz) is supported by any SCS entry in this band. */
  isBandwidthSupported(aBandwidth: number): boolean {
    for (const oneScsEntry of this.scsList) {
      if (oneScsEntry.isBandwidthSupported(aBandwidth)) return true;
    }
    return false;
  }

  getTag(): string {
    if (this.bandNumber !== null) return this.bandNumber.toString();
    return `${this}`;
  }

  toString(): string {
    if (this.bandNumber === null) return "ChBwOneBand";
    return this.bandNumber.toString();
  }

  toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
    anEncoder.write("{\n", aLevel);
    if (this.specification !== null) {
      anEncoder.writeKeyAndValue(KEYS.specification, this.specification, aLevel + 1, "", ",\n");
    }
    if (this.schemaVersion !== null) {
      anEncoder.writeKeyAndValue(KEYS.schemaVersion, this.schemaVersion, aLevel + 1, "", ",\n");
    }
    anEncoder.writeKeyAndValue(KEYS.bandNumber, this.bandNumber!.toString(), aLevel + 1, "", ",\n");
    anEncoder.writeKeyAndValue(KEYS.scsList, this.scsList, aLevel + 1);
    if (Object.keys(this.notes).length > 0) {
      anEncoder.writeKeyAndValue(KEYS.notes, this.notes, aLevel + 1, ",\n");
    }
    anEncoder.write("\n}", aLevel);
  }

  toHTML(aHtmlTable: HtmlTable, aRow: number = 0, aColumn: number = 0): void {
    let rowIndexToUse = aHtmlTable.getNrofRows();
    aHtmlTable.setValue(rowIndexToUse, aColumn, this.bandNumber!.toString());
    for (const oneSCS of this.scsList) {
      oneSCS.toHTML(aHtmlTable, rowIndexToUse, aColumn + 1);
      rowIndexToUse = aHtmlTable.getNrofRows();
    }
    for (const oneNote of Object.keys(this.notes)) {
      aHtmlTable.setValue(rowIndexToUse, aColumn + 2, oneNote);
      rowIndexToUse = aHtmlTable.getNrofRows();
    }
  }
}

////////////////////////////////////////////////////////////////
//                  ChannelBandwidthList                       //
////////////////////////////////////////////////////////////////

/**
 * Collection of channel bandwidth definitions for all NR bands.
 *
 * Keyed by band number string (e.g. `"n1"`, `"n78"`). Supports loading from
 * individual JSON files or a single multi-band file, validation, and export
 * to JSON or HTML.
 */
export class ChannelBandwidthList extends BaseList {
  /** HTML table used for HTML export. */
  html: HtmlTable;

  constructor(aParent: BaseClass | null = null) {
    super(aParent);
    this.html = new HtmlTable();
  }

  protected _createEntry(aValue: unknown, aParent: BaseList): BaseClass {
    return new ChBwOneBand(aValue as Record<string, unknown> | ChBwOneBand, aParent);
  }

  protected _getEntryId(anEntry: BaseClass): string {
    return (anEntry as ChBwOneBand).bandNumber!.toString();
  }

  /** Returns true if the given band number exists in this list. */
  hasBand(aBandNumber: BandNumber | string | number): boolean {
    return this.has(String(aBandNumber));
  }

  /**
   * Returns true if the given bandwidth is supported for the given band.
   * @param aBandNumber — the band to check.
   * @param aBandwidth — the bandwidth in MHz.
   */
  isChBwSupported(aBandNumber: BandNumber | string | number, aBandwidth: number): boolean {
    if (!this.hasBand(aBandNumber)) return false;
    return (this.get(String(aBandNumber)) as ChBwOneBand).isBandwidthSupported(aBandwidth);
  }

  /** Loads channel bandwidths from a single JSON file containing a bandList array. */
  loadFromFile(aJsonFile: string): void {
    const tempDict = LoadJsonFileToDict(aJsonFile);
    logger.log(`${this.getDescriptor()}: Adding channel bandwidths.`);
    for (const oneKey of Object.keys(tempDict)) {
      if (oneKey === KEYS.bandList) {
        this.addAll(tempDict[KEYS.bandList] as unknown[]);
      } else {
        throw new UnsupportedKeyException(`${this.getDescriptor()}: Uknown key: '${oneKey}'`);
      }
    }

    logger.log(`${this.getDescriptor()}: Imported ${(tempDict[KEYS.bandList] as unknown[]).length} Channel BWs. Validating table...`);
    this.validate();
    logger.log(`${this.getDescriptor()}: Successfully imported ${(tempDict[KEYS.bandList] as unknown[]).length} Channel Bandwidths from file '${aJsonFile}' and validated the entire table with ${this.data.size} Channel Bandwidths.`);
  }

  protected _getTargetSubfolder(anEntry: BaseClass): string {
    const chBw = anEntry as ChBwOneBand;
    if (chBw.bandNumber!.isFr1()) {
      return join("ts-38.101-1", "operating bands");
    }
    return join("ts-38.101-2", "operating bands");
  }

  protected _getFileName(anEntry: BaseClass): string {
    return `${(anEntry as ChBwOneBand).getTag()}.json`;
  }

  /** Exports all channel bandwidths to an HTML table file, sorted by band number. */
  storeAsHtmlFile(aFileName: string): void {
    ChannelBandwidthList.addTableHeaders(this.html);

    const sorted = [...this.data.values()].sort((a, b) =>
      +(a as ChBwOneBand).bandNumber! - +(b as ChBwOneBand).bandNumber!
    );
    for (const oneChBw of sorted) {
      (oneChBw as ChBwOneBand).toHTML(this.html);
    }

    this.html.dump(aFileName);
    logger.log(`${this.getDescriptor()}: Wrote ${this.data.size} channel bandwidths to HTML file '${aFileName}'`);
  }

  /** Adds standard band table headers to the given HTML table. */
  static addTableHeaders(aHtmlTable: HtmlTable): void {
    aHtmlTable.setValue(0, 0, 'Band');
    aHtmlTable.setValue(0, 1, 'SCS [kHz]');
    aHtmlTable.setValue(0, 2, 'Bandwidths [MHz]');
  }

  /**
   * Renders a single band as a complete HTML table string.
   * @param data — Raw JSON object containing band data
   * @returns HTML table string with headers and one band row
   */
  static renderAsHtml(data: Record<string, unknown>): string {
    const band = new ChBwOneBand(data);
    const htmlTable = new HtmlTable();
    ChannelBandwidthList.addTableHeaders(htmlTable);
    band.toHTML(htmlTable);
    return htmlTable.toHtmlString();
  }

  toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
    throw new Error("ChannelBandwidthList.toJSON() is not implemented");
  }
}
