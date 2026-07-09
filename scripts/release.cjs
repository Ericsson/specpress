#!/usr/bin/env node
/**
 * Release script for specpress.
 *
 * Pre-flight checks:
 *   - Must be on the main branch
 *   - No uncommitted changes
 *   - Local main is up to date with remote
 *
 * Then: npm version patch, git push, git push --tags
 */
const { execSync } = require('child_process')

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function fail(msg) {
  console.error('Release aborted: ' + msg)
  process.exit(1)
}

// Check we're on main
const branch = run('git rev-parse --abbrev-ref HEAD')
if (branch !== 'main') {
  fail(`not on main branch (currently on "${branch}")`)
}

// Check no uncommitted changes
const status = run('git status --porcelain')
if (status) {
  fail('there are uncommitted changes:\n' + status)
}

// Fetch latest from remote
console.log('Fetching from remote...')
execSync('git fetch origin', { stdio: 'inherit' })

// Check local is up to date with remote
const local = run('git rev-parse HEAD')
const remote = run('git rev-parse origin/main')
if (local !== remote) {
  const behind = run('git rev-list --count HEAD..origin/main')
  const ahead = run('git rev-list --count origin/main..HEAD')
  if (parseInt(behind) > 0) {
    fail(`local is ${behind} commit(s) behind origin/main. Run: git pull`)
  }
  if (parseInt(ahead) > 0) {
    fail(`local is ${ahead} commit(s) ahead of origin/main. Push first: git push`)
  }
}

// All checks passed - do the release
const arg = process.argv[2] || 'patch'
console.log(`All checks passed. Bumping version (${arg})...`)
execSync(`npm version ${arg}`, { stdio: 'inherit' })
console.log('Pushing to remote...')
execSync('git push', { stdio: 'inherit' })
execSync('git push --tags', { stdio: 'inherit' })
console.log('Done.')
