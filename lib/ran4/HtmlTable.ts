// HtmlTable.ts — Container for HTML Tables

import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export class HtmlTable {
  rows: string[][];

  constructor() {
    this.rows = [[""]];
  }

  getNrofRows(): number { return this.rows.length; }

  getNrofColumns(): number { return this.rows[0].length; }

  getValue(aRow: number, aCol: number): string | null {
    if (aRow < this.getNrofRows() && aCol < this.getNrofColumns()) {
      return this.rows[aRow][aCol];
    }
    return null;
  }

  setValue(aRow: number, aCol: number, aValue: string | number): void {
    if (aCol < 0) throw new RangeError(`aCol shall not be negative but was ${aCol}`);
    if (aRow < 0) throw new RangeError(`aRow shall not be negative but was ${aRow}`);

    const nrofColumnsToAdd = Math.max(aCol - this.getNrofColumns() + 1, 0);
    if (nrofColumnsToAdd > 0) {
      for (const oneRow of this.rows) {
        oneRow.push(...Array(nrofColumnsToAdd).fill(""));
      }
    }

    while (this.getNrofRows() <= aRow) {
      this.rows.push(Array(this.getNrofColumns()).fill(""));
    }

    this.rows[aRow][aCol] = String(aValue);
  }

  private getRowSpan(aRow: number, aCol: number): string {
    let nrowEmptyRows = 0;
    let row = aRow + 1;
    while (this.getValue(row, aCol) !== null) {
      if (this.getValue(row, aCol) === "") {
        nrowEmptyRows++;
      } else {
        break;
      }
      row++;
    }

    if (nrowEmptyRows > 0) {
      return ` rowSpan=${nrowEmptyRows + 1}`;
    }
    return "";
  }

  dump(aFileName: string, anIndentString: string = "  ", aCompleteHtmlFile: boolean = true): void {
    if (!aFileName.endsWith("html")) {
      throw new Error(`The filename must end with 'html' but was '${aFileName}'.`);
    }

    const absPath = resolve(aFileName);
    const dirPath = dirname(absPath);

    if (!existsSync(dirPath)) {
      throw new Error(`The given target path '${absPath}' does not exist.`);
    }

    console.log(`Writing HTML table with ${this.getNrofRows()} rows and ${this.getNrofColumns()} columns to HTML file '${absPath}'`);

    const lines: string[] = [];
    if (aCompleteHtmlFile) {
      lines.push("<!DOCTYPE html>\n");
      lines.push("<html>\n");
      lines.push("<head>\n");
      lines.push("<style>\n");
      lines.push("table, th, td {\n");
      lines.push("  border: 1px solid black;\n");
      lines.push("  border-collapse: collapse;\n");
      lines.push("  vertical-align: top;\n");
      lines.push("  font-family:verdana;\n");
      lines.push("}\n");
      lines.push("</style>\n");
      lines.push("</head>\n");
      lines.push("<body>\n");
    }
    lines.push("<table>\n");

    for (let rowIndex = 0; rowIndex < this.rows.length; rowIndex++) {
      const oneRow = this.rows[rowIndex];
      lines.push(`${anIndentString}<tr>\n`);
      for (let colIndex = 0; colIndex < oneRow.length; colIndex++) {
        const oneCol = oneRow[colIndex];
        if (rowIndex === 0) {
          lines.push(`${anIndentString.repeat(2)}<th>${escapeHtml(oneCol)}</td>\n`);
        } else if (oneCol !== "" || rowIndex === 1) {
          lines.push(`${anIndentString.repeat(2)}<td${this.getRowSpan(rowIndex, colIndex)}>${escapeHtml(oneCol)}</td>\n`);
        }
      }
      lines.push(`${anIndentString}</tr>\n`);
    }

    lines.push("</table>\n");

    if (aCompleteHtmlFile) {
      lines.push("</body>\n");
      lines.push("</html>\n");
    }

    writeFileSync(absPath, lines.join(""), "utf-8");
  }

  toString(): string {
    return `HtmlTable[${this.getNrofRows()}|${this.getNrofColumns()}]`;
  }

  toHtmlString(anIndentString: string = "  "): string {
    const lines: string[] = [];
    lines.push("<table>\n");

    for (let rowIndex = 0; rowIndex < this.rows.length; rowIndex++) {
      const oneRow = this.rows[rowIndex];
      lines.push(`${anIndentString}<tr>\n`);
      for (let colIndex = 0; colIndex < oneRow.length; colIndex++) {
        const oneCol = oneRow[colIndex];
        if (rowIndex === 0) {
          lines.push(`${anIndentString.repeat(2)}<th>${oneCol}</th>\n`);
        } else if (oneCol !== "" || rowIndex === 1) {
          lines.push(`${anIndentString.repeat(2)}<td${this.getRowSpan(rowIndex, colIndex)}>${oneCol}</td>\n`);
        }
      }
      lines.push(`${anIndentString}</tr>\n`);
    }

    lines.push("</table>\n");
    return lines.join("");
  }
}
