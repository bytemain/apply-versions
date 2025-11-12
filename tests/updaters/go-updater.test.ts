// Go package updater tests

import { describe, it, expect, beforeEach } from 'vitest';
import { GoPackageUpdater } from '../../src/updaters/go-updater.js';
import { MockFileRepository, mockFiles, mockPackages } from '../test-utils.js';

describe('GoPackageUpdater', () => {
	let updater: GoPackageUpdater;
	let mockFileRepo: MockFileRepository;

	beforeEach(() => {
		updater = new GoPackageUpdater();
		mockFileRepo = new MockFileRepository();
		// Replace the file repository with our mock
		(updater as any).fileRepo = mockFileRepo;
	});

	it('should have correct type', () => {
		expect(updater.type).toBe('go');
	});

	it('should get correct package file path', () => {
		const path = updater.getPackageFilePath('services/api');
		expect(path).toBe('services/api/go.mod');
	});

	it('should validate package existence', async () => {
		mockFileRepo.setFile('services/api/go.mod', mockFiles.goMod);
		
		const exists = await updater.validatePackage('services/api');
		expect(exists).toBe(true);
	});

	it('should return false for non-existent package', async () => {
		const exists = await updater.validatePackage('nonexistent/path');
		expect(exists).toBe(false);
	});

	it('should read version from go.mod module path', async () => {
		const goModWithVersion = `module github.com/org/repo/v2

go 1.21
`;
		mockFileRepo.setFile('services/api/go.mod', goModWithVersion);
		
		const version = await updater.readVersion('services/api');
		expect(version).toBe('2.0.0');
	});

	it('should return default version for v0/v1 modules', async () => {
		mockFileRepo.setFile('services/api/go.mod', mockFiles.goMod);
		
		const version = await updater.readVersion('services/api');
		expect(version).toBe('0.0.0');
	});

	it('should throw error for go.mod without module directive', async () => {
		const invalidGoMod = `go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
)
`;
		mockFileRepo.setFile('services/api/go.mod', invalidGoMod);
		
		await expect(updater.readVersion('services/api')).rejects.toThrow(
			'No module directive found in services/api/go.mod'
		);
	});

	it('should handle version update (no file modification)', async () => {
		mockFileRepo.setFile('services/api/go.mod', mockFiles.goMod);
		
		const result = await updater.updateVersion('services/api', '1.0.0', false);
		
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.oldVersion).toBe('0.0.0');
			expect(result.newVersion).toBe('1.0.0');
		}
		
		// Go modules don't modify go.mod for version updates
		const content = mockFileRepo.getFileContent('services/api/go.mod');
		expect(content).toBe(mockFiles.goMod);
	});

	it('should handle dry run mode', async () => {
		mockFileRepo.setFile('services/api/go.mod', mockFiles.goMod);
		
		const result = await updater.updateVersion('services/api', '1.0.0', true);
		
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.oldVersion).toBe('0.0.0');
			expect(result.newVersion).toBe('1.0.0');
		}
	});

	it('should always create tags', () => {
		const shouldCreateTag = updater.shouldCreateTag(mockPackages.go);
		expect(shouldCreateTag).toBe(true);
	});

	it('should generate root-level tag name', () => {
		const tagName = updater.getTagName(mockPackages.goRoot);
		expect(tagName).toBe('v1.0.0');
	});

	it('should generate subpath tag name', () => {
		const tagName = updater.getTagName(mockPackages.go);
		expect(tagName).toBe('services/api/v0.5.0');
	});

	it('should handle empty path as root', () => {
		const rootPackage = { ...mockPackages.goRoot, path: '' };
		const tagName = updater.getTagName(rootPackage);
		expect(tagName).toBe('v1.0.0');
	});

	it('should handle file read errors', async () => {
		// File doesn't exist, should throw error
		const result = await updater.updateVersion('nonexistent', '1.0.0', false);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain('ENOENT');
		}
	});

	it('should parse complex module paths', async () => {
		const complexGoMod = `module github.com/org/repo/tools/generator/v3

go 1.21

require (
	github.com/spf13/cobra v1.7.0
)
`;
		mockFileRepo.setFile('tools/generator/go.mod', complexGoMod);
		
		const version = await updater.readVersion('tools/generator');
		expect(version).toBe('3.0.0');
	});
});