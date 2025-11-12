// Configuration parser tests

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigParser } from '../../src/parsers/toml-parser.js';
import { mockFiles } from '../test-utils.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

describe('ConfigParser', () => {
	const parser = new ConfigParser();
	const testDir = join(process.cwd(), 'test-tmp');
	
	beforeEach(async () => {
		await rm(testDir, { recursive: true, force: true });
		await mkdir(testDir, { recursive: true });
	});

	it('should parse valid TOML configuration', async () => {
		const configPath = join(testDir, 'versions.toml');
		await writeFile(configPath, mockFiles.versionsToml);

		const packages = await parser.parse(configPath);

		expect(packages).toHaveLength(3);
		expect(packages[0]).toEqual({
			path: 'packages/web',
			name: '@myorg/web',
			type: 'npm',
			version: '1.2.3',
		});
		expect(packages[1]).toEqual({
			path: 'services/api',
			name: 'github.com/org/repo/services/api',
			type: 'go',
			version: '0.5.0',
		});
		expect(packages[2]).toEqual({
			path: 'crates/server',
			name: 'myorg-server',
			type: 'rust',
			version: '2.1.0',
		});
	});

	it('should throw error for missing file', async () => {
		const configPath = join(testDir, 'nonexistent.toml');

		await expect(parser.parse(configPath)).rejects.toThrow(
			'Configuration file not found'
		);
	});

	it('should throw error for invalid TOML', async () => {
		const configPath = join(testDir, 'invalid.toml');
		await writeFile(configPath, 'invalid toml content [[[');

		await expect(parser.parse(configPath)).rejects.toThrow(
			'Failed to parse configuration'
		);
	});

	it('should throw error for missing package array', async () => {
		const configPath = join(testDir, 'no-packages.toml');
		await writeFile(configPath, 'title = "No packages here"');

		await expect(parser.parse(configPath)).rejects.toThrow(
			'Invalid configuration: missing or invalid "package" array'
		);
	});

	it('should throw error for invalid package array', async () => {
		const configPath = join(testDir, 'invalid-packages.toml');
		await writeFile(configPath, 'package = "not an array"');

		await expect(parser.parse(configPath)).rejects.toThrow(
			'Invalid configuration: missing or invalid "package" array'
		);
	});

	it('should parse package with optional rust workspace field', async () => {
		const configPath = join(testDir, 'rust-workspace.toml');
		const rustConfig = `[[package]]
path = "crates/core"
name = "myorg-core"
type = "rust"
version = "1.0.0"
update_workspace_deps = true
`;
		await writeFile(configPath, rustConfig);

		const packages = await parser.parse(configPath);

		expect(packages).toHaveLength(1);
		expect(packages[0]).toEqual({
			path: 'crates/core',
			name: 'myorg-core',
			type: 'rust',
			version: '1.0.0',
			update_workspace_deps: true,
		});
	});
});