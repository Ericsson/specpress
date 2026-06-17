// BWC_ID.ts — Bandwidth Combination ID parsing

import { MAX_CARRIER_BW_MHZ } from "./ChannelBandwidthPerBand.js";

//////////////////////////////
// Exceptions

/** Thrown when a BWC-ID string cannot be parsed or is invalid. */
export class InvalidBwcIdException extends Error {
  constructor(message: string) { super(message); this.name = "InvalidBwcIdException"; }
}

//////////////////////////////
// BWC value table

/**
 * Describes the properties of a single BWC letter (e.g. 'A', 'C', 'D').
 *
 * Each BWC letter maps to a number of contiguous carriers and an aggregated
 * bandwidth range, as defined in 3GPP TS 38.101.
 */
export class BWCValue {
  /** Number of contiguous component carriers. */
  readonly nrofCarriers: number;
  /** Minimum aggregated bandwidth in MHz (exclusive lower bound). */
  readonly minBW: number;
  /** Maximum aggregated bandwidth in MHz (inclusive upper bound). */
  readonly maxBW: number;
  /** Fallback group indices for this BWC letter. */
  readonly fallbackGroup: number[];

  constructor(aNrofCarriers: number, aMinBW: number, aMaxBw: number, aFallbackGroupList: number[] = []) {
    this.nrofCarriers = aNrofCarriers;
    this.minBW = aMinBW;
    this.maxBW = aMaxBw;
    this.fallbackGroup = aFallbackGroupList;
  }
}

/** BWC letter definitions for FR1, as per TS 38.101-1. */
export const bwcValuesFR1: Record<string, BWCValue> = {
  "A": new BWCValue(1,   0, MAX_CARRIER_BW_MHZ, [1, 2, 3]),
  "B": new BWCValue(2,  20, 100, [2, 3]),
  "C": new BWCValue(2, 100, 2 * MAX_CARRIER_BW_MHZ, [1, 3]),
  "D": new BWCValue(3, 200, 3 * MAX_CARRIER_BW_MHZ, [1, 3]),
  "E": new BWCValue(4, 300, 4 * MAX_CARRIER_BW_MHZ, [1, 3]),
  "G": new BWCValue(3, 100, 150, [2]),
  "H": new BWCValue(4, 150, 200, [2]),
  "I": new BWCValue(5, 200, 250, [2]),
  "J": new BWCValue(6, 250, 300, [2]),
  "K": new BWCValue(7, 300, 350, [2]),
  "L": new BWCValue(8, 350, 400, [2]),
  "M": new BWCValue(3,  50, 200, [3]),
  "N": new BWCValue(4,  80, 300, [3]),
  "O": new BWCValue(5, 100, 400, [3]),
};

/** BWC letter definitions for FR2, as per TS 38.101-2. */
export const bwcValuesFR2: Record<string, BWCValue> = {
  "A": new BWCValue(1, 0, 400, [1, 2, 3, 4, 5]),

  "B": new BWCValue(2, 400, 800, [1]),
  "C": new BWCValue(3, 800, 1200, [1]),
  "V": new BWCValue(4, 1200, 1600, [1]),
  "W": new BWCValue(5, 1600, 2000, [1]),

  "D": new BWCValue(2, 200, 400, [2]),
  "E": new BWCValue(3, 400, 600, [2]),
  "F": new BWCValue(4, 600, 800, [2]),
  "R": new BWCValue(5, 800, 1000, [2]),
  "S": new BWCValue(6, 1000, 1200, [2]),
  "T": new BWCValue(7, 1200, 1400, [2]),
  "U": new BWCValue(8, 1400, 1600, [2]),

  "G": new BWCValue(2, 100, 200, [3]),
  "H": new BWCValue(3, 200, 300, [3]),
  "I": new BWCValue(4, 300, 400, [3]),
  "J": new BWCValue(5, 400, 500, [3]),
  "K": new BWCValue(6, 500, 600, [3]),
  "L": new BWCValue(7, 600, 700, [3]),
  "M": new BWCValue(8, 700, 800, [3]),

  "O": new BWCValue(2, 100, 200, [4]),
  "P": new BWCValue(3, 150, 300, [4]),
  "Q": new BWCValue(4, 200, 400, [4]),

  "R2": new BWCValue(2, 200, 400, [5]),
  "R3": new BWCValue(3, 300, 600, [5]),
  "R4": new BWCValue(4, 400, 800, [5]),
  "R5": new BWCValue(5, 500, 1000, [5]),
  "R6": new BWCValue(6, 600, 1200, [5]),
  "R7": new BWCValue(7, 700, 1400, [5]),
  "R8": new BWCValue(8, 800, 1600, [5]),
  "R9": new BWCValue(9, 900, 1800, [5]),
  "R10": new BWCValue(10, 1000, 2000, [5]),
  "R11": new BWCValue(11, 1100, 2200, [5]),
  "R12": new BWCValue(12, 1200, 2400, [5]),
};

