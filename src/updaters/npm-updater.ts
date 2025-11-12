// npm package updater

import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { PackageUpdater } from './base-updater.js';
import type { UpdateResult, PackageConfig } from '../types/index.js';
import { LocalFileRepository } from '../repositories/index.js';

export class NpmPackageUpdater implements PackageUpdater {
	readonly type = 'npm' as const;
	private fileRepo = new LocalFileRepository();

	getPackageFilePath(packagePath: string): string {
		return join(packagePath, 'package.json');
	}

	async validatePackage(packagePath: string): Promise<boolean> {
		const filePath = this.getPackageFilePath(packagePath);
		return await this.fileRepo.exists(filePath);
	}

	async readVersion(packagePath: string): Promise<string> {
		const filePath = this.getPackageFilePath(packagePath);
		const content = await this.fileRepo.read(filePath);
		const pkg = JSON.parse(content);

		if (!pkg.version) {
			throw new Error(`No version field found in ${filePath}`);
		}

		return pkg.version;
	}

	private async runNpmInstall(packagePath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const npmProcess = spawn('npm', ['install'], {
				cwd: packagePath,
				stdio: 'inherit'
			});

			npmProcess.on('close', (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`npm install failed with exit code ${code}`));
				}
			});

			npmProcess.on('error', (error) => {
				reject(new Error(`Failed to run npm install: ${error.message}`));
			});
		});
	}

	async updateVersion(
		packagePath: string,
		newVersion: string,
		dryRun: boolean,
	): Promise<UpdateResult> {
		try {
			const filePath = this.getPackageFilePath(packagePath);
			const content = await this.fileRepo.read(filePath);
			const pkg = JSON.parse(content);
			const oldVersion = pkg.version;

			if (!dryRun) {
				pkg.version = newVersion;
				const updatedContent = JSON.stringify(pkg, null, 2) + '\n';
				await this.fileRepo.write(filePath, updatedContent);
				
				// Run npm install after updating package.json
				console.log(`Running npm install in ${packagePath}...`);
				await this.runNpmInstall(packagePath);
			}

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
		// npm packages typically don't create automatic Git tags
		return false;
	}

	getTagName(pkg: PackageConfig): string {
		// Default npm tag format (rarely used)
		return `v${pkg.version}`;
	}
}
