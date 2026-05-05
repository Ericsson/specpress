import { ValidationError } from '../errors/index.mjs';
import { existsSync } from 'fs';

export function validatePath(path, name = 'path') {
	if (!path || typeof path !== 'string') {
		throw new ValidationError(`${name} must be a non-empty string`);
	}
	return path;
}

export function validatePathExists(path, name = 'path') {
	validatePath(path, name);
	if (!existsSync(path)) {
		throw new ValidationError(`${name} does not exist: ${path}`);
	}
	return path;
}

export function validateExportType(type) {
	const valid = ['docx', 'html'];
	if (!valid.includes(type)) {
		throw new ValidationError(`Invalid export type: ${type}. Valid: ${valid.join(', ')}`);
	}
	return type;
}
