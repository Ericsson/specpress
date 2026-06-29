// Utils.ts — KEYS, utility functions, BaseClass, BaseList

import { JsonObject, RAN4JsonEncoder, LoadJsonFileToDict, GetAllJsonFilesInFolder, GetJsonFilesByPattern, ValidateSchema, CompiledSchema } from "./JsonTools.js";
import { logger } from "./Logger.js";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";

//////////////////////////////
// Constants

export class KEYS {
  static readonly scs = "scs";
  static readonly scsList = "scsList";
  static readonly bandwidthList = "bandwidthList";
  static readonly bw = "bw";
  static readonly uplink = "uplink";
  static readonly downlink = "downlink";
  static readonly notes = "notes";
  static readonly bcId = "bcId";
  static readonly bcsList = "bcsList";
  static readonly bcsId = "bcsId";
  static readonly bandList = "bandList";
  static readonly ulConfigList = "ulConfigList";
  static readonly bandEntry = "bandEntry";
  static readonly bandNumber = "bandNumber";
  static readonly contCarrierGroups = "contCarrierGroups";
  static readonly nonContiguousCarriers = "nonContiguousCarriers";
  static readonly contiguousCarriers = "contiguousCarriers";
  static readonly referencedComponents = "referencedComponents";
  static readonly maxAggBwPerBand = "maxAggBwPerBand";
  static readonly bandCombinationList = "bandCombinationList";
  static readonly singleUlAllowed = "singleUlAllowed";
  static readonly dlInterruptionsAllowed = "dlInterruptionsAllowed";
  static readonly specification = "specification";
  static readonly schemaVersion = "schemaVersion";
}

//////////////////////////////
// Exceptions

export class UnsupportedKeyException extends Error {
  constructor(message: string) { super(message); this.name = "UnsupportedKeyException"; }
}
export class MissingParentObjectException extends Error {
  constructor(message: string) { super(message); this.name = "MissingParentObjectException"; }
}
export class InvalidInputTypeException extends Error {
  constructor(message: string) { super(message); this.name = "InvalidInputTypeException"; }
}
export class NoEntriesException extends Error {
  constructor(message: string) { super(message); this.name = "NoEntriesException"; }
}
export class DuplicateEntryException extends Error {
  constructor(message: string) { super(message); this.name = "DuplicateEntryException"; }
}
export class FileNameMismatchException extends Error {
  constructor(message: string) { super(message); this.name = "FileNameMismatchException"; }
}

////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////
//                Generic utility functions                    //
////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////

export function IsInt(aStr: string | number): boolean {
  if (typeof aStr === "number" && Number.isInteger(aStr)) return true;
  if (typeof aStr === "number") return false;
  const s = String(aStr);
  if (s === "") return false;
  // Match Python: str.isnumeric() only matches digit characters (no sign, no dot)
  if (/^\d+$/.test(s)) {
    const f = parseFloat(s);
    if (f === Math.trunc(f)) return true;
  }
  return false;
}

export function listToString(aList: unknown[]): string {
  return aList.join(", ");
}

export function FindAll(aString: string | null, aSubString: string | null, aStartIndex: number = 0): number[] {
  const occurrences: number[] = [];
  if (aString === null || aString === undefined || aString === "" ||
      aSubString === null || aSubString === undefined || aSubString === "") {
    return occurrences;
  }
  if (aStartIndex < 0) {
    throw new Error(`aStartIndex must be larger than or equal to 0 but was ${aStartIndex}`);
  }
  for (let i = aStartIndex; i <= aString.length - aSubString.length; i++) {
    if (aString.startsWith(aSubString, i)) {
      occurrences.push(i);
    }
  }
  return occurrences;
}

////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////
//                  Base class for objects                     //
////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////

// Constructor type helper for getParent
type Constructor<T> = abstract new (...args: any[]) => T;

export abstract class BaseClass extends JsonObject {
  parent: BaseClass | null;

  constructor(aParent: BaseClass | null = null) {
    super();
    this.parent = aParent;
  }

