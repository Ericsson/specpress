// BC_ID.ts — Band Combination ID parsing

import { BWC_ID } from "./BWC_ID.js";
import { BandNumber, RAT } from "./BandNumber.js";

//////////////////////////////
// Exceptions

/** Thrown when a BC-ID string cannot be parsed or is structurally invalid. */
export class InvalidBcIdException extends Error {
  constructor(message: string) { super(message); this.name = "InvalidBcIdException"; }
}

//////////////////////////////
// Enums

/**
 * The type of band combination.
 * - SC — single carrier (one band, one carrier)
 * - CA — carrier aggregation (NR-only, multiple carriers or bands)
 * - NRDC — NR dual connectivity
 * - ENDC — EN-DC (E-UTRA anchor + NR secondary)
 * - NEDC — NE-DC (NR anchor + E-UTRA secondary)
 */
export enum BcType {
  SC   = "SC",
  CA   = "CA",
  NRDC = "NR-DC",
  ENDC = "EN-DC",
  NEDC = "NE-DC",
}

//////////////////////////////
// Helper functions

/**
 * Splits a single band entry string (e.g. `"n78C"`, `"3A"`, `"(n)40CA"`) into
 * its RAT/BcType, BandNumber, and BWC-ID components.
 *
 * @param aString — a single band entry from a BC-ID (e.g. `"n1A"`, `"7C"`, `"(n)3AA"`).
 * @returns a tuple of [RAT or BcType, BandNumber, BWC_ID or raw string].
 * @throws InvalidBcIdException if the string cannot be parsed.
 */
export function SplitBandEntry(aString: string): [RAT | BcType, BandNumber, BWC_ID | string] {
  if (aString === null || aString === undefined) {
    throw new Error("aString must not be None.");
  }
  if (aString === "") {
    throw new Error("aString must not be empty.");
  }

  let s = aString.trim();
  let rat: RAT | BcType;
  let bandNumber: BandNumber;
  let bwcid: BWC_ID | string;

  if (s.includes("(n)")) {
    if (s.startsWith("(n)")) {
      rat = BcType.ENDC;
    } else {
      rat = BcType.NEDC;
    }
    s = s.replaceAll("(n)", "");
  } else if (s.startsWith("n")) {
    rat = RAT.NR;
    s = s.substring(1);
  } else if (s[0] >= "0" && s[0] <= "9") {
    rat = RAT.EUTRA;
  } else {
    throw new Error(`The given string must start with 'n' or with a band number or contain '(n)' but was: '${s}'`);
  }

  let bandNumberStr = "";
  let i = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c >= "0" && c <= "9") {
      bandNumberStr += c;
    } else {
      break;
    }
  }

  if (rat === BcType.NEDC || rat === BcType.ENDC) {
    bwcid = s.substring(i).trim();
    bandNumber = new BandNumber(parseInt(bandNumberStr, 10), RAT.NR);
  } else {
    bwcid = new BWC_ID(s.substring(i));
    if (!bwcid.isValid) {
      throw new InvalidBcIdException(`Could not determine a valid BWC from the given string '${s}'.`);
    }
    bandNumber = new BandNumber(parseInt(bandNumberStr, 10), rat as RAT);
  }

  return [rat, bandNumber, bwcid];
}

/**
 * Splits a BC-ID string into its RAT-level components.
 *
 * For inter-RAT DC identifiers containing `(n)`, the string is split around
 * the `(n)` marker. For NR-only or EUTRA-only identifiers, the string is
 * split on `_` (which separates the NR and EUTRA parts in DC identifiers).
 *
 * @param aString — the BC-ID value string (without prefix).
 * @returns an array of RAT-level component strings.
 */