/**
 * Checks whether a BWC letter is valid for the given frequency range.
 *
 * @param aBwc — the BWC letter to check (e.g. `"A"`, `"C"`, `"R3"`).
 * @param aFrequencyRange — 0 = either FR, 1 = FR1 only, 2 = FR2 only.
 * @returns true if the letter is defined in the corresponding BWC table.
 */
export function IsValidBwcCharacter(aBwc: string, aFrequencyRange: number = 0): boolean {
  if (aFrequencyRange === 0) {
    if (aBwc in bwcValuesFR1 || aBwc in bwcValuesFR2) return true;
  }
  if (aFrequencyRange === 1) {
    if (aBwc in bwcValuesFR1) return true;
  }
  if (aFrequencyRange === 2) {
    if (aBwc in bwcValuesFR2) return true;
  }
  return false;
}

/**
 * Compares two BWC value strings with natural ordering:
 * alphabetical by letter prefix, then numeric by trailing digits.
 * e.g. "R" < "R2" < "R9" < "R10" < "R12" < "S"
 */
export function compareBwcValues(a: string, b: string): number {
  const re = /^([A-Z]+)(\d*)$/;
  const ma = a.match(re)!, mb = b.match(re)!;
  if (ma[1] !== mb[1]) return ma[1] < mb[1] ? -1 : 1;
  const na = ma[2] ? parseInt(ma[2], 10) : -1;
  const nb = mb[2] ? parseInt(mb[2], 10) : -1;
  return na - nb;
}

//////////////////////////////
// BWC_ID class

/**
 * Represents a Bandwidth Combination Identifier for a single band within a BC-ID.
 *
 * A BWC-ID is either a single letter (e.g. `"A"`, `"C"`) for a simple carrier
 * configuration, or a parenthesized multi-component expression (e.g. `"(2A-C)"`)
 * describing contiguous carrier groups with optional multipliers.
 *
 * Examples:
 * - `"A"` — single non-contiguous carrier
 * - `"C"` — two contiguous carriers (FR1: 100–200 MHz aggregate)
 * - `"(2A)"` — two non-contiguous single carriers
 * - `"(2A-C)"` — two non-contiguous single carriers plus one contiguous pair
 */
export class BWC_ID {
  private readonly str: string;
  /** Whether this BWC-ID was successfully parsed. */
  readonly isValid: boolean;
  /** The individual contiguous carrier group letters after expansion. */
  readonly contGroups: string[];

