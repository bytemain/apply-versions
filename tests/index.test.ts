// Library entry point tests

import { describe, it, expect } from 'vitest';
import * as lib from '../src/index.js';

describe('Library exports', () => {
	it('should export main components', () => {
		expect(lib.PackageProcessor).toBeDefined();
		expect(lib.ConfigParser).toBeDefined();
		expect(lib.GitOperations).toBeDefined();
		expect(lib.ConsoleProgressObserver).toBeDefined();
		expect(lib.PackageUpdaterFactory).toBeDefined();
	});

	it('should export updater classes', () => {
		expect(lib.NpmPackageUpdater).toBeDefined();
		expect(lib.GoPackageUpdater).toBeDefined();
		expect(lib.RustPackageUpdater).toBeDefined();
	});

	it('should export validator classes', () => {
		expect(lib.RequiredFieldsValidator).toBeDefined();
		expect(lib.PackageTypeValidator).toBeDefined();
		expect(lib.VersionFormatValidator).toBeDefined();
		expect(lib.PathExistsValidator).toBeDefined();
		expect(lib.createValidationChain).toBeDefined();
	});

	it('should export repository classes', () => {
		expect(lib.LocalFileRepository).toBeDefined();
	});

	it('should export type definitions', () => {
		// Types are exported at compile time, we can't test them at runtime
		// But we can verify the module loads without errors
		expect(typeof lib).toBe('object');
	});
});
