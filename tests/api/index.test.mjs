import { test } from 'node:test';
import assert from 'node:assert';
import { exportWorkingFolder, publishHtmlToPublicFolder } from '../src/api/index-final.mjs';
import { ValidationError } from '../src/errors/index.mjs';

test('exportWorkingFolder - validates pathWorkingFolder', async () => {
	await assert.rejects(
		() => exportWorkingFolder(null, './output'),
		{ name: 'ValidationError' }
	);
});

test('exportWorkingFolder - validates pathExportFolder', async () => {
	await assert.rejects(
		() => exportWorkingFolder('./src', null),
		{ name: 'ValidationError' }
	);
});

test('exportWorkingFolder - validates exportType', async () => {
	await assert.rejects(
		() => exportWorkingFolder('./src', './output', 'invalid'),
		{ name: 'ValidationError' }
	);
});

test('exportWorkingFolder - validates exportTool', async () => {
	await assert.rejects(
		() => exportWorkingFolder('./src', './output', 'pdf', 'invalid'),
		{ name: 'ValidationError' }
	);
});

test('publishHtmlToPublicFolder - validates pathWorkingFolder', async () => {
	await assert.rejects(
		() => publishHtmlToPublicFolder('', './public'),
		{ name: 'ValidationError' }
	);
});

test('publishHtmlToPublicFolder - validates pathPublicFolder', async () => {
	await assert.rejects(
		() => publishHtmlToPublicFolder('./src', 123),
		{ name: 'ValidationError' }
	);
});
