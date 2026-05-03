# SpecPress

SpecPress is a library for converting 3GPP specifications — written as a tree of Markdown, JSON, and ASN.1 files — into consistent HTML or DOCX documents that match the look and feel of traditional 3GPP Word specifications.

The core library lives in the `lib/` directory and provides a programmatic API for:

- Parsing and concatenating specification files from a folder hierarchy
- Rendering markdown to HTML with 3GPP-style formatting
- Exporting to DOCX with proper 3GPP paragraph styles, section numbering, equations, and diagrams

SpecPress is used by the [SpecPress Extension for VS Code](https://github.com/Ericsson/SpecPressExt) but is equally suited for CI pipelines, local scripts, or integration with other editors.

## Installation

```bash
npm install specpress
```

Requires Node.js 16 or higher.

## CLI Usage

SpecPress includes command-line scripts for converting a set of files and/or folders to HTML or DOCX without VS Code.

### Export to HTML

```bash
node node_modules/specpress/lib/cli/export-html.js <inputDir> <outputDir> [--css <file>] [--mermaid-config <file>]
```

This collects all `.md`, `.markdown`, and `.asn` files from `<inputDir>` (recursively), converts them to a single HTML file at `<outputDir>/index.html`, and copies referenced images into a `media/` subdirectory.

### Export to DOCX

```bash
node node_modules/specpress/lib/cli/export-docx.js <inputDir> <outputFile> [--spec-root <dir>] [--mermaid-config <file>]
```

This collects all spec files from `<inputDir>`, processes section numbers (if `--spec-root` is provided), renders mermaid diagrams via a headless Chromium browser, and generates a DOCX file with 3GPP-style formatting.

Options:

- `--spec-root <dir>` — Specification root for section numbering. Enables x-placeholder resolution. Omit to disable section numbering.
- `--mermaid-config <file>` — Path to a mermaid configuration JSON file. Falls back to the built-in default.

Mermaid rendering requires Chrome or Edge to be installed on the system.

### CI Pipeline Integration

The `ci_templates/` directory contains ready-to-use GitLab CI configurations:

- **`.gitlab-ci-export-docx.yml`** — Builds a DOCX artifact from your spec on every push to main or tag. Configure `SPEC_INPUT_DIR`, `SPEC_ROOT`, and `DOCX_OUTPUT` variables.
- **`.gitlab-ci-export-html.yml`** — Builds HTML and publishes it via GitLab Pages. Configure `SPEC_INPUT_DIR`.

To use them, copy the relevant file into your specification repository as `.gitlab-ci.yml` (or include it from your existing pipeline). The templates clone specpress at build time, so no local installation is needed in the CI runner.

## Testing

After `npm install`, run the full test suite:

```bash
npm test
```

This executes all unit tests covering the conversion logic (markdown-to-HTML, markdown-to-DOCX, section numbering, ASN.1 handling, JsonTable, mermaid caching, etc.).

### Regression Testing

The `scripts/regression-test.js` script helps verify that refactoring does not change the output. It clones a specification repository, exports HTML and DOCX, and compares the results against a stored baseline:

```bash
node scripts/regression-test.js generate   # export and store as baseline
node scripts/regression-test.js validate   # export again and compare against baseline
```

Configure the spec repository via environment variables `SPEC_REPO` and `SPEC_SUBDIR`, or edit the defaults in the script.

## Conversion Features

The markdown-to-HTML/DOCX conversion goes beyond regular markdown rendering. The intention is to produce styles in the output documents which markdown does not support out of the box. At the same time, we want to be able to use regular markdown in the source files so that the markdown documents render well also without these tools (e.g. in the Gitlab web-view). The following special adaptations are performed by SpecPress:

- **Cover page** support: an HTML template with {{placeholder}} substitution from a JSON data file, rendered as the first page(s) in both HTML and DOCX exports.
- A paragraph containing **{TableOfContent(N-M)}** generates a clickable table of contents covering heading levels N through M in both HTML and DOCX.
- Semi-automated **section numbering** based on leading numbers in folder- and file names. See [Section Numbering](#section-numbering) for a detailed description.
- A level-1 heading starting with "**Annex**" is treated as an Annex heading with a line break after the first colon (Heading8 style in DOCX).
- An unordered **bullet list** in markdown is converted into a Bx-Style list in HTML and DOCX. I.e., it is assumed that the first "word" in the bullet text is the "bullet character". The script extracts those one or more first characters and declares them accordingly in the corresponding "\<li\>" statements in the generated HTML. Furthermore, the CSS for the corresponding *li*/*ul* styles is adjusted so that bullet lists are indented properly. This scheme allows using various bullets styles (e.g. -, 1>, 2>, [1], [2], ...) as it used to be done with the traditional B1, B2, B3... styles in DOCX.
- **Images** are embedded in DOCX with their native aspect ratio preserved. Large images are scaled to fit the page width; small images are not upscaled beyond 125 DPI to avoid pixelation.
- A fenced code-block with the content **mermaid** is interpreted as a graph and rendered as a figure.
- **JsonTable** is a table format where columns and rows are defined in JSON (in separate JSON files linked into MD files or embedded directly into a MD code fence). The JsonTable supports markdown formatting in cells (including equations, line-breaks, ...) as well as horizontally and vertically merged cells.
- **Equations** in LaTeX format are rendered in the HTML preview and embedded as native equations in an exported DOCX file.
- **ASN.1 files** (`.asn`) are automatically included when collecting files from a folder. In multi-file mode, SpecPress extracts leading comments and the module name to generate a section heading and descriptive paragraph before the ASN.1 code block.
- A fenced code block with the content descriptor **asn** is interpreted as ASN.1 code block. The text therein is parsed for keywords, comments, type-names and field-names. Each of those is associated with an appropriate CSS class which are formatted accordingly. Long lines are wrapped and indented appropriately.
- A fenced code block with any other language tag (or no tag) is rendered with the **PL** style (Courier New, black background) in DOCX.
- A paragraph that begins with the word "Figure" and that appears immediately after an embedded image or after a fenced code block is interpreted as a **figure caption**. SpecPress associates it with a dedicated CSS class (".figure-caption") with an appropriate style in DOCX.
- A paragraph that begins with the word "Table" and that precedes an embedded table is interpreted as a **table caption**. SpecPress associates it with a dedicated CSS class (".table-caption") with an appropriate style in DOCX.
- A paragraph that begins with "**NOTE**" or "**NOTE N:**" (where N is a number) is interpreted as an informative note and associated with a special CSS class (".note") and DOCX style NO. Inside table cells, NOTE paragraphs get the TAN style with hanging indentation.
- A paragraph that begins with "**EXAMPLE**" is interpreted as an example and associated with CSS class ".example" and DOCX style EX.
- A paragraph that begins with the word "**Editor's Note**" is interpreted as an editor's note and associated with a special CSS class (".editors-note") which is rendered in red font and indented accordingly.
- **Hyperlinks** in markdown are exported as clickable hyperlinks in both HTML and DOCX (with the Hyperlink character style: blue, underlined).

### Section Numbering

SpecPress can derive section numbers automatically from the folder and file hierarchy.

#### Folder and file structure

The specification is organized as a tree of numbered folders and files:

```txt
spec/                          ← specificationRootPath
  01 Scope/
    00 Scope.md                ← section 1 (from folder "01")
  02 References/
    00 References.md           ← section 2
  03 Definitions/
    01 Terms.md                ← section 3.1
    02 Abbreviations.md        ← section 3.2
```

Each folder and file name starts with a number. The numbers are collected along the path from the spec root to the file, skipping zeros (which denote "this file provides the heading for its parent folder"). The collected numbers form the **derived section number**.

For example, `spec/03 Definitions/02 Abbreviations.md` derives section number `3.2`.

#### x-placeholders in headings

Inside each markdown file, headings use **x-placeholders** instead of hardcoded section numbers:

```markdown
## x.x Definitions

### x.x.1 Terms

### x.x.2 Abbreviations
```

The `x` components are replaced by the derived section number at render time. The number of `x` components must match the depth of the derived section number. For example, in a file with derived number `3.2`:

- `## x.x Abbreviations` → `## 3.2 Abbreviations`
- `### x.x.1 General` → `### 3.2.1 General`
- `### x.x.2 Specific` → `### 3.2.2 Specific`

Headings without x-placeholders and without leading numbers are left unchanged (unnumbered headings). Headings with manually written section numbers (e.g. `## 3.2 Abbreviations`) produce an **E.R.R.O.R** marker to flag the inconsistency.

#### x-placeholders in captions

Figure and table captions also support x-placeholders:

```markdown
Table x.x-1: My table caption

Figure x.x.x-1: My figure caption
```

The `x.x` part is replaced by the section number of the most recent resolved heading. The number after the dash is a sequential identifier within the section.

#### Auto-generated folder headings

When a folder does not have a `00`-prefixed file to provide its heading, SpecPress automatically generates a heading title from the folder name. These auto-generated headings are marked with `<!-- AUTO-HEADING -->` comments internally and are not flagged as errors.

### Mermaid Diagram Caching

Mermaid diagrams embedded in markdown code fences are rendered to SVG and cached on disk for fast re-exports and stable DOCX diffs.

#### SVG cache location

Rendered SVG files are stored in a `cached/` directory as a sibling of the specification root folder:

```txt
repo/
  spec/           ← specificationRootPath
    03 Building blocks/
      05 Mermaid.md
  cached/          ← SVG cache (sibling of spec)
    a1b2c3d4...svg
    e5f6a7b8...svg
```

#### Cache key

Each SVG file is named by the SHA-256 hash of the mermaid source code combined with the mermaid configuration. This means:

- **Same source → same file** — unchanged diagrams produce identical SVG bytes across exports, eliminating false tracked changes in DOCX DIFF comparisons.
- **Fast re-exports** — cached diagrams are served from disk without re-rendering.
- **Shareable via git** — the `cached/` directory should be committed to the repository. Colleagues who clone the repo get the pre-rendered SVGs and don't need to re-render them.

#### Automatic cleanup

After each export, SpecPress scans all markdown files in the spec root for mermaid fences and deletes any cached SVGs that are no longer referenced.

#### Standalone rendering

When running from the command line (outside VS Code), mermaid diagrams are rendered using a headless Chromium-based browser (Edge or Chrome). SpecPress auto-detects the browser from common installation paths. If no browser is found, mermaid diagrams are skipped and a placeholder is inserted.

## Local Development Tools

The specpress repository also contains standalone tools for local development workflows via the `src/` directory.

### WYSIWYG-like experience while working on your specifications

SpecPress enables you to have a "what you see is what you get"-like experience when editing your specifications by displaying the specification as a webpage. Run the `npx sp_start` command in the terminal and SpecPress will convert and concatenate the specification files from your working directory into a single HTML file which is published on a local http server. The resulting web page can be displayed in any browser that points at `http://localhost:8080`.

```
npx sp_start
```

The `sp_start` command is equivalent to running in parallel the `sp_publish`, `sp_watch` and `sp_serve` commands described below.

### Display the specification as a web page

Execute the following commands to display your specification as a webpage on your local http server:

```
# create the /mySpecifications/public/index.html file
npx sp_publish

# start the http server from the /mySpecifications/public folder
# the server is accessible at http://localhost:8080
npx sp_serve
```

### Watch for changes in your source files

```
npx sp_watch
```

The `sp_watch` command will:

- watch for changes in your specification's source files `[".asn", ".json", ".md"]` and update the `index.html` file according to your changes,
- watch for changes in your UML sequence diagrams source files `[".puml", ".txt"]` and generate the corresponding PNG files in the `/mySpecifications/src/38423/assets/figures` folder

### Generate UML diagrams from text files using PlantUML

SpecPress enables you to automatically generate `.png` files containing UML diagrams using as an input a text file containing a textual description of the UML diagram as presented in the example below:

```
#/mySpecifications/src/38423/example.txt
@startuml
Alice -> Bob: Authentication Request
Boby --> Alice: Authentication Response
@enduml
```

The `.png` files are saved in the specification's subfolder indicated in the `sp.config.json` file.

```
# generate .png files for all the .txt files in the working folder
npx sp_generateUML

# generate .png file for a specific .txt file in the working folder
npx sp_generateUML-file ./example.txt
```

### Export a .docx or .html file

SpecPress enables you to export a file which contains all the specification files from the working folder. The exported file will be saved in the `/mySpecifications/export` folder.

```
# export a docx file
npx sp_export docx

# export an html file
npx sp_export html
```

## Contributing

### Architecture

The `lib/` directory is organized by concern:

- **`common/`** — Shared utilities (paragraph classification, section numbering, file collection, bullet parsing, git helpers). No dependency on markdown-it or docx.
- **`md2html/`** — HTML renderer built on markdown-it. `md2html.js` is the main class; `handlers/` contains format-specific logic (ASN.1 highlighting, JsonTable).
- **`md2docx/`** — DOCX converter built on the docx library. `md2docx.js` walks markdown-it tokens and emits docx elements; `handlers/` contains specialized converters (equations, mermaid, JsonTable, ASN.1); `styles/` defines 3GPP paragraph styles.
- **`cli/`** — Thin command-line wrappers around the library classes.
- **`css/`** — Default stylesheet and mermaid configuration.

The `src/` directory provides local development tools (`sp_start`, `sp_publish`, `sp_watch`, `sp_export`, etc.) that delegate to the `lib/` converters for all markdown-to-HTML and markdown-to-DOCX processing.

Key principles:

- **Single responsibility** — each module does one thing. Handlers are isolated and testable independently.
- **No VS Code dependency** — the entire `lib/` directory must run in plain Node.js (CLI, CI, tests). VS Code integration lives exclusively in the [SpecPressExt](https://github.com/Ericsson/SpecPressExt) repository.
- **Shared classification** — paragraph type detection (`classifyParagraph`) is defined once in `common/specProcessor.js` and used by both HTML and DOCX paths, ensuring consistent behavior.
- **Injected dependencies** — renderers, image resolvers, and mermaid render functions are passed in via constructor options or function parameters, never hardcoded.

### Coding style

- **CommonJS** modules (`require()` / `module.exports`) inside `lib/`
- **ES modules** (`import` / `export`) inside `src/`
- **2-space indentation**, no semicolons
- **Single quotes** for strings, template literals for HTML/multi-line
- **camelCase** for functions and variables, **PascalCase** for classes
- Import dependencies at the top, grouped: Node.js built-ins, then npm packages, then local modules

### Anti-patterns to avoid

- Duplicating classification logic between HTML and DOCX paths — use `common/specProcessor.js`
- Adding VS Code or editor-specific code to `lib/` — that belongs in SpecPressExt
- Hardcoded path separators — use `path.join()`
- Synchronous file I/O in async code paths (mermaid rendering, DOCX export) — use async where the caller expects it

## Repository

[https://github.com/Ericsson/specpress](https://github.com/Ericsson/specpress)
