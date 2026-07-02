// JsonTools.ts — JSON I/O, encoder, schema validation

import { readFileSync, existsSync, writeFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { globSync } from "node:fs";
import { createRequire } from "node:module";
import { logger } from "./Logger.js";
const require = createRequire(import.meta.url);
const Ajv = require("ajv") as typeof import("ajv").default;

//////////////////////////////
// Exceptions

export class InvalidJsonIndentationLevelException extends RangeError {
  constructor(message: string) { super(message); this.name = "InvalidJsonIndentationLevelException"; }
}

//////////////////////////////
// JSON read limits

export class JsonReadLimits {
  maxFileSize: number;
  maxTotalSize: number;
  totalBytesRead: number = 0;

  constructor(maxFileSize: number = 10 * 1024 * 1024, maxTotalSize: number = 100 * 1024 * 1024) {
    this.maxFileSize = maxFileSize;
    this.maxTotalSize = maxTotalSize;
  }

  reset(): void { this.totalBytesRead = 0; }
}

export const jsonReadLimits = new JsonReadLimits();

//////////////////////////////
// JSON I/O functions

export function LoadJsonFileToDict(aJsonFile: string | null | undefined): Record<string, unknown> {
  if (aJsonFile === null || aJsonFile === undefined) {
    throw new Error("aJsonFile shall not be None");
  }
  if (typeof aJsonFile !== "string") {
    throw new Error(`Cannot handle aJsonFile of type '${typeof aJsonFile}'`);
  }

  let fileSize: number;
  try {
    fileSize = statSync(aJsonFile).size;
  } catch (e) {
    throw new Error(`Error when accessing file '${aJsonFile}': ${e}`);
  }
  if (fileSize > jsonReadLimits.maxFileSize) {
    throw new Error(`File '${aJsonFile}' is ${fileSize} bytes, exceeding the per-file limit of ${jsonReadLimits.maxFileSize} bytes.`);
  }
  if (jsonReadLimits.totalBytesRead + fileSize > jsonReadLimits.maxTotalSize) {
    throw new Error(`Reading '${aJsonFile}' (${fileSize} bytes) would exceed the cumulative limit of ${jsonReadLimits.maxTotalSize} bytes (already read: ${jsonReadLimits.totalBytesRead} bytes).`);
  }
  jsonReadLimits.totalBytesRead += fileSize;

  let content: string;
  try {
    content = readFileSync(aJsonFile, "utf-8");
  } catch (e) {
    throw new Error(`Error when loading JSON from file '${aJsonFile}': ${e}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    throw new Error(`Error: ${e} when loading JSON from file '${aJsonFile}'`);
  }

  if (data === null || data === undefined) {
    throw new Error(`Error: Could not load JSON from file '${aJsonFile}'`);
  }

  return data as Record<string, unknown>;
}

export function GetAllJsonFilesInFolder(aTopLevelDirectory: string): string[] {
  const dirPath = resolve(aTopLevelDirectory);
  if (!existsSync(dirPath)) {
    throw new Error(`The source path does not exist: ${aTopLevelDirectory}`);
  }

  const pattern = join(dirPath, "**", "*.json");
  const fileList = globSync(pattern).sort();
  logger.log(`Found ${fileList.length} JSON-files in directory '${aTopLevelDirectory}'`);
  return fileList;
}

export function GetJsonFilesByPattern(aRootFolder: string, aPattern: string): string[] {
  const dirPath = resolve(aRootFolder);
  if (!existsSync(dirPath)) {
    throw new Error(`The source path does not exist: ${aRootFolder}`);
  }

  const globPattern = join(dirPath, "**", aPattern);
  const fileList = globSync(globPattern).sort();
  logger.log(`Found ${fileList.length} JSON-files matching '${aPattern}' in '${aRootFolder}'`);
  return fileList;
}

export type CompiledSchema = (data: unknown) => boolean;

export function LoadSchema(aJsonFile: string): CompiledSchema {
  const schemaDict = LoadJsonFileToDict(aJsonFile);
  const ajv = new Ajv();
  return ajv.compile(schemaDict) as CompiledSchema;
}

export class SchemaValidationException extends Error {
  constructor(message: string) { super(message); this.name = "SchemaValidationException"; }
}

export function ValidateSchema(aJsonData: unknown, aCompiledSchema: CompiledSchema | null, aDescriptor: string, abortOnError: boolean = true): boolean {
  if (aCompiledSchema === null || aCompiledSchema === undefined) {
    return true;
  }
  try {
    if (!aCompiledSchema(aJsonData)) {
      const errors = (aCompiledSchema as unknown as { errors: { instancePath: string; message?: string }[] | null }).errors;
      const messages: string[] = [];
      if (errors && errors.length > 0) {
        for (const oneError of errors) {
          const path = oneError.instancePath || "/";
          messages.push(`${aDescriptor}: Schema validation error at '${path}': ${oneError.message}`);
        }
      } else {
        messages.push(`${aDescriptor}: Schema validation failed (no details available).`);
      }
      if (abortOnError) {
        throw new SchemaValidationException(messages.join("\n"));
      }
      for (const oneMessage of messages) {
        logger.log(oneMessage);
      }
      return false;
    }
  } catch (e) {
    if (e instanceof SchemaValidationException) throw e;
    const msg = `${aDescriptor}: Schema validation error: ${e}`;
    if (abortOnError) throw new SchemaValidationException(msg);
    logger.log(msg);
    return false;
  }
  return true;
}

////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////
//                       RAN4JsonEncoder                       //
////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////

export abstract class JsonObject {
  abstract toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void;
}

export class RAN4JsonEncoder {
  private filePath: string;
  private buffer: string[] = [];
  private indent: string;
  private isBufferEmpty: boolean = true;

  private static oneLinePerElement(aListElement: unknown): boolean {
    if (aListElement === null || aListElement === undefined) return false;
    if (aListElement instanceof JsonObject || Array.isArray(aListElement)) return true;
    return false;
  }

  constructor(aJsonFile: string | null) {
    if (aJsonFile === null || aJsonFile === undefined) {
      throw new Error(`Could not open file '${aJsonFile}' for JSON output.`);
    }
    this.filePath = aJsonFile;
    this.indent = "  ";
  }

  write(aStr: string | null, aLevel: number): void {
    if (aStr === null || aStr === undefined || aStr === "") return;
    if (aLevel < 0) {
      throw new InvalidJsonIndentationLevelException("aLevel shall not be smaller than 0");
    }

    let s = aStr;
    let terminated = false;
    if (s.endsWith("\n")) {
      terminated = true;
      s = s.slice(0, -1);
    }
    s = s.replaceAll("\n", "\n" + this.indent.repeat(aLevel));
    if (terminated) {
      s = s + "\n";
    }

    if (this.isBufferEmpty) {
      s = this.indent.repeat(aLevel) + s;
    }

    this.buffer.push(s);
    this.isBufferEmpty = aStr.endsWith("\n");
  }

  writeValue(aValue: unknown, aLevel: number = 0, aSuffix: string = ""): void {
    if (aValue instanceof JsonObject) {
      this.write("\n", aLevel);
      aValue.toJSON(this, aLevel);
      this.write(aSuffix, 0);
    } else if (Array.isArray(aValue)) {
      this.write("[", aLevel);

      let isFirst = true;
      let aListElement: unknown = null;
      for (aListElement of aValue) {
        if (isFirst) isFirst = false;
        else {
          this.write(",", aLevel + 1);
          if (!RAN4JsonEncoder.oneLinePerElement(aListElement)) {
            this.write(" ", aLevel + 1);
          }
        }
        this.writeValue(aListElement, aLevel + 1);
      }

      if (RAN4JsonEncoder.oneLinePerElement(aListElement)) {
        this.write("\n", aLevel);
      }
      this.write("]" + aSuffix, aLevel);
    } else if (typeof aValue === "object" && aValue !== null && !Array.isArray(aValue)) {
      this.write("{", aLevel);
      let isFirst = true;
      for (const aDictKey of Object.keys(aValue as Record<string, unknown>).sort()) {
        if (isFirst) {
          this.writeKeyAndValue(aDictKey, (aValue as Record<string, unknown>)[aDictKey], aLevel + 1, "\n");
          isFirst = false;
        } else {
          this.writeKeyAndValue(aDictKey, (aValue as Record<string, unknown>)[aDictKey], aLevel + 1, ",\n");
        }
      }
      this.write("\n}" + aSuffix, aLevel);
    } else if (typeof aValue === "boolean") {
      this.write(`${aValue}${aSuffix}`, aLevel);
    } else if (typeof aValue === "string") {
      this.write(`"${aValue}"${aSuffix}`, aLevel);
    } else if (typeof aValue === "number") {
      if (Number.isInteger(aValue)) {
        this.write(`${aValue}${aSuffix}`, aLevel);
      } else {
        // Match Python's %g formatting: strip trailing zeros
        this.write(`${parseFloat(aValue.toPrecision(6))}${aSuffix}`, aLevel);
      }
    } else {
      throw new Error(`Cannot handle aValue of type '${typeof aValue}' (${aValue})`);
    }
  }

  writeKey(aKey: string, aLevel: number, aPrefix: string = ""): void {
    this.write(`${aPrefix}"${aKey}": `, aLevel);
  }

  writeKeyAndValue(aKey: string, aValue: unknown, aLevel: number, aPrefix: string = "", aSuffix: string = ""): void {
    this.writeKey(aKey, aLevel, aPrefix);
    this.writeValue(aValue, aLevel, aSuffix);
  }

  flush(): void {
    if (!this.isBufferEmpty) {
      this.write("\n", 0);
    }
    writeFileSync(this.filePath, this.buffer.join(""), "utf-8");
    this.buffer = [];
  }
}
