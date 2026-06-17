#!/usr/bin/env node
// normalize-ran4.js — CLI wrapper for RAN4 Band Combination normalization
//
// Usage: specpress-normalize-ran4 <path-to-BC-json-file>

import { normalizeBC } from '../../dist/lib/ran4/NormalizeBC.js'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: specpress-normalize-ran4 <path-to-BC-json-file>')
  process.exit(1)
}

try {
  const absPath = normalizeBC(filePath)
  console.log(`Normalized: ${absPath}`)
} catch (e) {
  console.error(`Error: '${filePath}' is not a valid BandCombination JSON file.\n  ${e.message}`)
  process.exit(1)
}
