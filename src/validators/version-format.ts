// Version format validator

import { ValidationHandler } from './base-validator.js';
import type { PackageConfig, ValidationResult } from '../types/index.js';

export class VersionFormatValidator extends ValidationHandler {
	private readonly semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

	protected async doValidate(config: PackageConfig): Promise<ValidationResult> {
		if (!this.semverRegex.test(config.version)) {
			return {
				valid: false,
				error: `Invalid version format '${config.version}' for package '${config.name}'. Version must follow semantic versioning format: major.minor.patch (e.g., 1.2.3)`,
			};
		}
		return { valid: true };
	}
}