export function GetRatComponents(aString: string | null): string[] {
  const components: string[] = [];
  if (aString === null || aString === undefined || aString === "") {
    return components;
  }

  const nCount = (aString.match(/\(n\)/g) || []).length;
  if (nCount > 1) {
    throw new Error(`Expecting at most one occurrence of '(n)' but found ${nCount} in '${aString}'`);
  }

  if (nCount === 1) {
    const pos = aString.indexOf("(n)");
    const lowerEdge = aString.lastIndexOf("-", pos);
    let upperEdge = aString.indexOf("-", pos);
    if (upperEdge < 0) upperEdge = aString.length;

    if (lowerEdge > 0) {
      components.push(aString.substring(0, lowerEdge));
    }
    components.push(aString.substring(lowerEdge + 1, upperEdge));
    if (upperEdge < aString.length - 1) {
      components.push(aString.substring(upperEdge + 1));
    }
  } else {
    const underscoreCount = (aString.match(/_/g) || []).length;
    if (underscoreCount > 1) {
      throw new Error(`Expecting at most one occurrence of '_'-separator but found ${underscoreCount} in '${aString}'`);
    }
    components.push(...aString.split("_"));
  }

  return components;
}

//////////////////////////////
// BC_ID class

/**
 * Represents a 3GPP Band Combination Identifier (BC-ID).
 *
 * A BC-ID encodes one or more bands with their BWC-IDs, and optionally a
 * prefix (`CA_` or `DC_`) indicating carrier aggregation or dual connectivity.
 *
 * Examples:
 * - `"CA_n1A-n78C"` — inter-band CA with bands n1 (single carrier) and n78 (contiguous pair)
 * - `"DC_1A-8A_n77(2A)"` — EN-DC with EUTRA bands 1+8 and NR band n77 (two non-contiguous carriers)
 * - `"n78A"` — single-carrier NR configuration
 *
 * The class parses the identifier, determines the BcType (SC, CA, NR-DC, EN-DC, NE-DC),
 * extracts per-band BWC-IDs, and provides comparison operators for sorting.
 */
export class BC_ID {
  private readonly str: string;
  /** The prefix: `"CA_"`, `"DC_"`, or `""`. */
  prefix: string;
  /** If this BC-ID uses SUL naming, the original SUL name; otherwise null. */
  sulName: string | null;
  /** Total number of band entries in this BC-ID. */
  nrofBandEntries: number = 0;
  /** Map from band number string (e.g. `"n78"`) to its BWC-ID or raw DC string. */
  bwcIdsPerBand: Map<string, BWC_ID | string> = new Map();
  /** True if any band has a BWC-ID other than `"A"` (i.e. intra-band CA). */
  intraBand: boolean = false;
  /** The determined combination type (SC, CA, NR-DC, EN-DC, NE-DC). */
  bctype: RAT | BcType | null = null;

  private bandNumberObjects: Map<string, BandNumber> = new Map();

