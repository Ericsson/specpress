const assert = require('assert')
const { latexToMathML, latexToDocxMath, createEquationParagraph, addEquationToDocOptions } = require('../../../../lib/md2docx/handlers/latexEquationHandler')

let passed = 0
let failed = 0

async function test(name, fn) {
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

async function run() {

  console.log('latexToMathML')

  await test('returns a MathML string with <math> element', () => {
    const result = latexToMathML('x')
    assert.ok(result.startsWith('<math'))
    assert.ok(result.endsWith('</math>'))
  })

  await test('contains the rendered variable', () => {
    const result = latexToMathML('x')
    assert.ok(result.includes('<mi>x</mi>'))
  })

  await test('renders a fraction', () => {
    const result = latexToMathML('\\frac{a}{b}')
    assert.ok(result.includes('<mfrac>'))
    assert.ok(result.includes('<mi>a</mi>'))
    assert.ok(result.includes('<mi>b</mi>'))
  })

  await test('strips <semantics> wrapper', () => {
    const result = latexToMathML('x')
    assert.ok(!result.includes('<semantics>'))
    assert.ok(!result.includes('</semantics>'))
  })

  await test('strips <annotation> tag', () => {
    const result = latexToMathML('x')
    assert.ok(!result.includes('<annotation'))
  })

  await test('sets display="block" in display mode', () => {
    const result = latexToMathML('x', true)
    assert.ok(result.includes('display="block"'))
  })

  await test('does not set display="block" in inline mode', () => {
    const result = latexToMathML('x', false)
    assert.ok(!result.includes('display="block"'))
  })

  await test('throws on invalid LaTeX', () => {
    assert.throws(() => latexToMathML('\\invalidcommand'))
  })

  await test('handles less-than symbol', () => {
    const result = latexToMathML('x < 0')
    assert.ok(result.includes('&lt;') || result.includes('<mo>&lt;</mo>'))
  })

  console.log('\nlatexToDocxMath')

  await test('returns a component with rootKey m:oMath', async () => {
    const comp = await latexToDocxMath('x')
    assert.strictEqual(comp.rootKey, 'm:oMath')
  })

  await test('does not have xmlns attrs in root', async () => {
    const comp = await latexToDocxMath('x')
    const hasAttr = comp.root.some(c => c.rootKey === '_attr')
    assert.ok(!hasAttr)
  })

  await test('renders fraction as m:f element', async () => {
    const comp = await latexToDocxMath('\\frac{a}{b}')
    const hasFraction = comp.root.some(c => c.rootKey === 'm:f')
    assert.ok(hasFraction)
  })

  await test('fixes nary with empty m:e (summation)', async () => {
    const comp = await latexToDocxMath('\\sum_{i=0}^{n} x_i^2')
    const nary = comp.root.find(c => c.rootKey === 'm:nary')
    assert.ok(nary, 'm:nary should exist')
    const eChild = nary.root.find(c => c.rootKey === 'm:e')
    assert.ok(eChild, 'm:e should exist')
    assert.ok(eChild.root && eChild.root.length > 0, 'm:e should not be empty')
  })

  await test('fixes nary with empty m:e (integral)', async () => {
    const comp = await latexToDocxMath('\\int_{0}^{\\infty} e^{-x} dx')
    const nary = comp.root.find(c => c.rootKey === 'm:nary')
    assert.ok(nary, 'm:nary should exist')
    const eChild = nary.root.find(c => c.rootKey === 'm:e')
    assert.ok(eChild, 'm:e should exist')
    assert.ok(eChild.root && eChild.root.length > 0, 'm:e should not be empty')
  })

  await test('handles less-than without XML parse error', async () => {
    const comp = await latexToDocxMath('x < 0')
    assert.strictEqual(comp.rootKey, 'm:oMath')
  })

  console.log('\ncreateEquationParagraph')

  await test('returns a Paragraph instance', async () => {
    const para = await createEquationParagraph('x')
    assert.ok(para.root && Array.isArray(para.root), 'should have root array (Paragraph)')
  })

  await test('paragraph contains m:oMath child', async () => {
    const para = await createEquationParagraph('x')
    const hasMath = para.root.some(c => c.rootKey === 'm:oMath')
    assert.ok(hasMath)
  })

  await test('display mode sets center alignment', async () => {
    const para = await createEquationParagraph('x', true)
    const pPr = para.root.find(c => c.rootKey === 'w:pPr')
    assert.ok(pPr, 'should have paragraph properties')
    const jc = pPr.root.find(c => c.rootKey === 'w:jc')
    assert.ok(jc, 'should have justification element')
  })

  await test('inline mode does not set center alignment', async () => {
    const para = await createEquationParagraph('x', false)
    const pPr = para.root.find(c => c.rootKey === 'w:pPr')
    if (pPr) {
      const jc = pPr.root.find(c => c.rootKey === 'w:jc')
      assert.ok(!jc, 'should not have justification element')
    }
  })

  console.log('\naddEquationToDocOptions')

  await test('appends a paragraph to the last section', async () => {
    const docOptions = { sections: [{ children: [] }] }
    await addEquationToDocOptions(docOptions, 'x')
    assert.strictEqual(docOptions.sections[0].children.length, 1)
    assert.ok(docOptions.sections[0].children[0].root && Array.isArray(docOptions.sections[0].children[0].root), 'should be a Paragraph')
  })

  await test('appends to the last section when multiple exist', async () => {
    const docOptions = { sections: [{ children: ['placeholder'] }, { children: [] }] }
    await addEquationToDocOptions(docOptions, 'x')
    assert.strictEqual(docOptions.sections[0].children.length, 1)
    assert.strictEqual(docOptions.sections[1].children.length, 1)
  })

  await test('display mode paragraph is centered', async () => {
    const docOptions = { sections: [{ children: [] }] }
    await addEquationToDocOptions(docOptions, 'x', true)
    const para = docOptions.sections[0].children[0]
    const pPr = para.root.find(c => c.rootKey === 'w:pPr')
    assert.ok(pPr, 'should have paragraph properties')
    const jc = pPr.root.find(c => c.rootKey === 'w:jc')
    assert.ok(jc, 'should have justification element')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

run()