  /**
   * Parses a BWC-ID string.
   *
   * @param aString — the BWC-ID string to parse (e.g. `"A"`, `"(2A-C)"`).
   * @throws InvalidBwcIdException if the string cannot be parsed.
   */
  constructor(aString: string) {
    this.str = aString;

    if (IsValidBwcCharacter(aString)) {
      this.isValid = true;
      this.contGroups = [aString];
      return;
    }

    const tempGroups: string[] = [];
    if (aString.startsWith("(") && aString.endsWith(")") && aString.length >= 4) {
      let previousBWC = "";
      const inner = aString.slice(1, -1);
      for (const oneComponent of inner.split("-")) {
        let oneMultiplier = "";
        let curNrofContBands = 1;
        let oneBWC = "";
        for (let i = 0; i < oneComponent.length; i++) {
          const c = oneComponent[i];
          if (c >= "0" && c <= "9") {
            oneMultiplier += c;
          } else {
            if (oneMultiplier.length > 0) {
              curNrofContBands = parseInt(oneMultiplier, 10);
              if (curNrofContBands < 1 || curNrofContBands > 32) {
                throw new InvalidBwcIdException(
                  `The given string '${aString}' contains an invalid BWC multiplier '${oneMultiplier}'.`);
              }
            }
            oneBWC = oneComponent.slice(i);
            if (!IsValidBwcCharacter(oneBWC)) {
              throw new InvalidBwcIdException(
                `The given string '${aString}' contains an invalid BWC character '${oneBWC}'.`);
            }
            if (previousBWC !== "" && compareBwcValues(previousBWC, oneBWC) >= 0) {
              throw new InvalidBwcIdException(
                `The given string '${aString}' contains BWC components in the wrong order: '${previousBWC}' >= '${oneBWC}'.`);
            }
            for (let j = 0; j < curNrofContBands; j++) {
              tempGroups.push(oneBWC);
            }
            previousBWC = oneBWC;
            break;
          }
        }
      }

      if (tempGroups.length > 0) {
        this.isValid = true;
        this.contGroups = tempGroups;
      } else {
        throw new InvalidBwcIdException(
          `Could not find a valid BWC component in the given string '${aString}'.`);
      }
    } else {
      throw new InvalidBwcIdException(
        `The given string '${aString}' is neither a valid single- nor multi-component BWC.`);
    }
  }

  /** Returns the expanded list of contiguous carrier group letters. */
  getContGroups(): string[] { return this.contGroups; }

  /** Returns the number of non-contiguous carrier groups (i.e. the length of contGroups). */
  getNrofNonContiguousCarriers(): number { return this.contGroups.length; }

  /**
   * Returns the total number of component carriers across all contiguous groups.
   * 
   * Sums the nrofCarriers from the BWCValue for each contiguous group letter.
   * E.g., "(2A-C)" with FR1 returns 4 (1+1+2), "C" with FR1 returns 2.
   * 
   * @param aFrequencyRange — 0 = try both FR1 and FR2, 1 = FR1 only, 2 = FR2 only
   * @returns total number of physical carriers
   */
  getNrofCarriers(aFrequencyRange: number = 0): number {
    let total = 0;
    for (const groupLetter of this.contGroups) {
      let bwcValue = null;
      if (aFrequencyRange === 0 || aFrequencyRange === 1) {
        bwcValue = bwcValuesFR1[groupLetter];
      }
      if (!bwcValue && (aFrequencyRange === 0 || aFrequencyRange === 2)) {
        bwcValue = bwcValuesFR2[groupLetter];
      }
      if (bwcValue) {
        total += bwcValue.nrofCarriers;
      } else {
        // Unknown BWC letter, assume 1 carrier as fallback
        total += 1;
      }
    }
    return total;
  }

  private contStr(): string {
    return [...this.contGroups].sort(compareBwcValues).join("");
  }

  /** Returns the original BWC-ID string. */
  valueOf(): string { return this.str; }

  /** Returns the original BWC-ID string. */
  toString(): string { return this.str; }

  /** Returns true if this BWC-ID has the same string representation as `other`. */
  equals(other: BWC_ID | string): boolean {
    const otherStr = other instanceof BWC_ID ? other.str : other;
    return this.str === otherStr;
  }

  /**
   * Ordering comparison: fewer non-contiguous carriers first,
   * then alphabetical by sorted contiguous group letters.
   */
  lessThan(value: BWC_ID | string): boolean {
    const other = value instanceof BWC_ID ? value : new BWC_ID(value);
    if (this.getNrofNonContiguousCarriers() < other.getNrofNonContiguousCarriers()) return true;
    if (this.getNrofNonContiguousCarriers() === other.getNrofNonContiguousCarriers()) {
      const cmp = compareBwcValues(this.contStr(), other.contStr());
      if (cmp < 0) return true;
    }
    return false;
  }

  /** Returns true if this BWC-ID is strictly greater than `value`. */
  greaterThan(value: BWC_ID | string): boolean {
    return !this.equals(value) && !this.lessThan(value);
  }

  /** Returns true if this BWC-ID is less than or equal to `value`. */
  lessOrEqual(value: BWC_ID | string): boolean {
    return this.equals(value) || this.lessThan(value);
  }

  /** Returns true if this BWC-ID is greater than or equal to `value`. */
  greaterOrEqual(value: BWC_ID | string): boolean {
    return !this.lessThan(value);
  }
}
