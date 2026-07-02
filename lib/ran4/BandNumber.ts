// BandNumber.ts — Band number with RAT type and FR1/FR2 classification

import { IsInt } from "./Utils.js";

//////////////////////////////
// Constants

/** Maximum valid NR/EUTRA band number (inclusive). */
export const MAX_BAND_NUMBER = 511;

/** Upper bound of FR1 band numbers. Bands above this value are FR2. */
export const MAX_BAND_NUMBER_FR1 = 250;

//////////////////////////////
// Exceptions

/** Thrown when a band number value is invalid or out of range. */
export class InvalidBandNumberException extends Error {
  constructor(message: string) { super(message); this.name = "InvalidBandNumberException"; }
}

//////////////////////////////
// Enums

/** Radio Access Technology type. */
export enum RAT {
  EUTRA = "EUTRA",
  NR    = "NR",
}

//////////////////////////////
// Main part

/**
 * Represents a 3GPP band number with its associated RAT (NR or E-UTRA).
 *
 * NR band numbers are written with an 'n' prefix (e.g. `n1`, `n78`).
 * E-UTRA band numbers are plain integers (e.g. `1`, `7`).
 *
 * Valid range: 1–511 (inclusive) for both RATs.
 */
export class BandNumber {
  /** The RAT this band number belongs to. */
  readonly rat: RAT;
  private readonly value: number;

  /**
   * Constructs a BandNumber.
   *
   * @param aValue — the band number as a string (e.g. `"n1"`, `"7"`), a plain
   *   integer, or an existing BandNumber to copy.
   * @param aRat — the RAT type; defaults to NR. For NR, string values must be
   *   prefixed with `'n'`. For EUTRA, string values must be plain integers.
   * @throws InvalidBandNumberException if the value is out of range or malformed.
   */
  constructor(aValue: string | number | BandNumber | null, aRat: RAT = RAT.NR) {
    if (aValue === null || aValue === undefined) {
      throw new Error("The band number value shall not be None");
    }

    if (aValue instanceof BandNumber) {
      this.value = aValue.value;
      this.rat = aValue.rat;
      return;
    }

    let rat = aRat;
    let number: number;

    if (typeof aValue === "number") {
      number = aValue;
    } else {
      let v = String(aValue);
      if (rat === RAT.NR) {
        if (!v.startsWith("n")) {
          throw new InvalidBandNumberException(
            `For aRat=${rat} a band number of type 'str' must start with 'n' but was '${v}'.`);
        }
        v = v.substring(1);
      } else if (rat === RAT.EUTRA) {
        if (!IsInt(v)) {
          throw new InvalidBandNumberException(
            `For aRat=${rat} a band number of type 'str' must start with an integer but was '${v}'.`);
        }
      } else {
        throw new InvalidBandNumberException(`Unknown RAT type '${rat}' for band number '${v}'.`);
      }

      if (!IsInt(v)) {
        throw new InvalidBandNumberException(`The given band number '${v}' is not an integer`);
      }
      number = parseInt(v, 10);
    }

    if (number <= 0 || number > MAX_BAND_NUMBER) {
      throw new InvalidBandNumberException(
        `The band number must be in the range [1..511] but was ${number}`);
    }

    this.value = number;
    this.rat = rat;
  }

  /** Returns the numeric band number value (without 'n' prefix). */
  valueOf(): number { return this.value; }

  /**
   * Returns the band number as a string in 3GPP notation.
   * NR bands are prefixed with `'n'` (e.g. `"n78"`); EUTRA bands are plain integers (e.g. `"7"`).
   */
  toString(): string {
    if (this.rat === RAT.NR) return `n${this.value}`;
    if (this.rat === RAT.EUTRA) return `${this.value}`;
    throw new InvalidBandNumberException(`Missing RAT type '${this.rat}' for band '${this.value}'.`);
  }

  /** Returns the numeric band number value. Equivalent to `valueOf()`. */
  asInt(): number { return this.value; }

  /** Returns true if this band is in Frequency Range 1 (band number ≤ 250). */
  isFr1(): boolean { return this.value <= MAX_BAND_NUMBER_FR1; }

  /** Returns true if this band is in Frequency Range 2 (band number > 250). */
  isFr2(): boolean { return !this.isFr1(); }

  /** Returns true if this band belongs to NR. */
  isNR(): boolean { return this.rat === RAT.NR; }

  /** Returns true if this band belongs to E-UTRA. */
  isEUTRA(): boolean { return this.rat === RAT.EUTRA; }

  /** Returns true if this band number has the same numeric value and RAT as `other`. */
  equals(other: BandNumber): boolean {
    return this.value === other.value && this.rat === other.rat;
  }

  /** Determines the specification this band number belongs to. */
  getSpecification(): string {
    return this.isFr1() ? "38.101-1" : "38.101-2";
  }
}