  /**
   * Parses a BC-ID string or copies an existing BC_ID.
   *
   * @param aValue — the BC-ID string (e.g. `"CA_n1A-n78C"`, `"DC_1A_n77A"`)
   *   or an existing BC_ID to copy.
   * @throws InvalidBcIdException if the string cannot be parsed.
   */
  constructor(aValue: string | BC_ID | null) {
    if (aValue === null || aValue === undefined) {
      throw new InvalidBcIdException("A BCID shall not be 'None'.");
    }

    let strValue = aValue instanceof BC_ID ? aValue.str : String(aValue);
    strValue = strValue.replaceAll(" ", "");

    let prefix = "";
    if (strValue.toUpperCase().startsWith("CA_")) {
      prefix = "CA_";
    } else if (strValue.toUpperCase().startsWith("DC_")) {
      prefix = "DC_";
    }
    if (prefix !== "") {
      strValue = strValue.substring(3);
    }

    let tempSUL: string | null = null;
    if (strValue.includes("_SUL_")) {
      tempSUL = strValue;
      strValue = strValue.replace("_SUL_", "_");
    }

    this.str = strValue;
    this.prefix = prefix.toUpperCase();
    this.sulName = tempSUL;

    // If copy-constructing from another BC_ID, copy its parsed state
    if (aValue instanceof BC_ID) {
      this.prefix = aValue.prefix;
      this.sulName = aValue.sulName;
      this.nrofBandEntries = aValue.nrofBandEntries;
      this.bwcIdsPerBand = new Map(aValue.bwcIdsPerBand);
      this.bandNumberObjects = new Map(aValue.bandNumberObjects);
      this.intraBand = aValue.intraBand;
      this.bctype = aValue.bctype;
      return;
    }

    // Parse
    for (const oneRAT of GetRatComponents(this.str)) {
      let prevBandNumber = 0;
      let bandEntries: string[];

      if (oneRAT.startsWith("n")) {
        bandEntries = oneRAT.substring(1).split("-n").map(e => "n" + e);
      } else if (oneRAT[0] >= "0" && oneRAT[0] <= "9") {
        bandEntries = oneRAT.split("-");
      } else if (oneRAT.includes("(n)")) {
        bandEntries = [oneRAT];
      } else {
        throw new InvalidBcIdException(
          `BC-ID '${this.str}' looks like inter-RAT DC but could not determine type of this component: '${oneRAT}'`);
      }

      for (const oneBandEntry of bandEntries) {
        this.nrofBandEntries++;

        const [rat, bandNumber, bwcid] = SplitBandEntry(oneBandEntry);
        if (this.bctype === null) {
          this.bctype = rat;
        } else if ((this.bctype === BcType.NEDC && rat === BcType.ENDC) ||
                   (this.bctype === BcType.ENDC && rat === BcType.NEDC)) {
          throw new InvalidBcIdException(
            `The given BC-ID contains both NE-DC and EN-DC components: '${this.str}'`);
        } else if (this.bctype === BcType.NEDC && rat === RAT.NR) {
          throw new InvalidBcIdException(
            `The given NE-DC BC-ID contains an NR component AFTER EUTRA components: '${this.str}'`);
        } else if (this.bctype === BcType.ENDC && rat === RAT.EUTRA) {
          throw new InvalidBcIdException(
            `The given EN-DC BC-ID contains an EUTRA component AFTER NR components: '${this.str}'`);
        } else if (this.bctype === RAT.NR && (rat === RAT.EUTRA || rat === BcType.NEDC)) {
          this.bctype = BcType.NEDC;
        } else if (this.bctype === RAT.EUTRA && (rat === RAT.NR || rat === BcType.ENDC)) {
          this.bctype = BcType.ENDC;
        }

        const bandKey = bandNumber.toString();
        if (rat === RAT.NR) {
          if (this.bwcIdsPerBand.has(bandKey)) {
            throw new InvalidBcIdException(
              `The given BC-ID contains more than one entry for band number ${bandNumber}: '${this.str}'`);
          }
        }
        if (bandNumber.asInt() < prevBandNumber) {
          throw new InvalidBcIdException(
            `In the given BC-ID (${this.str}) the band in the component '${oneBandEntry}' occurs in the wrong order: 'n${prevBandNumber}' >= 'n${bandNumber}'.`);
        }
        this.bwcIdsPerBand.set(bandKey, bwcid);
        this.bandNumberObjects.set(bandKey, bandNumber);
        prevBandNumber = bandNumber.asInt();

        const bwcStr = bwcid instanceof BWC_ID ? bwcid.toString() : bwcid;
        if (bwcStr !== "A") {
          this.intraBand = true;
        }
      }
    }

    if (this.nrofBandEntries === 0) {
      throw new InvalidBcIdException(`The given BC-ID did not contain any band entries: '${this.str}'`);
    } else if ((this.bctype === BcType.ENDC || this.bctype === BcType.NEDC) && this.prefix === "CA_") {
      throw new InvalidBcIdException(
        `In BC-ID '${this.str}' the prefix ${this.prefix} is incompatible with determined bcType ${this.bctype}`);
    } else if ((this.bctype === BcType.CA || this.bctype === BcType.SC) && this.prefix === "DC_") {
      throw new InvalidBcIdException(
        `In BC-ID '${this.str}' the prefix ${this.prefix} is incompatible with determined bcType ${this.bctype}`);
    } else if (this.nrofBandEntries === 1 && !this.intraBand) {
      this.bctype = BcType.SC;
    } else if (this.bctype === RAT.NR) {
      if (this.prefix === "DC_") {
        this.bctype = BcType.NRDC;
      } else {
        this.bctype = BcType.CA;
        if (this.prefix === "") {
          this.prefix = "CA_";
        }
      }
    }
  }

