// DualConnectivity.ts — DC configuration data model & list

import { BaseClass, BaseList, KEYS, UnsupportedKeyException } from "./Utils.js";
import { logger } from "./Logger.js";
import { BC_ID } from "./BC_ID.js";
import { DuplicateUplinkConfigException, MissingBcIdException } from "./BandCombinations.js";
import { RAN4JsonEncoder } from "./JsonTools.js";
import { HtmlTable } from "./HtmlTable.js";
import * as path from "node:path";

////////////////////////////////////////////////////////////////
//                        UlConfigDC                          //
////////////////////////////////////////////////////////////////

/**
 * An uplink configuration entry within a dual connectivity band combination.
 *
 * Each UlConfigDC identifies one UL component by its BC-ID, and may carry
 * optional specification notes.
 */
export class UlConfigDC extends BaseClass {
    /** The BC-ID of this UL configuration (parsed or raw string). */
    bcId: BC_ID | string | null = null;
    /** Optional specification notes. */
    notes: Record<string, unknown> = {};

    /**
     * @param aValue — a dict from JSON or an existing UlConfigDC to copy.
     * @param aParent — the parent DualConnectivityConfig.
     * @param validateBcIds — if true, parse bcId strings into BC_ID objects.
     */
    constructor(aValue: Record<string, unknown> | UlConfigDC, aParent: BaseClass | null = null, validateBcIds: boolean = true) {
        super(aParent);
        if (aValue instanceof UlConfigDC) {
            this.bcId = aValue.bcId;
            if (validateBcIds && typeof this.bcId === "string") {
                this.bcId = new BC_ID(this.bcId);
            }
            this.notes = { ...aValue.notes };
        } else {
            for (const oneKey of Object.keys(aValue)) {
                if (oneKey === KEYS.bcId) {
                    this.bcId = String(aValue[KEYS.bcId]).trim();
                    if (validateBcIds) {
                        this.bcId = new BC_ID(this.bcId);
                    }
                } else if (oneKey === KEYS.notes) {
                    this.notes = { ...(aValue[KEYS.notes] as Record<string, unknown>) };
                } else {
                    throw new UnsupportedKeyException(`${this.getDescriptor()}: Does not support the given key '${oneKey}' as element`);
                }
            }
        }
    }

    /** Validates that bcId is present. */
    validate(): void {
        if (this.bcId === null) {
            throw new Error(`${this.getDescriptor()}: bcId shall not be None`);
        }
    }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        anEncoder.write("{\n", aLevel);
        anEncoder.writeKeyAndValue(KEYS.bcId, String(this.bcId), aLevel + 1);
        if (Object.keys(this.notes).length > 0) {
            anEncoder.writeKeyAndValue(KEYS.notes, this.notes, aLevel + 1, ",\n");
        }
        anEncoder.write("\n}", aLevel);
    }

    toString(): string { return String(this.bcId); }
    getTag(): string { return this.toString(); }
}

////////////////////////////////////////////////////////////////
//                 DualConnectivityConfig                     //
////////////////////////////////////////////////////////////////

/**
 * A dual connectivity band combination configuration.
 *
 * Represents one DC entry (EN-DC, NE-DC, or NR-DC) with its DL BC-ID,
 * list of UL configurations, and optional flags for single-UL and
 * DL-interruptions. Corresponds to one `DC_*.json` file.
 */
export class DualConnectivityConfig extends BaseClass {
    /** The DL BC-ID (parsed or raw string). */
    bcId: BC_ID | string | null = null;
    /** List of uplink configurations for this DC combination. */
    ulConfigList: UlConfigDC[] = [];
    /** Whether single UL is allowed (e.g. "yes", "no"), or null if not specified. */
    singleUlAllowed: string | null = null;
    /** Whether DL interruptions are allowed, or null if not specified. */
    dlInterruptionsAllowed: string | null = null;
    /** Optional specification notes. */
    notes: Record<string, unknown> = {};

