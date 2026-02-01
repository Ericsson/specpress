export class SpecPressError extends Error {
	constructor(message, code) {
		super(message);
		this.name = 'SpecPressError';
		this.code = code;
	}
}

export class ValidationError extends SpecPressError {
	constructor(message) {
		super(message, 'VALIDATION_ERROR');
		this.name = 'ValidationError';
	}
}

export class FileNotFoundError extends SpecPressError {
	constructor(path) {
		super(`File not found: ${path}`, 'FILE_NOT_FOUND');
		this.name = 'FileNotFoundError';
	}
}

export class ConfigError extends SpecPressError {
	constructor(message) {
		super(message, 'CONFIG_ERROR');
		this.name = 'ConfigError';
	}
}
