import { test } from 'node:test';
import assert from 'node:assert';
import { SpecPressError, ValidationError, FileNotFoundError, ConfigError } from '../src/errors/index.mjs';

test('SpecPressError - creates error with code', () => {
	const error = new SpecPressError('Test message', 'TEST_CODE');
	assert.strictEqual(error.message, 'Test message');
	assert.strictEqual(error.code, 'TEST_CODE');
	assert.strictEqual(error.name, 'SpecPressError');
});

test('ValidationError - extends SpecPressError', () => {
	const error = new ValidationError('Invalid input');
	assert.ok(error instanceof SpecPressError);
	assert.strictEqual(error.code, 'VALIDATION_ERROR');
	assert.strictEqual(error.name, 'ValidationError');
});

test('FileNotFoundError - formats message', () => {
	const error = new FileNotFoundError('/path/to/file');
	assert.ok(error.message.includes('/path/to/file'));
	assert.strictEqual(error.code, 'FILE_NOT_FOUND');
});

test('ConfigError - has correct code', () => {
	const error = new ConfigError('Config invalid');
	assert.strictEqual(error.code, 'CONFIG_ERROR');
});
