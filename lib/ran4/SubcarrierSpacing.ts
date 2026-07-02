// SubcarrierSpacing.ts — Subcarrier Spacing with validation

import { IsInt } from "./Utils.js";

//////////////////////////////
// Constants
export const VALID_SCS_VALUES = [15, 30, 60, 120, 240, 480, 960] as const;

//////////////////////////////
// Exceptions
export class InvalidScsException extends Error {
  constructor(message: string) { super(message); this.name = "InvalidScsException"; }
}

export class SCS {
  private readonly value: number;

  constructor(aValue: string | number | SCS | null) {
    if (aValue === null || aValue === undefined) {
      throw new InvalidScsException("The SCS shall not be None");
    }
    if (aValue instanceof SCS) {
      this.value = aValue.value;
      return;
    }
    if (!IsInt(aValue)) {
      throw new InvalidScsException(
        `The SCS shall be an interger number but was ${aValue} (${typeof aValue})`);
    }
    const n = typeof aValue === "number" ? aValue : parseInt(String(aValue), 10);
    if (!(VALID_SCS_VALUES as readonly number[]).includes(n)) {
      throw new InvalidScsException(
        `The SCS must be one of ${VALID_SCS_VALUES} but was ${aValue}.`);
    }
    this.value = n;
  }

  valueOf(): number { return this.value; }

  toString(): string { return `${this.value}`; }

  equals(other: SCS): boolean { return this.value === other.value; }
}
