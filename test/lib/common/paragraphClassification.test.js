const assert = require('assert')
const { Md2Html } = require('../../../lib/md2html/md2html')
const { MarkdownToDocxConverter, buildInlineRuns } = require('../../../lib/md2docx/md2docx')
const { PARA } = require('../../../lib/common/specProcessor')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

async function asyncTest(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

/**
 * Extracts the w:pStyle value from a docx Paragraph, or null if none.
 */
function getDocxStyle(paragraph) {
  const pPr = paragraph.root && paragraph.root[0]
  if (!pPr || pPr.rootKey !== 'w:pPr') return null
  for (const child of pPr.root) {
    if (child.rootKey === 'w:pStyle') {
      return child.root[0].root.val.value
    }
  }
  return null
}

/**
 * Runs the DOCX converter on markdown content and returns the generated
 * docElements array (without writing to disk).
 */
async function docxElements(markdown) {
  const converter = new MarkdownToDocxConverter(null)
  const tokens = converter.md.parse(markdown, { _baseDir: '' })
  converter.docElements = []
  converter.imageCount = 0
  await converter.walkTokens(tokens, '')
  return converter.docElements
}

// ── Test snippets for each PARA type ─────────────────────────────
// Each entry: [PARA type, markdown input, HTML assertion, DOCX style]

const paraTypes = Object.keys(PARA)

const snippets = {
  [PARA.NOTE]: {
    md: 'NOTE: This is important.',
    htmlCheck: (html) => html.includes('class="note"'),
    docxStyle: 'NO',
  },
  [PARA.EDITORS_NOTE]: {
    md: "Editor's Note: Fix this later.",
    htmlCheck: (html) => html.includes('class="editors-note"'),
    docxStyle: 'EN',
  },
  [PARA.EXAMPLE]: {
    md: 'EXAMPLE: An example paragraph.',
    htmlCheck: (html) => html.includes('class="example"'),
    docxStyle: 'EX',
  },
  [PARA.TOC]: {
    md: '{TableOfContent(1-9)}\n\n# Hello\n\n## World',
    htmlCheck: (html) => html.includes('class="toc"') && html.includes('href="#'),
    docxCheck: (elements) => {
      return elements.some(el => JSON.stringify(el).includes('TOC'))
    },
  },
  [PARA.TABLE_CAPTION]: {
    md: 'Table 1: My table\n\n| A | B |\n|---|---|\n| 1 | 2 |',
    htmlCheck: (html) => html.includes('class="table-caption"'),
    docxStyle: 'TH',
  },
  [PARA.FIGURE_CAPTION]: {
    md: '```mermaid\ngraph TD\n```\n\nFigure 1: My diagram',
    htmlCheck: (html) => html.includes('class="figure-caption"'),
    docxStyle: 'TF',
  },
  [PARA.DISPLAY_MATH]: {
    md: '$$E = mc^2$$',
    htmlCheck: (html) => html.includes('katex'),
    docxStyle: 'EQ',
  },
  [PARA.IMAGE]: {
    // Use a non-existent image — md2html still renders <img>, md2docx produces [Image: ...]
    md: '![alt text](nonexistent.png)',
    htmlCheck: (html) => html.includes('<img'),
    docxCheck: (elements) => {
      return elements.some(el => {
        const runs = el.root && el.root[1]
        if (!runs) return false
        // Check for [Image: ...] fallback text
        return JSON.stringify(runs).includes('Image:') || JSON.stringify(runs).includes('ImageRun')
      })
    },
  },
  [PARA.PARAGRAPH]: {
    md: 'Just a regular paragraph.',
    htmlCheck: (html) => html.includes('<p>Just a regular paragraph.'),
    docxStyle: null, // no special style
  },
}

// ── Verify all PARA types have test snippets ─────────────────────

console.log('PARA type coverage')

test('every PARA type has a test snippet', () => {
  const missing = paraTypes.filter(t => !snippets[PARA[t]])
  assert.deepStrictEqual(missing, [], `Missing snippets for: ${missing.join(', ')}`)
})

// ── HTML tests ───────────────────────────────────────────────────

console.log('\nHTML classification')

const htmlProcessor = new Md2Html()

for (const type of paraTypes) {
  const key = PARA[type]
  const snippet = snippets[key]
  test(`${type} is handled`, () => {
    const html = htmlProcessor.renderBody(snippet.md, false)
    assert.ok(snippet.htmlCheck(html), `HTML check failed for ${type}:\n${html}`)
  })
}

// ── DOCX tests ───────────────────────────────────────────────────

console.log('\nDOCX classification')

async function runDocxTests() {
  for (const type of paraTypes) {
    const key = PARA[type]
    const snippet = snippets[key]
    await asyncTest(`${type} is handled`, async () => {
      const elements = await docxElements(snippet.md)
      assert.ok(elements.length > 0, `No elements produced for ${type}`)
      if (snippet.docxStyle !== undefined) {
        const styles = elements.map(getDocxStyle)
        if (snippet.docxStyle === null) {
          // PARAGRAPH: should have no special style
          assert.ok(styles.includes(null), `Expected unstyled paragraph for ${type}, got: ${styles}`)
        } else {
          assert.ok(styles.includes(snippet.docxStyle), `Expected style '${snippet.docxStyle}' for ${type}, got: ${styles}`)
        }
      } else if (snippet.docxCheck) {
        assert.ok(snippet.docxCheck(elements), `DOCX check failed for ${type}`)
      }
    })
  }
}

runDocxTests().then(async () => {
  // ── EXAMPLE colon-space → tab replacement ──────────────────────

  console.log('\nEXAMPLE colon-tab replacement')

  await asyncTest('EXAMPLE 3: replaces ": " with ":\\t" in DOCX', async () => {
    const elements = await docxElements('EXAMPLE 3: This is an example')
    const json = JSON.stringify(elements)
    assert.ok(json.includes('EXAMPLE 3:\\tThis'), `Expected tab after colon in DOCX output`)
    assert.ok(!json.includes('EXAMPLE 3: This'), `Should not contain ": " (colon-space)`)
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
})
