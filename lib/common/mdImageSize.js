'use strict'

/**
 * markdown-it plugin: GitLab-style image size attributes.
 *
 * Parses a trailing curly-brace block directly after an image and copies the
 * `width` / `height` values onto the image token as attributes:
 *
 *   ![alt](image.png){width=300}            → <img ... width="300">
 *   ![alt](image.png){width=300 height=200} → <img ... width="300" height="200">
 *   ![alt](image.png){width=50%}            → <img ... width="50%">
 *   ![alt](image.png){width=300px}          → <img ... width="300"> (px suffix stripped)
 *
 * Unlike the `=WxH` syntax (markdown-it-imsize) the image link itself stays a
 * plain `![alt](path)`, so editors such as VS Code keep recognizing the path
 * (rename/refactor, go-to-file, broken-link detection all continue to work).
 *
 * The block must directly follow the image (no whitespace in between), matching
 * GitLab's behavior. Only `width` and `height` are consumed; any other keys in
 * the block are ignored and the whole block is stripped from the rendered text.
 */

// Leading curly-brace block, e.g. "{width=300 height=200}" at the start of a text token.
const ATTR_BLOCK_RE = /^\{([^{}]*)\}/
// key=value pairs inside the block; value stops at whitespace or closing brace.
const PAIR_RE = /([A-Za-z_-]+)\s*=\s*([^\s}]+)/g

/**
 * Extracts width/height from the inner text of a `{...}` block.
 * @param {string} inner - Text between the braces (without the braces).
 * @returns {{width?: string, height?: string}}
 */
function parseSizeAttrs(inner) {
  const attrs = {}
  let m
  PAIR_RE.lastIndex = 0
  while ((m = PAIR_RE.exec(inner)) !== null) {
    const key = m[1].toLowerCase()
    if (key !== 'width' && key !== 'height') continue
    let value = m[2]
    // Normalize a trailing "px" unit to a bare pixel count (300px → 300).
    if (/px$/i.test(value)) value = value.slice(0, -2)
    attrs[key] = value
  }
  return attrs
}

/**
 * Core rule: walk inline tokens, apply trailing {width=/height=} blocks to images.
 * @param {import('markdown-it/lib/rules_core/state_core')} state
 */
function applyImageSizeAttrs(state) {
  for (const blockToken of state.tokens) {
    if (blockToken.type !== 'inline' || !blockToken.children) continue
    const children = blockToken.children
    for (let j = 0; j < children.length; j++) {
      if (children[j].type !== 'image') continue
      const next = children[j + 1]
      if (!next || next.type !== 'text') continue
      const match = ATTR_BLOCK_RE.exec(next.content)
      if (!match) continue
      const attrs = parseSizeAttrs(match[1])
      const keys = Object.keys(attrs)
      if (keys.length === 0) continue
      for (const key of keys) children[j].attrSet(key, attrs[key])
      // Remove the consumed "{...}" block from the following text token.
      next.content = next.content.slice(match[0].length)
    }
  }
}

/**
 * @param {import('markdown-it')} md
 */
module.exports = function mdImageSize(md) {
  md.core.ruler.push('specpress_image_size', applyImageSizeAttrs)
}
