/**
 * Valid bullet symbols for unordered lists in 3GPP-style markdown.
 *
 * When a list item's text begins with one of these strings followed by a
 * space, the string is treated as the bullet character and separated from
 * the remaining text. Otherwise DEFAULT_BULLET is used.
 */
const VALID_BULLETS = ['-', '>', 'o', '0',
  ...Array.from({ length: 9 }, (_, i) => `${i + 1}>`),
  ...Array.from({ length: 9 }, (_, i) => `${i + 1}`),
  ...Array.from({ length: 99 }, (_, i) => `[${i + 1}]`)]

const DEFAULT_BULLET = '-'

/**
 * Extracts the bullet symbol from the beginning of a list item's text.
 *
 * If the text starts with a VALID_BULLETS entry followed by a space, returns
 * that bullet and the remaining text after the space. Otherwise returns
 * DEFAULT_BULLET and the original text unchanged.
 *
 * @param {string} text - The full text content of the list item.
 * @returns {{ bullet: string, rest: string }}
 */
function parseBullet(text) {
  const spaceIndex = text.indexOf(' ')
  if (spaceIndex > 0) {
    const candidate = text.substring(0, spaceIndex)
    if (VALID_BULLETS.includes(candidate)) {
      return { bullet: candidate, rest: text.substring(spaceIndex + 1) }
    }
  }
  return { bullet: DEFAULT_BULLET, rest: text }
}

module.exports = { VALID_BULLETS, DEFAULT_BULLET, parseBullet }
