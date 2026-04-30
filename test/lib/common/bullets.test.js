const assert = require('assert')
const { parseBullet, VALID_BULLETS, DEFAULT_BULLET } = require('../../../lib/common/bullets')

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

console.log('parseBullet')

test('dash bullet', () => {
  const { bullet, rest } = parseBullet('- some text')
  assert.strictEqual(bullet, '-')
  assert.strictEqual(rest, 'some text')
})

test('arrow bullet 1>', () => {
  const { bullet, rest } = parseBullet('1> first level')
  assert.strictEqual(bullet, '1>')
  assert.strictEqual(rest, 'first level')
})

test('arrow bullet 2>', () => {
  const { bullet, rest } = parseBullet('2> second level')
  assert.strictEqual(bullet, '2>')
  assert.strictEqual(rest, 'second level')
})

test('arrow bullet 9>', () => {
  const { bullet, rest } = parseBullet('9> ninth level')
  assert.strictEqual(bullet, '9>')
  assert.strictEqual(rest, 'ninth level')
})

test('plain number bullet 1', () => {
  const { bullet, rest } = parseBullet('1 numbered item')
  assert.strictEqual(bullet, '1')
  assert.strictEqual(rest, 'numbered item')
})

test('bracket number [1]', () => {
  const { bullet, rest } = parseBullet('[1] first bracket')
  assert.strictEqual(bullet, '[1]')
  assert.strictEqual(rest, 'first bracket')
})

test('bracket number [42]', () => {
  const { bullet, rest } = parseBullet('[42] forty-second')
  assert.strictEqual(bullet, '[42]')
  assert.strictEqual(rest, 'forty-second')
})

test('bracket number [99]', () => {
  const { bullet, rest } = parseBullet('[99] last bracket')
  assert.strictEqual(bullet, '[99]')
  assert.strictEqual(rest, 'last bracket')
})

test('o bullet', () => {
  const { bullet, rest } = parseBullet('o circle bullet')
  assert.strictEqual(bullet, 'o')
  assert.strictEqual(rest, 'circle bullet')
})

test('> bullet', () => {
  const { bullet, rest } = parseBullet('> arrow bullet')
  assert.strictEqual(bullet, '>')
  assert.strictEqual(rest, 'arrow bullet')
})

test('unrecognized bullet falls back to default', () => {
  const { bullet, rest } = parseBullet('** bold start')
  assert.strictEqual(bullet, DEFAULT_BULLET)
  assert.strictEqual(rest, '** bold start')
})

test('no space in text falls back to default', () => {
  const { bullet, rest } = parseBullet('singleword')
  assert.strictEqual(bullet, DEFAULT_BULLET)
  assert.strictEqual(rest, 'singleword')
})

test('empty string falls back to default', () => {
  const { bullet, rest } = parseBullet('')
  assert.strictEqual(bullet, DEFAULT_BULLET)
  assert.strictEqual(rest, '')
})

test('[100] is not a valid bracket bullet', () => {
  const { bullet, rest } = parseBullet('[100] too high')
  assert.strictEqual(bullet, DEFAULT_BULLET)
  assert.strictEqual(rest, '[100] too high')
})

console.log('\nVALID_BULLETS')

test('contains dash', () => {
  assert.ok(VALID_BULLETS.includes('-'))
})

test('contains arrow bullets 1> through 9>', () => {
  for (let i = 1; i <= 9; i++) {
    assert.ok(VALID_BULLETS.includes(`${i}>`), `should contain ${i}>`)
  }
})

test('contains bracket numbers [1] through [99]', () => {
  assert.ok(VALID_BULLETS.includes('[1]'))
  assert.ok(VALID_BULLETS.includes('[50]'))
  assert.ok(VALID_BULLETS.includes('[99]'))
})

test('does not contain [0] or [100]', () => {
  assert.ok(!VALID_BULLETS.includes('[0]'))
  assert.ok(!VALID_BULLETS.includes('[100]'))
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
