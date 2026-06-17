#!/usr/bin/env node
// validate-ran4.js — CLI wrapper for RAN4 JSON validation
//
// Usage: specpress-validate-ran4 [--skip-validation] [--skip-schema] [--no-abort] [--output <file>] <rootFolder>

import { resolve } from 'node:path'
import { loadAndValidateAll, EXIT_CONTENT_ERROR, EXIT_SCHEMA_ERROR } from '../../dist/lib/ran4/ValidateData.js'
import { logger } from '../../dist/lib/ran4/Logger.js'

const args = process.argv.slice(2)
const skipValidation = args.includes('--skip-validation')
const skipSchema = args.includes('--skip-schema')
const noAbort = args.includes('--no-abort')
const outputIdx = args.indexOf('--output')
const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : null
const rootFolder = args.find((a, i) => !a.startsWith('--') && (outputIdx < 0 || i !== outputIdx + 1))

if (!rootFolder) {
  console.error('Usage: specpress-validate-ran4 [--skip-validation] [--skip-schema] [--no-abort] [--output <file>] <rootFolder>')
  process.exit(1)
}

if (outputFile) await logger.openFile(outputFile)

process.on('uncaughtException', (e) => {
  const msg = `${e.name}: ${e.message}`
  const code = e.name === 'SchemaValidationException' ? EXIT_SCHEMA_ERROR : EXIT_CONTENT_ERROR
  logger.log(msg)
  logger.close().then((path) => {
    if (path) {
      console.error(msg)
      console.log(`ValidateData: Output written to '${path}'.`)
    }
    process.exit(code)
  })
})

logger.log(`ValidateData: rootFolder = '${resolve(rootFolder)}'`)
const { exitCode } = loadAndValidateAll(rootFolder, skipValidation, skipSchema, !noAbort)
const schemaStatus = skipSchema ? 'skipped' : 'done'
const validationStatus = skipValidation ? 'skipped' : 'done'
logger.log(`ValidateData: All data loaded. Schema validation: ${schemaStatus}. Content validation: ${validationStatus}. Exit code: ${exitCode}.`)

await logger.close().then((path) => {
  if (path) console.log(`ValidateData: Output written to '${path}'.`)
  process.exit(exitCode)
})