  /** Returns the BC-ID value string (without prefix). */
  valueOf(): string { return this.str; }

  /** Returns the full BC-ID string including prefix (e.g. `"CA_n1A-n78C"`). */
  toString(): string {
    if (this.sulName !== null) return this.prefix + this.sulName;
    return this.prefix + this.str;
  }

  /** Returns a human-readable description including intra/inter-band and BcType. */
  describe(): string {
    const intra = this.intraBand ? "intra" : "";
    const plus = this.intraBand && this.nrofBandEntries > 1 ? "+" : "";
    const inter = this.nrofBandEntries > 1 ? "inter" : "";
    return `${this}: ${intra}${plus}${inter}-band ${this.bctype}`;
  }

  /** Returns the BandNumber objects in this BC-ID, sorted by numeric value. */
  getBandNumbers(): BandNumber[] {
    return [...this.bandNumberObjects.values()].sort((a, b) => a.asInt() - b.asInt());
  }

  /** Returns the number of distinct bands in this BC-ID. */
  nrofBands(): number { return this.bwcIdsPerBand.size; }

  /**
   * Returns the total number of component carriers across all bands.
   * 
   * Sums the actual carrier count from each band's BWC-ID using getNrofCarriers().
   * E.g., "CA_n1A-n3A" returns 2 (1+1), "CA_n3B" returns 2 (contiguous pair),
   * "CA_n25(2A)-n41(A-C)" returns 5 (2*1 + 1 + 2).
   * 
   * For DC configurations with EUTRA bands, the EUTRA carriers are not parsed
   * (BWC-ID is stored as a raw string), so the count uses a heuristic.
   */
  getNrofCarriers(): number {
    let total = 0;
    for (const [bandKey, bwcid] of this.bwcIdsPerBand.entries()) {
      if (bwcid instanceof BWC_ID) {
        // Determine frequency range from band number
        const bandNumber = this.bandNumberObjects.get(bandKey);
        const frequencyRange = bandNumber && bandNumber.isFr2() ? 2 : 1;
        total += bwcid.getNrofCarriers(frequencyRange);
      } else {
        // For DC strings (EUTRA), heuristic: count uppercase letters
        total += (bwcid.match(/[A-Z]/g) || []).length;
      }
    }
    return total;
  }

  /** Returns true if all carriers belong to a single band. */
  isIntraBand(): boolean { return this.nrofBands() === 1; }

  /** Returns the map from band number string to BWC-ID (or raw DC string). */
  getBwcIDsPerBand(): Map<string, BWC_ID | string> { return this.bwcIdsPerBand; }

  /** Returns true if this is a single-carrier configuration (one band, BWC = 'A'). */
  isSingleCarrier(): boolean {
    if (this.bwcIdsPerBand.size !== 1) return false;
    const val = [...this.bwcIdsPerBand.values()][0];
    const s = val instanceof BWC_ID ? val.toString() : val;
    return s === "A";
  }

  /** Returns true if the prefix is `"DC_"`. */
  isDualConnectivity(): boolean { return this.prefix === "DC_"; }