  getParent<T>(aType?: Constructor<T>): T | BaseClass | null {
    if (this.parent !== null) {
      if (aType === undefined || this.parent instanceof aType) {
        return this.parent as T;
      } else {
        return this.parent.getParent(aType);
      }
    }
    return null;
  }

  getDescriptor(aMaxNrofLevels: number = 10): string {
    let s = this.constructor.name;
    const tag = this.getTag();
    if (tag !== "") {
      s = `${s}(${tag})`;
    }
    if (aMaxNrofLevels > 1) {
      const p = this.getParent();
      if (p !== null && p instanceof BaseClass) {
        s = `${p.getDescriptor(aMaxNrofLevels - 1)} -> ${s}`;
      }
    }
    return s;
  }

  abstract validate(...args: unknown[]): void;

  abstract getTag(): string;
}

export type ValidationErrorCounts = { schemaErrors: number; contentErrors: number };

export abstract class BaseList extends BaseClass {
  data: Map<string, BaseClass> = new Map();

  constructor(aParent: BaseClass | null = null) {
    super(aParent);
  }

  getTag(): string { return ""; }

  has(aKey: string | number): boolean {
    return this.data.has(String(aKey));
  }

  get(aKey: string | number): BaseClass | undefined {
    return this.data.get(String(aKey));
  }

  protected abstract _createEntry(aValue: unknown, aParent: BaseList): BaseClass;

  protected abstract _getEntryId(anEntry: BaseClass): string;

  add(aValue: unknown): void {
    const newEntry = this._createEntry(aValue, this);
    const entryId = this._getEntryId(newEntry);
    if (this.data.has(entryId)) {
      throw new DuplicateEntryException(`${this.getDescriptor()}: Entry for '${entryId}' exists already.`);
    }
    this.data.set(entryId, newEntry);
  }

  addAll(aList: unknown[]): void {
    for (const oneElement of aList) {
      this.add(oneElement);
    }
  }

  validate(): void {
    if (this.data.size === 0) {
      throw new NoEntriesException(`${this.getDescriptor()}: List contains no entries.`);
    }
    for (const oneEntry of this.data.values()) {
      oneEntry.validate();
    }
  }

  validateCollectErrors(): string[] {
    const errors: string[] = [];
    if (this.data.size === 0) {
      errors.push(`${this.getDescriptor()}: List contains no entries.`);
      return errors;
    }
    for (const oneEntry of this.data.values()) {
      try {
        oneEntry.validate();
      } catch (e) {
        errors.push(String((e as Error).message ?? e));
      }
    }
    return errors;
  }

  protected _getTargetSubfolder(_anEntry: BaseClass): string {
    throw new Error(`Subclass ${this.constructor.name} shall implement _getTargetSubfolder()`);
  }

  protected _getFileName(anEntry: BaseClass): string {
    return `${this._getEntryId(anEntry)}.json`;
  }

  protected _shouldStoreEntry(_anEntry: BaseClass): boolean {
    return true;
  }

  storeAsJsonFiles(aFolder: string): void {
    const absPath = resolve(aFolder);
    if (!existsSync(absPath)) {
      throw new Error(`${this.getDescriptor()}: The given target path '${absPath}' does not exist.`);
    }

    logger.log(`${this.getDescriptor()}: Starting to write ${this.data.size} JSON files to folder '${absPath}'`);

    for (const oneEntry of this.data.values()) {
      if (!this._shouldStoreEntry(oneEntry)) continue;
      const targetPath = join(absPath, this._getTargetSubfolder(oneEntry));
      if (!existsSync(targetPath)) {
        mkdirSync(targetPath, { recursive: true });
      }
      const enc = new RAN4JsonEncoder(join(targetPath, this._getFileName(oneEntry)));
      oneEntry.toJSON(enc, 0);
      enc.flush();
    }

    logger.log(`${this.getDescriptor()}: Wrote ${this.data.size} JSON files to folder '${absPath}'`);
  }

  loadFromFolder(aFolder: string, skipValidation: boolean = false, aJsonSchema: CompiledSchema | null = null, abortOnError: boolean = true): ValidationErrorCounts {
    return this._loadFiles(GetAllJsonFilesInFolder(aFolder), aJsonSchema, `folder '${aFolder}'`, skipValidation, abortOnError);
  }

