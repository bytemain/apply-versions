// Base validation handler (Chain of Responsibility pattern)

import type { PackageConfig, ValidationResult } from '../types/index.js';

export abstract class ValidationHandler {
  protected next?: ValidationHandler;

  setNext(handler: ValidationHandler): ValidationHandler {
    this.next = handler;
    return handler;
  }

  async validate(config: PackageConfig): Promise<ValidationResult> {
    const result = await this.doValidate(config);
    if (!result.valid || !this.next) {
      return result;
    }
    return this.next.validate(config);
  }

  protected abstract doValidate(
    config: PackageConfig,
  ): Promise<ValidationResult>;
}
