// Validators tests

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createValidationChain,
  PackageTypeValidator,
  PathExistsValidator,
  RequiredFieldsValidator,
  VersionFormatValidator,
} from '../../src/validators/index.js';
import { mockPackages } from '../test-utils.js';

describe('RequiredFieldsValidator', () => {
  let validator: RequiredFieldsValidator;

  beforeEach(() => {
    validator = new RequiredFieldsValidator();
  });

  it('should validate package with all required fields', async () => {
    const result = await validator.validate(mockPackages.npm);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject package missing path', async () => {
    const invalidPackage = { ...mockPackages.npm };
    delete (invalidPackage as any).path;

    const result = await validator.validate(invalidPackage as any);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required field 'path'");
  });

  it('should reject package missing name', async () => {
    const invalidPackage = { ...mockPackages.npm };
    delete (invalidPackage as any).name;

    const result = await validator.validate(invalidPackage as any);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required field 'name'");
  });

  it('should reject package missing type', async () => {
    const invalidPackage = { ...mockPackages.npm };
    delete (invalidPackage as any).type;

    const result = await validator.validate(invalidPackage as any);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required field 'type'");
  });

  it('should reject package missing version', async () => {
    const invalidPackage = { ...mockPackages.npm };
    delete (invalidPackage as any).version;

    const result = await validator.validate(invalidPackage as any);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required field 'version'");
  });
});

describe('PackageTypeValidator', () => {
  let validator: PackageTypeValidator;

  beforeEach(() => {
    validator = new PackageTypeValidator();
  });

  it('should validate npm package type', async () => {
    const result = await validator.validate(mockPackages.npm);
    expect(result.valid).toBe(true);
  });

  it('should validate go package type', async () => {
    const result = await validator.validate(mockPackages.go);
    expect(result.valid).toBe(true);
  });

  it('should validate cargo package type', async () => {
    const result = await validator.validate(mockPackages.rust);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid package type', async () => {
    const invalidPackage = { ...mockPackages.npm, type: 'python' as any };
    const result = await validator.validate(invalidPackage);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid package type 'python'");
    expect(result.error).toContain('Valid types are: npm, go, cargo');
  });

  it('should get supported types', () => {
    const types = PackageTypeValidator.getSupportedTypes();
    expect(types).toEqual(['npm', 'go', 'cargo']);
  });
});

describe('VersionFormatValidator', () => {
  let validator: VersionFormatValidator;

  beforeEach(() => {
    validator = new VersionFormatValidator();
  });

  it('should validate semantic versions', async () => {
    const validVersions = [
      '1.0.0',
      '0.1.0',
      '10.20.30',
      '1.0.0-alpha',
      '1.0.0+build',
    ];

    for (const version of validVersions) {
      const pkg = { ...mockPackages.npm, version };
      const result = await validator.validate(pkg);
      expect(result.valid).toBe(true);
    }
  });

  it('should reject invalid version formats', async () => {
    const invalidVersions = [
      '1.0',
      '1',
      '1.0.0.0',
      'v1.0.0',
      '1.0.0-',
      'latest',
      'invalid',
    ];

    for (const version of invalidVersions) {
      const pkg = { ...mockPackages.npm, version };
      const result = await validator.validate(pkg);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid version format');
      expect(result.error).toContain('major.minor.patch');
    }
  });

  it('should validate complex semantic versions', async () => {
    const complexVersions = [
      '1.0.0-alpha.1',
      '1.0.0-beta.2',
      '1.0.0-rc.1',
      '1.0.0+20210101',
      '1.0.0-alpha+build.1',
    ];

    for (const version of complexVersions) {
      const pkg = { ...mockPackages.npm, version };
      const result = await validator.validate(pkg);
      expect(result.valid).toBe(true);
    }
  });
});

describe('PathExistsValidator', () => {
  let validator: PathExistsValidator;
  const testDir = join(process.cwd(), 'test-tmp-validators');

  beforeEach(async () => {
    validator = new PathExistsValidator();
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should validate existing path', async () => {
    const packageDir = join(testDir, 'packages', 'web');
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'package.json'), '{}');

    const pkg = { ...mockPackages.npm, path: packageDir };
    const result = await validator.validate(pkg);
    expect(result.valid).toBe(true);
  });

  it('should reject non-existent path', async () => {
    const pkg = { ...mockPackages.npm, path: join(testDir, 'nonexistent') };
    const result = await validator.validate(pkg);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Path does not exist');
  });
});

describe('Validation Chain', () => {
  const testDir = join(process.cwd(), 'test-tmp-chain');

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should create and run complete validation chain', async () => {
    const packageDir = join(testDir, 'packages', 'web');
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'package.json'), '{}');

    const validator = createValidationChain();
    const pkg = { ...mockPackages.npm, path: packageDir };

    const result = await validator.validate(pkg);
    expect(result.valid).toBe(true);
  });

  it('should fail on first validation error', async () => {
    const validator = createValidationChain();
    const invalidPackage = { ...mockPackages.npm };
    delete (invalidPackage as any).name;

    const result = await validator.validate(invalidPackage as any);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required field 'name'");
  });

  it('should continue to next validator if current passes', async () => {
    const validator = createValidationChain();
    const pkg = { ...mockPackages.npm, type: 'invalid' as any };

    const result = await validator.validate(pkg);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid package type');
  });

  it('should validate through entire chain', async () => {
    const packageDir = join(testDir, 'packages', 'web');
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'package.json'), '{}');

    const validator = createValidationChain();
    const pkg = {
      path: packageDir,
      name: '@myorg/web',
      type: 'npm' as const,
      version: '1.2.3',
    };

    const result = await validator.validate(pkg);
    expect(result.valid).toBe(true);
  });
});
