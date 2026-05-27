# CR Cover Page

## Overview

The CR (Change Request) Cover Page feature allows you to automatically generate a 3GPP-compliant CR cover page for your specification documents. When a draft CR cover page JSON file is detected in the `history/` folder, it automatically replaces the standard specification front page in both HTML and DOCX exports.

## Quick Start

1. **Create a draft CR data file** in your specification's `history/` folder:
   - File name: `CRxxxx.json` (exactly four x's)
   - This indicates a draft CR being prepared

2. **Add CR metadata** to the JSON file (see [JSON Structure](#json-structure) below)

3. **Preview or export** your specification:
   - The CR cover page will automatically appear instead of the standard front page
   - Works in both HTML preview and DOCX export

4. **After approval**, rename the file to the actual CR number:
   - `CRxxxx.json` → `CR1234.json`
   - This moves it from "draft" to "approved" status
   - The approved CR becomes part of the specification history

## File Naming Convention

CR files must be placed in the `history/` folder at your specification root:

### Draft CR (for export with CR cover page)
- **File name:** `CRxxxx.json` (exactly four x's, case insensitive)
- **Purpose:** Draft CR being prepared in a feature branch
- **Detection:** Used for CR cover page when exporting

### Approved CRs (for history table)
- **File name:** `CR####.json` (four digits, e.g., `CR1234.json`)
- **Purpose:** Approved and merged CRs
- **Detection:** Collected for history table (future feature)
- **Ignored:** When looking for draft CR cover page

## Workflow Example

```
# In feature branch - preparing new CR
history/
  CRxxxx.json    ← Draft CR (shows as cover page)
  CR1234.json    ← Previous approved CR
  CR1235.json    ← Previous approved CR

# After approval and merge to main
history/
  CR1236.json    ← Renamed from CRxxxx.json
  CR1234.json
  CR1235.json

# Next CR in new feature branch
history/
  CRxxxx.json    ← New draft CR
  CR1236.json
  CR1234.json
  CR1235.json
```

## JSON Structure

### Required Fields

```json
{
  "Specification": "38.413",
  "Current version": "17.5.0",
  "CR": "0123",
  "Title": "Correction to handover procedure",
  "Category": "A",
  "Reason for change": "The specification is ambiguous regarding...",
  "Summary of change": "Add clarification text to section 8.3..."
}
```

### Optional Fields

```json
{
  "TDoc Number": "RP-240123",
  "rev": "1",
  "Date": "2024-03-15",
  "Source to WG": ["Company A", "Company B"],
  "Source to TSG": ["Company A"],
  "Work item code": ["FS_6GSpecs", "FS_6G_ARC"],
  "Affected": {
    "UICC": false,
    "ME": false,
    "RAN": true,
    "CN": true
  },
  "Consequences if not approved": "Implementations may interpret the specification differently...",
  "Clauses affected": "8.3.1, 8.3.2, 9.1",
  "Other specs affected": {
    "Other core specifications": "TS 38.423 CR 0456",
    "Test specifications": "",
    "O&M Specifications": ""
  },
  "Other comments": "This CR aligns with the decision in RAN3#123.",
  "Forge related attachments": "CR0123_diagram.pdf"
}
```

## Field Descriptions

### Basic Information

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `TDoc Number` | string | No | Meeting document number | `"RP-240123"` |
| `Specification` | string | **Yes** | TS/TR number | `"38.413"` |
| `CR` | string/number | **Yes** | 4-digit CR number | `"0123"` or `123` |
| `rev` | string/number | No | Revision number (0 = "-") | `"1"` or `1` |
| `Current version` | string | **Yes** | Specification version | `"17.5.0"` |
| `Title` | string | **Yes** | Short CR description (max 200 chars) | `"Correction to..."` |

### Source and Work Items

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Source to WG` | string[] | No | Source companies for WG submission |
| `Source to TSG` | string[] | No | Source companies for TSG submission |
| `Work item code` | string[] | No | Related work item codes |
| `Date` | string | No | CR submission date (YYYY-MM-DD) |

### Classification

| Field | Type | Required | Description | Values |
|-------|------|----------|-------------|--------|
| `Category` | string | **Yes** | CR category | `"A"`, `"B"`, `"C"`, `"D"`, `"F"` |
| `Affected` | object | No | Network elements affected | See below |

**Category values:**
- `A` - Correction
- `B` - Addition of feature
- `C` - Functional modification
- `D` - Editorial modification
- `F` - Correction (not affecting implementations)

**Affected object:**
```json
{
  "UICC": true,
  "ME": false,
  "RAN": true,
  "CN": false
}
```

### Change Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Reason for change` | string | **Yes** | Detailed explanation of why the change is needed |
| `Summary of change` | string | **Yes** | Concise summary of what is being changed |
| `Consequences if not approved` | string | No | Impact if the CR is not approved |
| `Clauses affected` | string | No | List of affected sections (e.g., "8.3.1, 9.1") |

### Related Specifications

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Other specs affected` | object | No | Related specifications and their CRs |

**Other specs affected object:**
```json
{
  "Other core specifications": "TS 38.423 CR 0456",
  "Test specifications": "TS 38.523-1 CR 0789",
  "O&M Specifications": ""
}
```

### Additional Information

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Other comments` | string | No | Additional notes or comments |
| `Forge related attachments` | string | No | List of attached files |

## Work Item Codes

The following work item codes are predefined for 6G studies:

- `FS_6GSpecs` - Study on Modernization of Specification Format and Procedures for 6G
- `FS_6G_REQ` - Study on 6G Use Cases and Service Requirements
- `FS_6G_RAN_Scen_Req` - Study on 6G Scenarios and Requirements
- `FS_6G_ARC` - Study on Architecture for 6G System
- `FS_6G_Radio` - Study on 6G Radio
- `FS_6G_APP` - Study on 6G Application Enablement
- `FS_6G_SEC` - Study on Security for the 6G System
- `FS_6G_MED` - Study on Media Aspects for 6G System
- `FS_6G_CH` - Study on Charging Aspects of 6G System
- `FS_6G_OAM` - Study on 6G Management and Orchestration
- `FS_6G_LI` - Study on Lawful Interception for 6G
- `FS_6G_CPCN_CT` - Study on Control Plane Protocols in Core Network of the 6G System
- `FS_6G_UPCN_CT` - Study on Protocol aspects for User Plane in Core Network of 6G System
- `FS_6G_ResRel_CT` - Study on Resilience and Reliability in Core Network of the 6G System
- `FS_6G_NAS_CT` - Study on NAS protocol for 6G System

## Complete Example

```json
{
  "TDoc Number": "RP-240123",
  "Specification": "38.413",
  "Current version": "17.5.0",
  "CR": "0123",
  "rev": "1",
  "Title": "Correction to handover procedure",
  "Source to WG": ["Company A", "Company B"],
  "Source to TSG": ["Company A"],
  "Work item code": ["FS_6G_RAN_Scen_Req"],
  "Date": "2024-03-15",
  "Category": "A",
  "Affected": {
    "UICC": false,
    "ME": false,
    "RAN": true,
    "CN": true
  },
  "Reason for change": "The current specification text in clause 8.3.1 is ambiguous regarding the handling of handover failures. This has led to different interpretations by implementers, causing interoperability issues in multi-vendor networks.",
  "Summary of change": "Add clarification text to clause 8.3.1 specifying that the source eNB shall maintain the UE context for 5 seconds after handover failure before releasing resources. Update the related procedure description in clause 8.3.2.",
  "Consequences if not approved": "Implementations will continue to interpret the specification differently, leading to interoperability issues and potential call drops in handover scenarios.",
  "Clauses affected": "8.3.1, 8.3.2, 9.1",
  "Other specs affected": {
    "Other core specifications": "TS 38.423 CR 0456",
    "Test specifications": "",
    "O&M Specifications": ""
  },
  "Other comments": "This CR aligns with the decision made in RAN3#123 and has been coordinated with the related CR in TS 38.423.",
  "Forge related attachments": "CR0123_sequence_diagram.pdf"
}
```

## VS Code JSON Schema Support

To enable autocomplete and validation in VS Code, add this to your workspace `.vscode/settings.json`:

```json
{
  "json.schemas": [
    {
      "fileMatch": [
        "**/history/CR*.json"
      ],
      "url": "./lib/templates/crCoverPageSchema.json"
    }
  ]
}
```

This provides:
- **Validation** - Red squiggly lines for invalid values
- **Autocomplete** - Ctrl+Space shows available fields
- **Hover tooltips** - Descriptions for each field
- **Enum dropdowns** - For Category and Work item code fields

## How It Works

### Detection

When you preview or export your specification:

1. SpecPress checks for `history/CRxxxx.json` (draft CR) in your specification root
2. If found, it loads and validates the JSON data
3. The CR cover page is rendered using the 3GPP CR template
4. The CR cover page **replaces** the standard specification front page

### Draft vs. Approved CRs

- **Draft CR** (`CRxxxx.json`) - Used for CR cover page in exports
- **Approved CRs** (`CR####.json`) - Collected for history table (future feature)

### Priority

- **Draft CR detected** (`CRxxxx.json`) → CR cover page is used
- **No draft CR** → Standard specification front page is used
- **CR file invalid** → Falls back to standard front page (with error notification)

### Output Formats

The CR cover page is supported in:
- **HTML preview** - Live preview in VS Code
- **HTML export** - Standalone HTML file
- **DOCX export** - Microsoft Word document with proper 3GPP styling

## File Structure Example

```
specification/
├── history/
│   ├── CRxxxx.json          ← Draft CR (shows as cover page)
│   ├── CR1234.json          ← Approved CR #1234
│   ├── CR1235.json          ← Approved CR #1235
│   └── CR1236.json          ← Approved CR #1236
├── assets/
│   ├── frontPageData.json   ← Standard front page (used when no draft CR)
│   └── images/
├── 01_Scope/
│   └── 00_Scope.md
├── 02_References/
│   └── 00_References.md
└── ...
```

## Validation Patterns

### TDoc Number
Pattern: `[CSR][P1-6]-[0-9]{6,7}`

Examples: `RP-240123`, `R3-1234567`, `SP-263456`

### Specification
Pattern: `[0-9]{2}\.[0-9]{3}(-[0-9])?`

Examples: `38.413`, `24.501-1`

### Current version
Pattern: `[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2}`

Examples: `17.5.0`, `18.0.0`

### CR Number
Pattern: `[0-9]{4}` (or number 0-9999)

Examples: `0123`, `1234`

## Troubleshooting

### CR cover page not showing

1. **Check file location**: Must be in `history/` folder at specification root
2. **Check file name**: Must be exactly `CRxxxx.json` (four x's)
3. **Check JSON syntax**: Use VS Code's JSON validation or an online JSON validator
4. **Check for validation errors**: Look for error notifications in VS Code

### Validation errors

1. **Missing required fields**: Ensure all required fields are present
2. **Invalid format**: Check that field values match the expected patterns
3. **Wrong data type**: Arrays should be `["item1", "item2"]`, not `"item1, item2"`

### Preview shows standard front page

This is expected if:
- You're not at the beginning of the specification (single-file preview scrolled down)
- You're previewing a subset of files that doesn't include the spec root
- The CR JSON file has errors (check console for warnings)

## Best Practices

1. **Start with template**: Copy `CRxxxx.json` and rename it to your CR number
2. **Use arrays for lists**: `"Source to WG": ["Company A", "Company B"]` not `"Company A, Company B"`
3. **Keep title short**: Maximum 200 characters for the Title field
4. **Use proper dates**: Format dates as `YYYY-MM-DD` (e.g., `2024-03-15`)
5. **Commit CR files**: Include CR JSON files in your git repository
6. **One CR per file**: Each CR should have its own JSON file

## Differences from Standard Front Page

When a CR cover page is detected:

| Aspect | Standard Front Page | CR Cover Page |
|--------|-------------------|---------------|
| Template | 3GPP specification cover | 3GPP CR form |
| Content | Spec metadata (title, version, TSG) | CR metadata (change description, category) |
| Sections | 2 pages (cover + keywords) | 1 page (CR form) |
| Use case | Final specifications | Change requests |

## Related Files

- **Template**: `lib/templates/cr_cover_template.htm` - HTML template with placeholders
- **Schema**: `lib/templates/crCoverPageSchema.json` - JSON schema for validation
- **Example**: `lib/templates/crCoverPage.json` - Example CR data file
- **Detector**: `lib/common/crCoverPageDetector.js` - Detection logic
- **Loader**: `lib/common/crCoverPageLoader.js` - Data loading and formatting
- **HTML Renderer**: `lib/md2html/crCoverPageRenderer.js` - HTML generation
- **DOCX Renderer**: `lib/md2docx/crCoverPageRenderer.js` - DOCX generation

## Backward Compatibility

The CR cover page feature is fully backward compatible:

- Existing specifications without CR files work unchanged
- Standard front page remains the default behavior
- No configuration changes required
- No breaking changes to existing workflows

## Future Enhancements

Potential future improvements:

- **CR History Table** - Automatic table of all approved CRs in an Annex
  - Sorted by specification version, then CR number
  - Includes CR number, TDoc, title, category, and version
  - Generated from all `CR####.json` files in `history/` folder
- CR template generator command
- CR validation command
- CR diff view between revisions
- Auto-populate fields from specification metadata
- Custom CR templates
