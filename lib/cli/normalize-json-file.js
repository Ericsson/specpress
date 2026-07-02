#!/usr/bin/env node
// normalize-json-file.js — CLI wrapper for RAN4 JSON file normalization
//
// Usage: specpress-normalize-json-file <path-to-json-file>

import { normalizeJsonFile } from '../../dist/lib/ran4/Utils.js'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: specpress-normalize-json-file <path-to-json-file>')
  process.exit(1)
}

try {
  const absPath = await normalizeJsonFile(filePath)
  console.log(`Normalized: ${absPath}`)
} catch (e) {
  console.error(`Error: '${filePath}' is not a valid RAN4 JSON file.\n  ${e.message}`)
  process.exit(1)
}
