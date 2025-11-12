// Rust package updater tests

import { describe, it, expect, beforeEach } from 'vitest';
import { RustPackageUpdater } from '../../src/updaters/rust-updater.js';
import { MockFileRepository, mockFiles, mockPackages } from '../test-utils.js';

describe('RustPackageUpdater', () => {
	let updater: RustPackageUpdater;
	let mockFileRepo: MockFileRepository;

	beforeEach(() => {
		updater = new RustPackageUpdater();
		mockFileRepo = new MockFileRepository();
		// Replace the file repository with our mock
		(updater as any).fileRepo = mockFileRepo;
	});

	it('should have correct type', () => {
		expect(updater.type).toBe('rust');
	});

	it('should get correct package file path', () => {
		const path = updater.getPackageFilePath('crates/server');
		expect(path).toBe('crates/server/Cargo.toml');
	});

	it('should validate package existence', async () => {
		mockFileRepo.setFile('crates/server/Cargo.toml', mockFiles.cargoToml);
		
		const exists = await updater.validatePackage('crates/server');
		expect(exists).toBe(true);
	});

	it('should return false for non-existent package', async () => {
		const exists = await updater.validatePackage('nonexistent/path');
		expect(exists).toBe(false);
	});

	it('should read version from Cargo.toml', async () => {
		mockFileRepo.setFile('crates/server/Cargo.toml', mockFiles.cargoToml);
		
		const version = await updater.readVersion('crates/server');
		expect(version).toBe('1.0.0');
	});

	it('should throw error for Cargo.toml without version', async () => {
		const cargoWithoutVersion = `[package]
name = "myorg-server"
edition = "2021"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
`;
		mockFileRepo.setFile('crates/server/Cargo.toml', cargoWithoutVersion);
		
		await expect(updater.readVersion('crates/server')).rejects.toThrow(
			'No version field found in [package] section of crates/server/Cargo.toml'
		);
	});

	it('should throw error for Cargo.toml without package section', async () => {
		const cargoWithoutPackage = `[dependencies]
tokio = { version = "1.0", features = ["full"] }
`;
		mockFileRepo.setFile('crates/server/Cargo.toml', cargoWithoutPackage);
		
		await expect(updater.readVersion('crates/server')).rejects.toThrow(
			'No version field found in [package] section of crates/server/Cargo.toml'
		);
	});

	it('should update version in Cargo.toml', async () => {
		mockFileRepo.setFile('crates/server/Cargo.toml', mockFiles.cargoToml);
		
		const result = await updater.updateVersion('crates/server', '2.0.0', false);
		
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.oldVersion).toBe('1.0.0');
			expect(result.newVersion).toBe('2.0.0');
		}
		
		const updatedContent = mockFileRepo.getFileContent('crates/server/Cargo.toml');
		expect(updatedContent).toMatchSnapshot();
		expect(updatedContent).toContain('name = "myorg-server"'); // Other fields preserved
	});

	it('should preserve formatting when updating version', async () => {
		const cargoWithSpacing = `[package]
name = "myorg-server"
version    =    "1.0.0"
edition = "2021"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
`;
		mockFileRepo.setFile('crates/server/Cargo.toml', cargoWithSpacing);
		
		const result = await updater.updateVersion('crates/server', '2.0.0', false);
		
		expect(result.success).toBe(true);
		
		const updatedContent = mockFileRepo.getFileContent('crates/server/Cargo.toml');
		expect(updatedContent).toContain('version    =    "2.0.0"');
		expect(updatedContent).toContain('[dependencies]'); // Structure preserved
	});

	it('should handle dry run mode', async () => {
		mockFileRepo.setFile('crates/server/Cargo.toml', mockFiles.cargoToml);
		
		const result = await updater.updateVersion('crates/server', '2.0.0', true);
		
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.oldVersion).toBe('1.0.0');
			expect(result.newVersion).toBe('2.0.0');
		}
		
		// File should not be modified in dry run
		const content = mockFileRepo.getFileContent('crates/server/Cargo.toml');
		expect(content).toBe(mockFiles.cargoToml);
	});

	it('should not create tags by default', () => {
		const shouldCreateTag = updater.shouldCreateTag(mockPackages.rust);
		expect(shouldCreateTag).toBe(false);
	});

	it('should generate simple tag name', () => {
		const tagName = updater.getTagName(mockPackages.rust);
		expect(tagName).toBe('v2.1.0');
	});

	it('should handle file read errors', async () => {
		// File doesn't exist, should throw error
		const result = await updater.updateVersion('nonexistent', '1.0.0', false);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toMatchSnapshot();
		}
	});

	it('should handle invalid TOML', async () => {
		mockFileRepo.setFile('crates/server/Cargo.toml', 'invalid toml [[[');
		
		const result = await updater.updateVersion('crates/server', '1.0.0', false);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toMatchSnapshot();
		}
	});

	it('should fail when version regex does not match', async () => {
		const cargoWithUnexpectedFormat = `[package]
name = "myorg-server"
version = 1.0.0  # No quotes
edition = "2021"
`;
		mockFileRepo.setFile('crates/server/Cargo.toml', cargoWithUnexpectedFormat);
		
		const result = await updater.updateVersion('crates/server', '2.0.0', false);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toMatchSnapshot(); // TOML parsing will fail first
		}
	});

	it('should handle complex Cargo.toml structures', async () => {
		const complexCargo = `[package]
name = "myorg-server"
version = "1.0.0"
edition = "2021"
authors = ["Author <author@example.com>"]
description = "A server application"

[lib]
name = "myorg_server"
path = "src/lib.rs"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }

[dev-dependencies]
tokio-test = "0.4"

[features]
default = ["tokio/rt-multi-thread"]
`;
		mockFileRepo.setFile('crates/server/Cargo.toml', complexCargo);
		
		const result = await updater.updateVersion('crates/server', '1.5.0', false);
		
		expect(result.success).toBe(true);
		
		const updatedContent = mockFileRepo.getFileContent('crates/server/Cargo.toml');
		expect(updatedContent).toContain('version = "1.5.0"');
		expect(updatedContent).toContain('[lib]'); // Other sections preserved
		expect(updatedContent).toContain('tokio = { version = "1.0"'); // Dependencies preserved
		expect(updatedContent).toContain('[features]'); // Features preserved
	});
});