  loadByPattern(aRootFolder: string, aPattern: string, skipValidation: boolean = false, aJsonSchema: CompiledSchema | null = null, abortOnError: boolean = true): ValidationErrorCounts {
    return this._loadFiles(GetJsonFilesByPattern(aRootFolder, aPattern), aJsonSchema, `pattern '${aPattern}' in '${aRootFolder}'`, skipValidation, abortOnError);
  }

  private _loadFiles(aFileList: string[], aJsonSchema: CompiledSchema | null, aSource: string, skipValidation: boolean, abortOnError: boolean): ValidationErrorCounts {
    let n = 0;
    let schemaErrors = 0;
    let contentErrors = 0;
    for (const aJsonFile of aFileList) {
      const tempDict = LoadJsonFileToDict(aJsonFile);
      if (!ValidateSchema(tempDict, aJsonSchema, `${this.getDescriptor()}: ${aJsonFile}`, abortOnError)) {
        schemaErrors++;
      }
      let newEntry: BaseClass;
      try {
        newEntry = this._createEntry(tempDict, this);
      } catch (e) {
        const msg = `${this.getDescriptor()}: ${aJsonFile}: ${(e as Error).message}`;
        if (abortOnError) throw e;
        logger.log(msg);
        contentErrors++;
        continue;
      }

      const fileName = basename(aJsonFile).replace(".json", "");
      if (this._getEntryId(newEntry) !== fileName) {
        throw new FileNameMismatchException(
          `${this.getDescriptor()}: The ID '${this._getEntryId(newEntry)}' does not match the file name '${fileName}'.`
        );
      }

      this.add(newEntry);
      n++;
    }

    logger.log(`${this.getDescriptor()}: Imported ${n} entries from ${aSource}.`);

    if (!skipValidation) {
      logger.log(`${this.getDescriptor()}: Starting validation of all ${this.data.size} entries.`);
      if (abortOnError) {
        this.validate();
      } else {
        const errors = this.validateCollectErrors();
        contentErrors = errors.length;
        if (contentErrors > 0) {
          for (const oneError of errors) {
            logger.log(`${this.getDescriptor()}: Content validation error: ${oneError}`);
          }
          logger.log(`${this.getDescriptor()}: Found ${contentErrors} content validation error(s).`);
        }
      }
      logger.log(`${this.getDescriptor()}: Validated all ${this.data.size} entries.`);
    }
    return { schemaErrors, contentErrors };
  }

  toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
    throw new Error(`Subclass ${this.constructor.name} shall implement toJSON()`);
  }
}

//////////////////////////////
// Normalize any RAN4 JSON file

/**
 * Normalizes a single RAN4 JSON file (Band, CA, or DC configuration).
 *
 * Detects the file type from the JSON content and applies appropriate normalization:
 * - Key ordering enforced by toJSON() methods
 * - UL configs sorted (for CA/DC)
 * - notes object keys sorted alphabetically
 * - Consistent indentation via RAN4JsonEncoder
 *
 * @param filePath - Path to the JSON file to normalize
 * @returns The absolute path of the normalized file
 * @throws Error if the file is not a valid RAN4 JSON file
 */
export async function normalizeJsonFile(filePath: string): Promise<string> {
  const absPath = resolve(filePath);
  const dict = LoadJsonFileToDict(absPath);

  let obj: { toJSON(enc: RAN4JsonEncoder, level: number): void };
  if ("scsList" in dict) {
    const { ChBwOneBand } = await import("./ChannelBandwidthPerBand.js");
    obj = new ChBwOneBand(dict);
  } else if (typeof dict["bcId"] === "string" && (dict["bcId"] as string).startsWith("DC_")) {
    const { DualConnectivityConfig } = await import("./DualConnectivity.js");
    obj = new DualConnectivityConfig(dict, null, false, false);
  } else {
    const { BC } = await import("./BandCombinations.js");
    obj = new BC(dict);
  }

  const enc = new RAN4JsonEncoder(absPath);
  obj.toJSON(enc, 0);
  enc.flush();
  return absPath;
}
