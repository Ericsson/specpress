# DOCX DIFF — CLI and CI Pipeline

SpecPress can generate tracked-changes DOCX comparisons from the command line, without VS Code. This enables automated Change Request generation in CI pipelines using either Microsoft Word (Windows) or LibreOffice (cross-platform) as the merge backend.

## CLI Usage

```bash
node lib/cli/docx-diff.js <inputPaths...> --output <file>
  --base <commit>
  --revisions <commit1> [<commit2> ...]
  [--authors <author1> [<author2> ...]]
  [--spec-root <dir>]
  [--omitted-markers]
  [--backend auto|word|libreoffice]
  [--mermaid-config <file>]
  [--front-page-data <file>]
  [--cr-cover-page-data <file>]
```

### Arguments

| Argument | Description |
| --- | --- |
| `<inputPaths...>` | One or more files or folders containing the specification sources. |
| `--output <file>` | Path for the output DOCX file. |
| `--base <commit>` | Baseline version (git ref or `local` for working copy). |
| `--revisions <commit...>` | One or more revision versions to compare against the base. |
| `--authors <name...>` | Author names for tracked changes (one per revision). See [Author Name Derivation](#author-name-derivation) for default behavior when omitted. |
| `--spec-root <dir>` | Specification root for section numbering. Omit to disable. |
| `--omitted-markers` | Insert markers where gaps exist between selected files. |
| `--backend auto\|word\|libreoffice` | Merge backend. Default: `auto` (tries Word first on Windows, then LibreOffice). |
| `--mermaid-config <file>` | Path to mermaid configuration JSON. Falls back to built-in default. |
| `--front-page-data <file>` | Path to front page JSON (used when no CR cover page is provided). |
| `--cr-cover-page-data <file>` | Path to CR cover page JSON file (e.g. `history/CRxxxx.json`). |

### Author Name Derivation

When `--authors` is omitted, the author name is derived automatically from the CR cover page data file (`--cr-cover-page-data`):

1. If the `CR` field is present, the base name is `CR` followed by the zero-padded number (e.g. `CR0042`). If absent, the placeholder `CRxxxx` is used.
2. If `Source to WG` is present and contains at least one element, the first element is appended (e.g. `CR0042_Ericsson`).
3. Otherwise, if `Source to TSG` is present and contains at least one element, the first element is appended (e.g. `CRxxxx_RAN3`).

If no `--cr-cover-page-data` is provided (or the file cannot be read), the default author is `Author`.

### Usage Examples

**Compare a branch against its merge-base (typical CR workflow):**

```bash
BASE=$(git merge-base HEAD origin/main)

node lib/cli/docx-diff.js specification/ \
  --output CR0042.docx \
  --base "$BASE" \
  --revisions local \
  --spec-root specification/ \
  --cr-cover-page-data specification/history/CRxxxx.json \
  --backend libreoffice
```

Since `--authors` is omitted, the author name is derived from `CRxxxx.json` (e.g. `CR0042_Ericsson`).

**Explicit author names with multiple revisions:**

```bash
node lib/cli/docx-diff.js specification/ \
  --output diff.docx \
  --base HEAD~3 \
  --revisions HEAD~1 HEAD \
  --authors "Intermediate" "Final" \
  --spec-root specification/ \
  --backend word
```

**Use local working copy as revision:**

```bash
node lib/cli/docx-diff.js specification/ \
  --output diff.docx \
  --base main \
  --revisions local \
  --authors "My changes"
```

## How It Works

1. **Generate DOCX for each version** — Extracts files from git commits (via `git archive`) or reads local files, concatenates them with section numbering, renders mermaid diagrams, and produces a DOCX file.
2. **Merge with tracked changes** — Invokes the merge backend (Word or LibreOffice) to compare the base against each revision, producing a DOCX with insertions and deletions.
3. **Author attribution** — Each revision's tracked changes are attributed to the corresponding author name. When using LibreOffice, the author is set via post-processing of the DOCX XML.
4. **Clean up** — Temporary files are removed after successful generation.

## Merge Backends

| Aspect | MS Word | LibreOffice |
| --- | --- | --- |
| Platform | Windows only | Cross-platform |
| Revisions | Multiple (backward merge) | 1 per invocation |
| Invocation | VBScript via `cscript` | Python-UNO via bundled Python |
| CI suitability | Windows runners with Office | Any runner with `libreoffice-writer` |
| Detection | Windows registry | Common paths (`/usr/bin/soffice`, etc.) |

### LibreOffice Backend Details

The LibreOffice backend uses a Python-UNO script (`lib/scripts/merge_tracked_changes.py`) that:

1. Starts a headless LibreOffice instance listening on a named pipe
2. Connects via UNO bridge
3. Opens the revision document and compares against the base using `.uno:CompareDocuments`
4. Saves the result as DOCX
5. Post-processes the DOCX (ZIP/XML) to set the correct author name on all tracked-change elements
6. Kills the LibreOffice process tree

The script can also be invoked directly for testing:

```bash
# Using LibreOffice's bundled Python (has UNO bindings)
/usr/lib/libreoffice/program/python \
  lib/scripts/merge_tracked_changes.py \
  base.docx revision.docx output.docx "Author Name" /usr/bin/soffice
```

## CI Pipeline Integration

### GitLab CI Template

Copy `ci_templates/.gitlab-ci-docx-diff.yml` to your specification repository as `.gitlab-ci.yml` and configure the variables:

```yaml
variables:
  SPEC_INPUT_DIR: "specification"
  SPEC_ROOT: "specification"
  SPEC_NUMBER: "38413"
  BASE_COMMIT: "HEAD~1"        # or use git merge-base in script
  REVISION_COMMIT: "HEAD"
  AUTHOR_NAME: "Latest changes" # or omit to derive from CR data
  BACKEND: "libreoffice"
```

### CR-Aware Pipeline

For a pipeline that automatically derives the author name and baseline from CR metadata:

```yaml
docx-diff:
  stage: build
  image: node:20
  before_script:
    - apt-get update && apt-get install -y --no-install-recommends git libreoffice-writer chromium
    - export CHROME_BIN=$(which chromium)
    - git clone --depth 1 $SPECPRESS_REPO /tmp/specpress
    - cd /tmp/specpress && npm ci --production && cd -
  script:
    - BASE=$(git merge-base HEAD origin/main)
    - >
      node /tmp/specpress/lib/cli/docx-diff.js
      specification/
      --output output/diff.docx
      --base "$BASE"
      --revisions HEAD
      --spec-root specification/
      --cr-cover-page-data specification/history/CRxxxx.json
      --backend libreoffice
  artifacts:
    paths:
      - output/*.docx
```

Since `--authors` is omitted, the author name is derived from `CRxxxx.json` automatically (e.g. `CR0042_Ericsson`).

### CI Prerequisites

- **Node.js 16+** — for the CLI and DOCX generation
- **LibreOffice Writer** — `apt install libreoffice-writer` (Debian/Ubuntu)
- **Chrome/Chromium** — only needed if the spec contains mermaid diagrams
- **git** — for extracting files from commits

Minimal Debian/Ubuntu install:

```bash
apt-get install -y git libreoffice-writer chromium
export CHROME_BIN=$(which chromium)
```

## Limitations

- LibreOffice backend currently supports 1 revision per invocation (multi-revision support planned)
- LibreOffice's SVG rendering is limited — some mermaid diagram types may appear garbled when viewed in LibreOffice, but display correctly in MS Word
- Mermaid rendering requires Chrome/Chromium when running outside VS Code

## Related Documentation

- [DOCX DIFF (VS Code)](https://github.com/Ericsson/SpecPressExt/blob/main/documentation/DOCX-DIFF.md) — Interactive usage via the VS Code extension
- [CR Cover Page](CR-Cover-Page.md) — CR JSON file format and fields
- [specpress README](../README.md) — Core library documentation
