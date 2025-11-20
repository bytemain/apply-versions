// npm package updater

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { LocalFileRepository } from '../repositories/index.js';
import type { PackageConfig, UpdateResult } from '../types/index.js';
import type { PackageUpdater } from './base-updater.js';

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
        stdio: 'inherit',
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

      // Include package-lock.json in the commit
      const lockFilePath = join(packagePath, 'package-lock.json');

      return {
        success: true,
        oldVersion,
        newVersion,
        additionalFiles: [lockFilePath],
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
    // Check if create_tag is explicitly set in config
    if (pkg.type === 'npm' && pkg.create_tag !== undefined) {
      return pkg.create_tag;
    }
    // Default to true for npm packages
    return true;
  }

  getTagName(pkg: PackageConfig): string {
    // Default npm tag format (rarely used)
    return `v${pkg.version}`;
  }

  getPublishCommand(pkg: PackageConfig): string | undefined {
    const pkgDir = pkg.relativePath && pkg.relativePath !== '.' ? pkg.relativePath : '.';
    if (pkgDir === '.') {
      return 'npm publish';
    }
    return `cd ${pkgDir} && npm publish`;
  }
}