    /**
     * @param aValue — a dict from JSON or an existing DualConnectivityConfig to copy.
     * @param aParent — the parent DcBandCombinationList.
     * @param validateBcIds_DL — if true, parse the DL bcId string into a BC_ID.
     * @param validateBC_IDs_UL — if true, parse UL bcId strings into BC_ID objects.
     */
    constructor(
        aValue: Record<string, unknown> | DualConnectivityConfig,
        aParent: BaseClass | null = null,
        validateBcIds_DL: boolean = true,
        validateBC_IDs_UL: boolean = true
    ) {
        super(aParent);
        if (aValue instanceof DualConnectivityConfig) {
            this.bcId = aValue.bcId;
            if (validateBcIds_DL && typeof this.bcId === "string") {
                this.bcId = new BC_ID(this.bcId);
            }
            for (const oneElement of aValue.ulConfigList) {
                const ul = new UlConfigDC(oneElement, this, validateBC_IDs_UL);
                this.ulConfigList.push(ul);
            }
            this.notes = { ...aValue.notes };
            this.singleUlAllowed = aValue.singleUlAllowed;
            this.dlInterruptionsAllowed = aValue.dlInterruptionsAllowed;
        } else {
            for (const oneKey of Object.keys(aValue)) {
                if (oneKey === KEYS.bcId) {
                    this.bcId = aValue[KEYS.bcId] as string;
                    if (validateBcIds_DL) {
                        try {
                            this.bcId = new BC_ID(this.bcId);
                        } catch (e) {
                            throw new Error(`DualConnectivityConfig('${aValue[KEYS.bcId]}'): ${(e as Error).message}`);
                        }
                    }
                } else if (oneKey === KEYS.ulConfigList) {
                    for (const oneElement of aValue[KEYS.ulConfigList] as unknown[]) {
                        const ul = new UlConfigDC(oneElement as Record<string, unknown>, this, validateBC_IDs_UL);
                        this.ulConfigList.push(ul);
                    }
                } else if (oneKey === KEYS.notes) {
                    this.notes = { ...(aValue[KEYS.notes] as Record<string, unknown>) };
                } else if (oneKey === KEYS.singleUlAllowed) {
                    this.singleUlAllowed = aValue[KEYS.singleUlAllowed] as string;
                } else if (oneKey === KEYS.dlInterruptionsAllowed) {
                    this.dlInterruptionsAllowed = aValue[KEYS.dlInterruptionsAllowed] as string;
                } else if (oneKey === KEYS.specification || oneKey === KEYS.schemaVersion) {
                    // Silently ignore
                } else {
                    throw new UnsupportedKeyException(`${this.getDescriptor()}: Does not support the given key '${oneKey}' as element`);
                }
            }
        }
    }

    /** Validates that bcId is present. */
    validate(): void {
        if (this.bcId === null) {
            throw new MissingBcIdException(`${this.getDescriptor()}: A band combination shall contain a 'bcId' key`);
        }
    }

    toString(): string {
        if (this.bcId !== null) {
            return this.bcId instanceof BC_ID ? this.bcId.valueOf() : String(this.bcId);
        }
        return super.toString();
    }

    getTag(): string {
        if (this.bcId !== null) {
            return this.bcId instanceof BC_ID ? this.bcId.valueOf() : String(this.bcId);
        }
        return super.toString();
    }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        anEncoder.write("{\n", aLevel);
        anEncoder.writeKeyAndValue(KEYS.bcId, String(this.bcId), aLevel + 1, "");
        if (this.ulConfigList.length > 0) {
            anEncoder.writeKeyAndValue(KEYS.ulConfigList, this.ulConfigList, aLevel + 1, ",\n");
        }
        if (this.singleUlAllowed !== null) {
            anEncoder.writeKeyAndValue(KEYS.singleUlAllowed, this.singleUlAllowed, aLevel + 1, ",\n");
        }
        if (this.dlInterruptionsAllowed !== null) {
            anEncoder.writeKeyAndValue(KEYS.dlInterruptionsAllowed, this.dlInterruptionsAllowed, aLevel + 1, ",\n");
        }
        if (Object.keys(this.notes).length > 0) {
            anEncoder.writeKeyAndValue(KEYS.notes, this.notes, aLevel + 1, ",\n");
        }
        anEncoder.write("\n}", aLevel);
    }

    toHTML(aHtmlTable: HtmlTable, aRow: number = 0, aColumn: number = 0): void {
        const rowIndexToUse = aHtmlTable.getNrofRows();
        
        // Column 0: DL Configuration
        aHtmlTable.setValue(rowIndexToUse, aColumn, String(this.bcId));
        
        // Column 1: UL Configurations (line-break separated)
        const ulConfigs = this.ulConfigList.map(ul => String(ul.bcId)).join('<br>');
        aHtmlTable.setValue(rowIndexToUse, aColumn + 1, ulConfigs || '–');
        
        // Column 2: Single UL Allowed
        aHtmlTable.setValue(rowIndexToUse, aColumn + 2, this.singleUlAllowed || '–');
        
        // Column 3: DL Interruptions Allowed
        aHtmlTable.setValue(rowIndexToUse, aColumn + 3, this.dlInterruptionsAllowed || '–');
        
        // Column 4: Notes
        const noteKeys = Object.keys(this.notes);
        const notesStr = noteKeys.length > 0 ? noteKeys.join(', ') : '–';
        aHtmlTable.setValue(rowIndexToUse, aColumn + 4, notesStr);
    }
}

////////////////////////////////////////////////////////////////
//                 DcBandCombinationList                      //
////////////////////////////////////////////////////////////////

function compareDCs(a: DualConnectivityConfig, b: DualConnectivityConfig): number {
    const aId = a.bcId instanceof BC_ID ? a.bcId : new BC_ID(String(a.bcId));
    const bId = b.bcId instanceof BC_ID ? b.bcId : new BC_ID(String(b.bcId));
    if (aId.lessThan(bId)) return -1;
    if (aId.greaterThan(bId)) return 1;
    return 0;
}

