# Band Combinations (RAN4 Library)

The `lib/ran4/` directory contains a library for loading, validating, and rendering 3GPP RAN4 band combination data as defined in TS 38.101-1, 38.101-2, and 38.101-3.

## Overview

Band combination data is stored as JSON files in a folder hierarchy:

- `n*.json` — Channel bandwidth definitions per band (e.g., `n1.json`, `n78.json`)
- `CA_*.json` — Carrier Aggregation band combinations (e.g., `CA_n1A-n78C.json`)
- `DC_*.json` — Dual Connectivity band combinations (e.g., `DC_n1A-n78A.json`)
- `common/jsonSchemas/` — JSON schemas for validation

## Architecture

| Module | Responsibility |
|--------|---------------|
| `BC_ID.ts` | Parses and represents a Band Combination Identifier (e.g., `CA_n1A-n78C`) |
| `BWC_ID.ts` | Parses Bandwidth Combination identifiers (e.g., `2A`, `A-C`) |
| `BandNumber.ts` | Represents NR/EUTRA band numbers with FR1/FR2 classification |
| `SubcarrierSpacing.ts` | Subcarrier spacing values with validation |
| `ChannelBandwidthPerBand.ts` | Channel bandwidth data per band and SCS |
| `BandCombinations.ts` | CA band combination data with BCS entries and UL configs |
| `DualConnectivity.ts` | DC band combination data |
| `HtmlTable.ts` | HTML table builder for rendering BC tables |
| `RAN4DataHandler.ts` | Top-level container that loads bands, CA, and DC data |
| `ValidateData.ts` | Orchestrates loading and validation of all data |
| `JsonTools.ts` | JSON file I/O, schema compilation, and the RAN4JsonEncoder |
| `Logger.ts` | Singleton logger for validation output |
| `Utils.ts` | Shared base classes, constants, and the `normalizeJsonFile` function |

## CLI Tools

### Validate Band Combination Data

Validates all band, CA, and DC JSON files against their schemas and cross-checks data consistency.

```bash
node node_modules/specpress/lib/cli/validate-38101.js [options] <rootFolder>
```

Options:

- `--skip-validation` — Skip content validation (cross-references, value ranges)
- `--skip-schema` — Skip JSON schema validation
- `--no-abort` — Continue on errors instead of aborting at the first failure
- `--output <file>` — Write validation log to the specified file

Examples:

```bash
# Full validation of all data
node node_modules/specpress/lib/cli/validate-38101.js ./data/38.101

# Schema validation only
node node_modules/specpress/lib/cli/validate-38101.js --skip-validation ./data/38.101

# Content validation only, log to file
node node_modules/specpress/lib/cli/validate-38101.js --skip-schema --output validation.log ./data/38.101
```

Exit codes:

- `0` — No errors
- `1` — Content validation errors
- `2` — Schema validation errors
- `3` — Both content and schema errors

### Normalize a JSON File

Rewrites a single RAN4 JSON file with consistent formatting: canonical key ordering, sorted UL configs, sorted notes, and consistent indentation.

```bash
node node_modules/specpress/lib/cli/normalize-json-file.js <path-to-json-file>
```

The tool auto-detects the file type (band, CA, or DC) from the JSON content and applies the appropriate normalization rules.

Example:

```bash
node node_modules/specpress/lib/cli/normalize-json-file.js ./data/38.101/CA_n1A-n78C.json
```

## Programmatic Usage

```javascript
import { loadAndValidateAll } from 'specpress/lib/ran4/ValidateData.js'
import { BC_ID } from 'specpress/lib/ran4/BC_ID.js'
import { RAN4DataHandler } from 'specpress/lib/ran4/RAN4DataHandler.js'

// Validate all data in a folder
const { exitCode } = loadAndValidateAll('./data/38.101', false, false, true)

// Parse a BC-ID
const bcId = new BC_ID('CA_n1A-n78C')
console.log(bcId.isIntraBand())      // false
console.log(bcId.getNrofCarriers())  // 2
console.log(bcId.isFr1())           // true
console.log(bcId.getBandNumbers())  // [BandNumber(n1), BandNumber(n78)]

// Load data programmatically
const db = new RAN4DataHandler()
db.chBwList.loadByPattern('./data/38.101', 'n*.json', false, null, true)
db.bcList.loadByPattern('./data/38.101', 'CA_*.json', false, null, true)
```
