// Package type validator

import type { PackageConfig, ValidationResult } from '../types/index.js';
import type { PackageType } from '../types/package.js';
import { ValidationHandler } from './base-validator.js';

export class PackageTypeValidator extends ValidationHandler {
  private static readonly validTypes: PackageType[] = ['npm', 'go', 'cargo'];

  protected async doValidate(config: PackageConfig): Promise<ValidationResult> {
    if (!PackageTypeValidator.validTypes.includes(config.type)) {
      return {
        valid: false,
        error: `Invalid package type '${config.type}' for package at path '${config.path}'. Valid types are: ${PackageTypeValidator.validTypes.join(', ')}`,
      };
    }
    return { valid: true };
  }

  static getSupportedTypes(): PackageType[] {
    return [...PackageTypeValidator.validTypes];
  }
}