  /** Returns true if all bands are in FR1. */
  isFr1(): boolean {
    for (const oneBandNumber of this.getBandNumbers()) {
      if (oneBandNumber.isFr2()) return false;
    }
    return true;
  }

  /** Returns true if all bands are in FR2. */
  isFr2(): boolean {
    for (const oneBandNumber of this.getBandNumbers()) {
      if (oneBandNumber.isFr1()) return false;
    }
    return true;
  }

  /** Returns true if at least one band is in FR2. */
  hasFr2(): boolean {
    for (const oneBandNumber of this.getBandNumbers()) {
      if (oneBandNumber.isFr2()) return true;
    }
    return false;
  }

  /** Returns true if this is a pure NR combination (no EUTRA bands, no EN-DC/NE-DC). */
  isNR(): boolean {
    if (this.bctype === BcType.ENDC || this.bctype === BcType.NEDC) return false;
    for (const oneBandNumber of this.getBandNumbers()) {
      if (oneBandNumber.rat === RAT.EUTRA) return false;
    }
    return true;
  }

  /** Determines the specification this BC-ID belongs to. */
  getSpecification(): string {
    if (this.isNR() && this.isFr1()) return "38.101-1";
    if (this.isNR() && this.isFr2()) return "38.101-2";
    return "38.101-3";
  }

  /** Returns the prefix string (`"CA_"`, `"DC_"`, or `""`). */
  getPrefix(): string { return this.prefix ?? ""; }

  /** Returns true if this BC-ID uses SUL naming. */
  isSUL(): boolean { return this.sulName !== null; }

  /** Returns true if this BC-ID has the same value string as `other`. */
  equals(other: BC_ID | string): boolean {
    const otherStr = other instanceof BC_ID ? other.str : other;
    return this.str === otherStr;
  }

  /**
   * Ordering comparison for sorting BC-IDs.
   *
   * Compares first by number of bands (fewer first), then by band number
   * lists lexicographically, then by BWC-IDs per band.
   */
  lessThan(value: BC_ID | string): boolean {
    const other = value instanceof BC_ID ? value : new BC_ID(value);
    const selfBands = this.getBandNumbers();
    const otherBands = other.getBandNumbers();

    if (selfBands.length < otherBands.length) return true;
    if (selfBands.length === otherBands.length) {
      // Compare band number lists
      const cmpBands = compareBandLists(selfBands, otherBands);
      if (cmpBands < 0) return true;
      if (cmpBands === 0) {
        // Compare BWC_IDs per band
        for (const oneBandNumber of selfBands) {
          const key = oneBandNumber.toString();
          const selfBwc = this.bwcIdsPerBand.get(key)!;
          const otherBwc = other.bwcIdsPerBand.get(key)!;
          const selfBwcObj = selfBwc instanceof BWC_ID ? selfBwc : new BWC_ID(selfBwc);
          const otherBwcObj = otherBwc instanceof BWC_ID ? otherBwc : new BWC_ID(otherBwc);
          if (selfBwcObj.lessThan(otherBwcObj)) return true;
        }
      }
    }
    return false;
  }

  /** Returns true if this BC-ID is strictly greater than `value`. */
  greaterThan(value: BC_ID | string): boolean {
    return !this.equals(value) && !this.lessThan(value);
  }

  /** Returns true if this BC-ID is less than or equal to `value`. */
  lessOrEqual(value: BC_ID | string): boolean {
    return this.equals(value) || this.lessThan(value);
  }

  /** Returns true if this BC-ID is greater than or equal to `value`. */
  greaterOrEqual(value: BC_ID | string): boolean {
    return !this.lessThan(value);
  }
}

/** Compares two sorted BandNumber arrays lexicographically by numeric value. */
function compareBandLists(a: BandNumber[], b: BandNumber[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i].asInt() < b[i].asInt()) return -1;
    if (a[i].asInt() > b[i].asInt()) return 1;
  }
  return a.length - b.length;
}
