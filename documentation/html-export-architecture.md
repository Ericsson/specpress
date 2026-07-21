# HTML Export Architecture

## Current call graph — SpecPressExt "Export Selected to HTML"

The VS Code command handles both plain export and diff export in a single
function. The diagram below shows every specpress function it calls.

```mermaid
flowchart TD
    CMD["User: Export Selected to HTML\n(exportHtml.js)"]

    CMD --> GRR["getRepoRoot()"]
    CMD --> PV["pickVersions()\n[VS Code UI]"]
    CMD --> SCP["selectCoverPage()\n[VS Code UI]"]

    CMD --> CFU["collectFiles()\nor collectFilesFromCommit()"]
    CMD --> CCR["createCommitResolver()\nor createLocalResolver()"]
    CMD --> CF["concatenateFiles()"]
    CMD --> IOM["insertOmittedMarkers()\n[if partial selection]"]

    CMD --> MH["new Md2Html(css, mermaidConfig, specRootPath)"]

    subgraph plain ["Plain export (no diff)"]
        MH --> RMFE["renderMarkdownForExport(content)"]
    end

    subgraph diff ["Diff export"]
        MH --> RMFE2["renderMarkdownForExport(compareContent)\n[for HTML shell]"]
        MH --> DH["diffHtml(baselineContent, currentContent,\nbaselineFileResolver, currentFileResolver)"]
    end

    CMD --> IMG["copyImagesToMedia()\n[inline in exportHtml.js]\n- resolveImagePath()\n- copyImage() via resolver.readFile() or fs\n- two-pass: diff-del-block first (_old suffix),\n  then remaining images"]

    CMD --> WF["fs.writeFileSync(outputPath, html)"]
```

The image copy logic is **inline** inside `exportHtml.js` — it is not a
shared library function.

---

## Current call graph — CLI `export-html.js` (plain export)

```mermaid
flowchart TD
    CLI["node export-html.js inputDir outputDir"]

    CLI --> MH2["new Md2Html(css, mermaidConfig, specRootPath)"]
    MH2 --> EHFD["exportHtmlFromDirectory(inputDir, outputDir)"]

    subgraph inside ["Inside exportHtmlFromDirectory (Md2Html method)"]
        EHFD --> CF2["collectFiles(inputDir)"]
        EHFD --> CF3["concatenateFiles(files)"]
        EHFD --> RMFE3["renderMarkdownForExport(content)"]
        EHFD --> IMG2["image copy loop\n(regex, fs only, no resolver)"]
        EHFD --> WF2["fs.writeFileSync(index.html)"]
    end
```

---

## Current call graph — CLI `export-html-diff.js`

```mermaid
flowchart TD
    DCLI["node export-html-diff.js paths --base X --revision Y"]

    DCLI --> GC["getContent(base)\n→ collectFilesFromCommit + concatenateFiles\n→ createCommitResolver"]
    DCLI --> GC2["getContent(revision)\n→ collectFiles + concatenateFiles"]

    DCLI --> MH3["new Md2Html(css, mermaidConfig, specRootPath)"]
    DCLI --> DH2["diffHtml(baselineContent, currentContent,\nbaselineFileResolver)"]
    DCLI --> WH["handler.wrapHtml(diffBody)"]
    DCLI --> WF3["fs.writeFileSync(outputPath, html)"]

    WF3 -. "❌ NO image copy step" .-> MISSING["Images are broken\nin output file"]
```

---

## Problems with the current CLI paths

| | `export-html.js` | `export-html-diff.js` |
|---|---|---|
| Image copy | ✅ yes, but old regex loop | ❌ missing entirely |
| Git-sourced images | ❌ no resolver, fs only | ❌ no resolver |
| Diff support | ❌ no | ✅ yes |
| Omitted-section markers | ❌ no | ❌ no |
| Code duplication vs SpecPressExt | ✅ high | ✅ high |

---

## Proposed solution — extract `exportHtml()` to specpress

The entire body of `exportHtml.js` (minus the VS Code UI calls) is pure
file-system logic that belongs in specpress. Extract it as a library
function `exportHtml(opts)` in `lib/md2html/exportHtml.js`, then:

- Both CLI scripts become thin wrappers that parse args and call it.
- SpecPressExt's `exportHtml.js` also calls it (replacing its inline logic).
- `exportHtmlFromDirectory` on `Md2Html` can be removed or kept as a
  thin wrapper for backwards compatibility.

```mermaid
flowchart TD
    subgraph specpress ["specpress  lib/md2html/exportHtml.js"]
        EH["exportHtml(opts)\n─────────────────────────────\nopts.inputPaths   string[]\nopts.outputPath   string\nopts.specRoot     string\nopts.baseCommit   string|null  ('local' = working copy)\nopts.compareCommit string|null\nopts.repoRoot     string|null\nopts.css          string\nopts.mermaidConfig string\nopts.mscgenConfig  string\nopts.frontPageData object|null\nopts.crCoverPageData object|null\n─────────────────────────────\nreturns { fileCount, imageCount }"]

        EH --> CFX["collectFiles() / collectFilesFromCommit()"]
        EH --> CCRX["createCommitResolver() / createLocalResolver()"]
        EH --> CFX2["concatenateFiles()"]
        EH --> IOMX["insertOmittedMarkers() [if partial]"]
        EH --> MHX["new Md2Html(...)"]
        EH --> RMFEX["renderMarkdownForExport()"]
        EH --> DHX["diffHtml() [if compareCommit set]"]
        EH --> IMGX["copyImagesToMedia()\n(two-pass, resolver-aware)"]
        EH --> WFX["fs.writeFileSync()"]
    end

    subgraph cli1 ["lib/cli/export-html.js  (~15 lines)"]
        C1["parseArgs → exportHtml(opts)"]
    end

    subgraph cli2 ["lib/cli/export-html-diff.js  (~15 lines)"]
        C2["parseArgs → exportHtml(opts with baseCommit+compareCommit)"]
    end

    subgraph ext ["SpecPressExt  src/vscode/exportHtml.js"]
        EXT["VS Code UI (pickVersions, selectCoverPage, showSaveDialog)\n→ exportHtml(opts)\n→ showExportNotification()"]
    end

    C1 --> EH
    C2 --> EH
    EXT --> EH
```

### What `exportHtml()` replaces

| Today | After |
|---|---|
| `exportHtmlFromDirectory` (Md2Html method, local-only) | deleted / thin wrapper |
| image copy loop in `exportHtml.js` (SpecPressExt) | moved to `exportHtml()` |
| missing image copy in `export-html-diff.js` | fixed for free |
| `export-html.js` CLI (~60 lines) | ~15 lines |
| `export-html-diff.js` CLI (~90 lines) | ~15 lines |

The two CLI scripts become identical in structure to `export-docx.js` and
`export-docx-diff.js` — they just parse args and delegate everything to the
library.
