// Go package updater

import { join } from 'node:path';
import type { PackageUpdater } from './base-updater.js';
import type { UpdateResult, PackageConfig } from '../types/index.js';
import { LocalFileRepository } from '../repositories/index.js';

export class GoPackageUpdater implements PackageUpdater {
	readonly type = 'go' as const;
	private fileRepo = new LocalFileRepository();

	getPackageFilePath(packagePath: string): string {
		return join(packagePath, 'go.mod');
	}

	async validatePackage(packagePath: string): Promise<boolean> {
		const filePath = this.getPackageFilePath(packagePath);
		return await this.fileRepo.exists(filePath);
	}

	async readVersion(packagePath: string): Promise<string> {
		const filePath = this.getPackageFilePath(packagePath);
		const content = await this.fileRepo.read(filePath);

		// Parse go.mod to extract version from module path
		// Format: module github.com/user/repo/v2
		const moduleMatch = content.match(/^module\s+(.+?)(?:\/v(\d+))?$/m);
		if (!moduleMatch) {
			throw new Error(`No module directive found in ${filePath}`);
		}

		const versionPart = moduleMatch[2];
		if (versionPart) {
			return `${versionPart}.0.0`; // Major version only in go.mod
		}

		// For v0 and v1, we need to check git tags or return a default
		// For now, we'll return "0.0.0" as we can't determine from go.mod alone
		return '0.0.0';
	}

	async updateVersion(
		packagePath: string,
		newVersion: string,
		dryRun: boolean,
	): Promise<UpdateResult> {
		try {
			const filePath = this.getPackageFilePath(packagePath);
			const content = await this.fileRepo.read(filePath);
			const oldVersion = await this.readVersion(packagePath);

			// For Go modules, we typically don't modify go.mod version
			// The version is managed through Git tags
			// So we just return success without modifying the file

			return {
				success: true,
				oldVersion,
				newVersion,
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : 'Unknown error occurred',
			};
		}
	}

	shouldCreateTag(pkg: PackageConfig): boolean {
		// Go packages always create Git tags for version management
		return true;
	}

	getTagName(pkg: PackageConfig): string {
		// For Go packages, include the path if not at root
		if (pkg.path === '.' || pkg.path === '') {
			return `v${pkg.version}`;
		}

		return `${pkg.path}/v${pkg.version}`;
	}
}
