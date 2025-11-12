// NPM package updater tests

import { describe, it, expect, beforeEach } from 'vitest';
import { NpmPackageUpdater } from '../../src/updaters/npm-updater.js';
import { MockFileRepository, mockFiles, mockPackages } from '../test-utils.js';

describe('NpmPackageUpdater', () => {
	let updater: NpmPackageUpdater;
	let mockFileRepo: MockFileRepository;

	beforeEach(() => {
		updater = new NpmPackageUpdater();
		mockFileRepo = new MockFileRepository();
		// Replace the file repository with our mock
		(updater as any).fileRepo = mockFileRepo;
	});

	it('should have correct type', () => {
		expect(updater.type).toBe('npm');
	});

	it('should get correct package file path', () => {
		const path = updater.getPackageFilePath('packages/web');
		expect(path).toBe('packages/web/package.json');
	});

	it('should validate package existence', async () => {
		mockFileRepo.setFile('packages/web/package.json', mockFiles.packageJson);
		
		const exists = await updater.validatePackage('packages/web');
		expect(exists).toBe(true);
	});

	it('should return false for non-existent package', async () => {
		const exists = await updater.validatePackage('nonexistent/path');
		expect(exists).toBe(false);
	});

	it('should read version from package.json', async () => {
		mockFileRepo.setFile('packages/web/package.json', mockFiles.packageJson);
		
		const version = await updater.readVersion('packages/web');
		expect(version).toBe('1.0.0');
	});

	it('should throw error for package.json without version', async () => {
		const packageJsonWithoutVersion = JSON.stringify({
			name: '@myorg/web',
			dependencies: {}
		}, null, 2);
		mockFileRepo.setFile('packages/web/package.json', packageJsonWithoutVersion);
		
		await expect(updater.readVersion('packages/web')).rejects.toThrow(
			'No version field found in packages/web/package.json'
		);
	});

	it('should update version in package.json', async () => {
		mockFileRepo.setFile('packages/web/package.json', mockFiles.packageJson);
		
		const result = await updater.updateVersion('packages/web', '2.0.0', false);
		
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.oldVersion).toBe('1.0.0');
			expect(result.newVersion).toBe('2.0.0');
		}
		
		const updatedContent = mockFileRepo.getFileContent('packages/web/package.json');
		const updatedPackage = JSON.parse(updatedContent!);
		expect(updatedPackage.version).toBe('2.0.0');
		expect(updatedPackage.name).toBe('@myorg/web'); // Other fields preserved
	});

	it('should handle dry run mode', async () => {
		mockFileRepo.setFile('packages/web/package.json', mockFiles.packageJson);
		
		const result = await updater.updateVersion('packages/web', '2.0.0', true);
		
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.oldVersion).toBe('1.0.0');
			expect(result.newVersion).toBe('2.0.0');
		}
		
		// File should not be modified in dry run
		const content = mockFileRepo.getFileContent('packages/web/package.json');
		const pkg = JSON.parse(content!);
		expect(pkg.version).toBe('1.0.0');
	});

	it('should not create tags by default', () => {
		const shouldCreateTag = updater.shouldCreateTag(mockPackages.npm);
		expect(shouldCreateTag).toBe(false);
	});

	it('should generate simple tag name', () => {
		const tagName = updater.getTagName(mockPackages.npm);
		expect(tagName).toBe('v1.2.3');
	});

	it('should handle file read errors', async () => {
		// File doesn't exist, should return failure result
		const result = await updater.updateVersion('nonexistent', '1.0.0', false);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain('ENOENT');
		}
	});

	it('should handle invalid JSON', async () => {
		mockFileRepo.setFile('packages/web/package.json', 'invalid json {{{');
		
		const result = await updater.updateVersion('packages/web', '1.0.0', false);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain('JSON');
		}
	});

	it('should preserve formatting in package.json', async () => {
		const originalJson = JSON.stringify({
			name: '@myorg/web',
			version: '1.0.0',
			dependencies: {
				react: '^18.0.0'
			}
		}, null, 2) + '\n';
		
		mockFileRepo.setFile('packages/web/package.json', originalJson);
		
		await updater.updateVersion('packages/web', '2.0.0', false);
		
		const updatedContent = mockFileRepo.getFileContent('packages/web/package.json')!;
		
		// Should have proper formatting (2 spaces, trailing newline)
		expect(updatedContent).toMatch(/^\{[\s\S]*\}\n$/);
		expect(updatedContent).toContain('  "version": "2.0.0"');
		
		const parsed = JSON.parse(updatedContent);
		expect(parsed.version).toBe('2.0.0');
		expect(parsed.dependencies.react).toBe('^18.0.0');
	});
});