// Validator factory and setup

import type { ValidationHandler } from './base-validator.js';
import { PackageTypeValidator } from './package-type.js';
import { PathExistsValidator } from './path-exists.js';
import { RequiredFieldsValidator } from './required-fields.js';
import { VersionFormatValidator } from './version-format.js';

export function createValidationChain(): ValidationHandler {
  const validator = new RequiredFieldsValidator();
  validator
    .setNext(new PackageTypeValidator())
    .setNext(new VersionFormatValidator())
    .setNext(new PathExistsValidator());
  return validator;
}

export * from './base-validator.js';
export * from './package-type.js';
export * from './path-exists.js';
export * from './required-fields.js';
export * from './version-format.js';
