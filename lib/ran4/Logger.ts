// Logger.ts — Output destination abstraction

import { createWriteStream, WriteStream } from "node:fs";
import { resolve } from "node:path";

class Logger {
  private stream: WriteStream | null = null;
  private filePath: string | null = null;

  log(...args: unknown[]): void {
    const line = args.map(String).join(" ") + "\n";
    if (this.stream) {
      this.stream.write(line);
    } else {
      process.stdout.write(line);
    }
  }

  openFile(aFilePath: string): void {
    this.filePath = resolve(aFilePath);
    this.stream = createWriteStream(this.filePath);
  }

  close(): Promise<string | null> {
    return new Promise((aResolve) => {
      if (this.stream) {
        const path = this.filePath;
        this.stream.end(() => {
          this.stream = null;
          this.filePath = null;
          aResolve(path);
        });
      } else {
        aResolve(null);
      }
    });
  }
}

export const logger = new Logger();
