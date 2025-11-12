// Required fields validator

import type { PackageConfig, ValidationResult } from '../types/index.js';
import { ValidationHandler } from './base-validator.js';

export class RequiredFieldsValidator extends ValidationHandler {
  protected async doValidate(config: PackageConfig): Promise<ValidationResult> {
    const required = ['path', 'name', 'type', 'version'];
    for (const field of required) {
      if (!config[field as keyof PackageConfig]) {
        return {
          valid: false,
          error: `Missing required field '${field}' for package at path '${config.path || 'unknown'}'`,
        };
      }
    }
    return { valid: true };
  }
}
