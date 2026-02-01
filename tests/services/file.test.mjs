import { test } from 'node:test';
import assert from 'node:assert';
import { concatenateFiles } from '../src/services/file.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesPath = join(__dirname, 'fixtures');

test('concatenateFiles - returns buffer', async () => {
	const result = await concatenateFiles(fixturesPath);
	assert.ok(Buffer.isBuffer(result));
	assert.ok(result.length > 0);
});

test('concatenateFiles - includes markdown content', async () => {
	const result = await concatenateFiles(fixturesPath);
	const content = result.toString();
	assert.ok(content.includes('Test Specification'));
});

test('concatenateFiles - wraps ASN.1 in code blocks', async () => {
	const result = await concatenateFiles(fixturesPath);
	const content = result.toString();
	assert.ok(content.includes('```'));
	assert.ok(content.includes('TestModule'));
});
