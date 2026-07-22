const { test, describe } = require('node:test')
const assert = require('assert')
const { latexToMathML, latexToDocxMath, createEquationParagraph, addEquationToDocOptions } = require('../../../../lib/md2docx/handlers/latexEquationHandler')

describe('latexToMathML', () => {

  test('returns a MathML string with <math> element', () => {
    const result = latexToMathML('x')
    assert.ok(result.startsWith('<math'))
    assert.ok(result.endsWith('</math>'))
  })

  test('contains the rendered variable', () => {
    const result = latexToMathML('x')
    assert.ok(result.includes('<mi>x</mi>'))
  })

  test('renders a fraction', () => {
    const result = latexToMathML('\\frac{a}{b}')
    assert.ok(result.includes('<mfrac>'))
    assert.ok(result.includes('<mi>a</mi>'))
    assert.ok(result.includes('<mi>b</mi>'))
  })

  test('strips <semantics> wrapper', () => {
    const result = latexToMathML('x')
    assert.ok(!result.includes('<semantics>'))
    assert.ok(!result.includes('</semantics>'))
  })

  test('strips <annotation> tag', () => {
    const result = latexToMathML('x')
    assert.ok(!result.includes('<annotation'))
  })

  test('sets display="block" in display mode', () => {
    const result = latexToMathML('x', true)
    assert.ok(result.includes('display="block"'))
  })

  test('does not set display="block" in inline mode', () => {
    const result = latexToMathML('x', false)
    assert.ok(!result.includes('display="block"'))
  })

  test('throws on invalid LaTeX', () => {
    assert.throws(() => latexToMathML('\\invalidcommand'))
  })

  test('handles less-than symbol', () => {
    const result = latexToMathML('x < 0')
    assert.ok(result.includes('&lt;') || result.includes('<mo>&lt;</mo>'))
  })

})
describe('latexToDocxMath', () => {

  test('returns a component with rootKey m:oMath', async () => {
    const comp = await latexToDocxMath('x')
    assert.strictEqual(comp.rootKey, 'm:oMath')
  })

  test('does not have xmlns attrs in root', async () => {
    const comp = await latexToDocxMath('x')
    const hasAttr = comp.root.some(c => c.rootKey === '_attr')
    assert.ok(!hasAttr)
  })

  test('renders fraction as m:f element', async () => {
    const comp = await latexToDocxMath('\\frac{a}{b}')
    const hasFraction = comp.root.some(c => c.rootKey === 'm:f')
    assert.ok(hasFraction)
  })

  test('fixes nary with empty m:e (summation)', async () => {
    const comp = await latexToDocxMath('\\sum_{i=0}^{n} x_i^2')
    const nary = comp.root.find(c => c.rootKey === 'm:nary')
    assert.ok(nary, 'm:nary should exist')
    const eChild = nary.root.find(c => c.rootKey === 'm:e')
    assert.ok(eChild, 'm:e should exist')
    assert.ok(eChild.root && eChild.root.length > 0, 'm:e should not be empty')
  })

  test('fixes nary with empty m:e (integral)', async () => {
    const comp = await latexToDocxMath('\\int_{0}^{\\infty} e^{-x} dx')
    const nary = comp.root.find(c => c.rootKey === 'm:nary')
    assert.ok(nary, 'm:nary should exist')
    const eChild = nary.root.find(c => c.rootKey === 'm:e')
    assert.ok(eChild, 'm:e should exist')
    assert.ok(eChild.root && eChild.root.length > 0, 'm:e should not be empty')
  })

  test('handles less-than without XML parse error', async () => {
    const comp = await latexToDocxMath('x < 0')
    assert.strictEqual(comp.rootKey, 'm:oMath')
  })

})
describe('createEquationParagraph', () => {

  test('returns a Paragraph instance', async () => {
    const para = await createEquationParagraph('x')
    assert.ok(para.root && Array.isArray(para.root), 'should have root array (Paragraph)')
  })

  test('paragraph contains m:oMath child', async () => {
    const para = await createEquationParagraph('x')
    const hasMath = para.root.some(c => c.rootKey === 'm:oMath')
    assert.ok(hasMath)
  })

  test('display mode sets center alignment', async () => {
    const para = await createEquationParagraph('x', true)
    const pPr = para.root.find(c => c.rootKey === 'w:pPr')
    assert.ok(pPr, 'should have paragraph properties')
    const jc = pPr.root.find(c => c.rootKey === 'w:jc')
    assert.ok(jc, 'should have justification element')
  })

  test('inline mode does not set center alignment', async () => {
    const para = await createEquationParagraph('x', false)
    const pPr = para.root.find(c => c.rootKey === 'w:pPr')
    if (pPr) {
      const jc = pPr.root.find(c => c.rootKey === 'w:jc')
      assert.ok(!jc, 'should not have justification element')
    }
  })

})
describe('addEquationToDocOptions', () => {

  test('appends a paragraph to the last section', async () => {
    const docOptions = { sections: [{ children: [] }] }
    await addEquationToDocOptions(docOptions, 'x')
    assert.strictEqual(docOptions.sections[0].children.length, 1)
    assert.ok(docOptions.sections[0].children[0].root && Array.isArray(docOptions.sections[0].children[0].root), 'should be a Paragraph')
  })

  test('appends to the last section when multiple exist', async () => {
    const docOptions = { sections: [{ children: ['placeholder'] }, { children: [] }] }
    await addEquationToDocOptions(docOptions, 'x')
    assert.strictEqual(docOptions.sections[0].children.length, 1)
    assert.strictEqual(docOptions.sections[1].children.length, 1)
  })

  test('display mode paragraph is centered', async () => {
    const docOptions = { sections: [{ children: [] }] }
    await addEquationToDocOptions(docOptions, 'x', true)
    const para = docOptions.sections[0].children[0]
    const pPr = para.root.find(c => c.rootKey === 'w:pPr')
    assert.ok(pPr, 'should have paragraph properties')
    const jc = pPr.root.find(c => c.rootKey === 'w:jc')
    assert.ok(jc, 'should have justification element')
  })


})