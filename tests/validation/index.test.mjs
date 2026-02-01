import { test } from 'node:test';
import assert from 'node:assert';
import { validatePath, validateExportType, validateExportTool } from '../src/validation/index.mjs';
import { ValidationError } from '../src/errors/index.mjs';

test('validatePath - accepts valid string', () => {
	assert.strictEqual(validatePath('/valid/path'), '/valid/path');
});

test('validatePath - rejects null', () => {
	assert.throws(() => validatePath(null), ValidationError);
});

test('validatePath - rejects empty string', () => {
	assert.throws(() => validatePath(''), ValidationError);
});

test('validatePath - rejects non-string', () => {
	assert.throws(() => validatePath(123), ValidationError);
});

test('validateExportType - accepts pdf', () => {
	assert.strictEqual(validateExportType('pdf'), 'pdf');
});

test('validateExportType - accepts docx', () => {
	assert.strictEqual(validateExportType('docx'), 'docx');
});

test('validateExportType - accepts html', () => {
	assert.strictEqual(validateExportType('html'), 'html');
});

test('validateExportType - rejects invalid type', () => {
	assert.throws(() => validateExportType('txt'), ValidationError);
});

test('validateExportTool - accepts remark', () => {
	assert.strictEqual(validateExportTool('remark'), 'remark');
});

test('validateExportTool - accepts pandoc', () => {
	assert.strictEqual(validateExportTool('pandoc'), 'pandoc');
});

test('validateExportTool - rejects invalid tool', () => {
	assert.throws(() => validateExportTool('invalid'), ValidationError);
});
