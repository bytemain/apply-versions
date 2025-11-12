// Package updater factory tests

import { describe, expect, it } from 'vitest';
import { PackageUpdaterFactory } from '../../src/updaters/factory.js';
import { GoPackageUpdater } from '../../src/updaters/go-updater.js';
import { NpmPackageUpdater } from '../../src/updaters/npm-updater.js';
import { RustPackageUpdater } from '../../src/updaters/rust-updater.js';

describe('PackageUpdaterFactory', () => {
  it('should return npm updater for npm type', () => {
    const updater = PackageUpdaterFactory.getUpdater('npm');
    expect(updater).toBeInstanceOf(NpmPackageUpdater);
    expect(updater.type).toBe('npm');
  });

  it('should return go updater for go type', () => {
    const updater = PackageUpdaterFactory.getUpdater('go');
    expect(updater).toBeInstanceOf(GoPackageUpdater);
    expect(updater.type).toBe('go');
  });

  it('should return cargo updater for cargo type', () => {
    const updater = PackageUpdaterFactory.getUpdater('cargo');
    expect(updater).toBeInstanceOf(RustPackageUpdater);
    expect(updater.type).toBe('cargo');
  });

  it('should throw error for unknown package type', () => {
    expect(() => PackageUpdaterFactory.getUpdater('python' as any)).toThrow(
      'Unknown package type: python. Valid types are: npm, go, cargo',
    );
  });

  it('should return supported types', () => {
    const types = PackageUpdaterFactory.getSupportedTypes();
    expect(types).toEqual(['npm', 'go', 'cargo']);
  });

  it('should return same instance for same type (singleton pattern)', () => {
    const updater1 = PackageUpdaterFactory.getUpdater('npm');
    const updater2 = PackageUpdaterFactory.getUpdater('npm');
    expect(updater1).toBe(updater2);
  });

  it('should return different instances for different types', () => {
    const npmUpdater = PackageUpdaterFactory.getUpdater('npm');
    const goUpdater = PackageUpdaterFactory.getUpdater('go');
    expect(npmUpdater).not.toBe(goUpdater);
  });
});
