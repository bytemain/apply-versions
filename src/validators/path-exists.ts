// Path exists validator

import { access } from 'node:fs/promises';
import { ValidationHandler } from './base-validator.js';
import type { PackageConfig, ValidationResult } from '../types/index.js';

export class PathExistsValidator extends ValidationHandler {
	protected async doValidate(config: PackageConfig): Promise<ValidationResult> {
		try {
			await access(config.path);
			return { valid: true };
		} catch {
			return {
				valid: false,
				error: `Path does not exist: ${config.path}`,
			};
		}
	}
}
