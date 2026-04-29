const katex = require('katex')
const { Paragraph, ImportedXmlComponent, AlignmentType } = require('docx')
const { preprocessLatex } = require('../../common/latexHelpers')

let mml2omml = null

/**
 * Lazily loads the ESM mathml2omml module.
 * @returns {Promise<Function>} The mml2omml conversion function.
 */
async function getMml2omml() {
  if (!mml2omml) {
    const mod = await import('mathml2omml')
    mml2omml = mod.mml2omml
  }
  return mml2omml
}

/**
 * Converts a LaTeX string to a MathML string via KaTeX.
 * Strips the <semantics> wrapper and <annotation> tag to produce clean MathML.
 *
 * @param {string} latex - LaTeX equation string (e.g. '\\frac{a}{b}').
 * @param {boolean} [displayMode=false] - If true, renders as display/block equation.
 * @returns {string} MathML string.
 */
function latexToMathML(latex, displayMode = false) {
  const html = katex.renderToString(preprocessLatex(latex, displayMode), { output: 'mathml', displayMode, throwOnError: true })
  let mathml = html.match(/<math[\s\S]*<\/math>/)[0]
  mathml = mathml.replace(/<semantics>/, '').replace(/<\/semantics>/, '')
  mathml = mathml.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/, '')
  return mathml
}

/**
 * Converts a LaTeX equation string to a docx-compatible XML component.
 *
 * Uses KaTeX to produce MathML, then mathml2omml to convert to OMML,
 * and extracts the m:oMath element as a docx XmlComponent that can be
 * placed inside a Paragraph.
 *
 * @param {string} latex - LaTeX equation string (e.g. '\\frac{a}{b}').
 * @param {boolean} [displayMode=false] - If true, renders as block/display equation.
 * @returns {Promise<XmlComponent>} A docx XML component representing the equation.
 */
async function latexToDocxMath(latex, displayMode = false) {
  const convert = await getMml2omml()
  const mathml = latexToMathML(latex, displayMode)
  const omml = convert(mathml, { disableDecode: true })
  const imported = ImportedXmlComponent.fromXmlString(omml)
  const mathComponent = imported.root[0]
  // Strip redundant xmlns attrs — the document root already declares them
  if (mathComponent.root && mathComponent.root[0] && mathComponent.root[0].rootKey === '_attr') {
    mathComponent.root.shift()
  }
  fixNaryElements(mathComponent)
  return mathComponent
}

/**
 * Fixes m:nary elements where mathml2omml leaves the body (m:e) empty
 * and places the operand as a sibling instead. Moves trailing siblings
 * into the empty m:e so Word renders the equation correctly.
 *
 * @param {Object} node - A docx XmlComponent tree node.
 */
function fixNaryElements(node) {
  if (!node.root || !Array.isArray(node.root)) return
  for (let i = 0; i < node.root.length; i++) {
    const child = node.root[i]
    if (typeof child === 'string') continue
    if (child.rootKey === 'm:nary') {
      const eChild = child.root.find(c => c.rootKey === 'm:e')
      if (eChild && (!eChild.root || eChild.root.length === 0)) {
        eChild.root = node.root.splice(i + 1)
      }
    }
    fixNaryElements(child)
  }
}

/**
 * Creates a docx Paragraph containing a native equation.
 *
 * Display-mode equations are centered. Inline equations use default alignment.
 *
 * @param {string} latex - LaTeX equation string.
 * @param {boolean} [displayMode=false] - If true, renders as centered block equation.
 * @returns {Promise<Paragraph>} A docx Paragraph containing the equation.
 */
async function createEquationParagraph(latex, displayMode = false) {
  const mathComponent = await latexToDocxMath(latex, displayMode)
  const opts = { children: [mathComponent] }
  if (displayMode) opts.alignment = AlignmentType.CENTER
  return new Paragraph(opts)
}

/**
 * Appends a native LaTeX equation to the last section of a docx Document
 * options object (the object passed to `new Document()`).
 *
 * @param {Object} docOptions - The options object used to construct a docx Document.
 *   Must have a `sections` array with at least one section containing a `children` array.
 * @param {string} latex - LaTeX equation string.
 * @param {boolean} [displayMode=false] - If true, renders as centered block equation.
 * @returns {Promise<void>}
 */
async function addEquationToDocOptions(docOptions, latex, displayMode = false) {
  const paragraph = await createEquationParagraph(latex, displayMode)
  const lastSection = docOptions.sections[docOptions.sections.length - 1]
  lastSection.children.push(paragraph)
}

module.exports = { latexToMathML, latexToDocxMath, createEquationParagraph, addEquationToDocOptions }