/**
 * Collection of dual connectivity band combination configurations.
 *
 * Keyed by BC-ID value string. Supports loading from individual `DC_*.json`
 * files, validation, and export to JSON or HTML.
 */
export class DcBandCombinationList extends BaseList {
    /** HTML table used for HTML export. */
    html: HtmlTable;
    /** Whether to parse DL BC-IDs into BC_ID objects during loading. */
    validatingBC_IDs_DL: boolean;
    /** Whether to parse UL BC-IDs into BC_ID objects during loading. */
    validatingBC_IDs_UL: boolean;

    constructor(aParent: BaseClass | null = null, validateBcIds_DL: boolean = false, validateBcIds_UL: boolean = false) {
        super(aParent);
        this.validatingBC_IDs_DL = validateBcIds_DL;
        this.validatingBC_IDs_UL = validateBcIds_UL;
        this.html = new HtmlTable();
    }

    protected _createEntry(aValue: unknown, aParent: BaseList): BaseClass {
        return new DualConnectivityConfig(
            aValue as Record<string, unknown> | DualConnectivityConfig,
            aParent,
            this.validatingBC_IDs_DL,
            this.validatingBC_IDs_UL
        );
    }

    protected _getEntryId(anEntry: BaseClass): string {
        const bcId = (anEntry as DualConnectivityConfig).bcId;
        if (bcId instanceof BC_ID) return bcId.toString();
        return String(bcId);
    }

    /** Returns true if a DC configuration with the given BC-ID exists. */
    hasBC(aBcId: string): boolean {
        return this.has(aBcId);
    }

    protected _getTargetSubfolder(anEntry: BaseClass): string {
        const dc = anEntry as DualConnectivityConfig;
        if (dc.bcId instanceof BC_ID) {
            const bcId = dc.bcId;
            if (!bcId.isDualConnectivity()) {
                throw new Error(`${this.getDescriptor()}: Expected DC configuration but found '${bcId.getPrefix()}${bcId.valueOf()}'`);
            }
            if (bcId.isNR()) {
                if (bcId.isFr1()) return path.join("ts-38.101-1", "NR_Inter-band_DC_FR1");
                if (bcId.isFr2()) throw new Error(`${this.getDescriptor()}: Does not expect FR2 DC configurations but found: ${bcId}`);
                return path.join("ts-38.101-3", "NR_Inter-band_DC_FR1_and_FR2");
            } else {
                if (bcId.isIntraBand()) return path.join("ts-38.101-3", "Intra-band_DC_FR1");
                if (bcId.hasFr2()) return path.join("ts-38.101-3", "Inter-band_DC_Including_FR2");
                return path.join("ts-38.101-3", "Inter-band_DC_FR1");
            }
        }
        return path.join("ts-38.101-3", "UNKNOWN");
    }

    protected _getFileName(anEntry: BaseClass): string {
        return `${this._getEntryId(anEntry)}.json`;
    }

    /** Exports all DC configurations to an HTML table file, sorted by BC-ID. */
    storeAsHtmlFile(aFileName: string): void {
        DcBandCombinationList.addTableHeaders(this.html);

        const sorted = [...this.data.values()].sort((a, b) =>
            compareDCs(a as DualConnectivityConfig, b as DualConnectivityConfig)
        );
        for (const oneBC of sorted) {
            (oneBC as DualConnectivityConfig).toHTML(this.html);
        }

        this.html.dump(aFileName);
        logger.log(`${this.getDescriptor()}: Wrote ${this.data.size} BCs to HTML file '${aFileName}'`);
    }

    /** Adds standard DC table headers to the given HTML table. */
    static addTableHeaders(aHtmlTable: HtmlTable): void {
        aHtmlTable.setValue(0, 0, 'DL Configuration');
        aHtmlTable.setValue(0, 1, 'UL Configurations');
        aHtmlTable.setValue(0, 2, 'Single UL');
        aHtmlTable.setValue(0, 3, 'DL Interruptions');
        aHtmlTable.setValue(0, 4, 'Notes');
    }

    /**
     * Renders a single DC configuration as a complete HTML table string.
     * @param data — Raw JSON object containing DC data
     * @returns HTML table string with headers and one DC row
     */
    static renderAsHtml(data: Record<string, unknown>): string {
        const dc = new DualConnectivityConfig(data, null, false, false);
        const htmlTable = new HtmlTable();
        DcBandCombinationList.addTableHeaders(htmlTable);
        dc.toHTML(htmlTable);
        return htmlTable.toHtmlString();
    }

    toJSON(anEncoder: RAN4JsonEncoder, aLevel: number): void {
        throw new Error("DcBandCombinationList.toJSON() is not implemented");
    }
}
