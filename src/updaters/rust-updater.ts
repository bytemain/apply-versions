// Rust package updater

import { join } from 'node:path';
import * as TOML from 'smol-toml';
import { LocalFileRepository } from '../repositories/index.js';
import type { PackageConfig, UpdateResult } from '../types/index.js';
import type { PackageUpdater } from './base-updater.js';

interface CargoToml {
  package?: {
    name?: string;
    version?: string;
    [key: string]: unknown;
  };
  dependencies?: Record<string, unknown>;
  [key: string]: unknown;
}

export class RustPackageUpdater implements PackageUpdater {
  readonly type = 'cargo' as const;
  private fileRepo = new LocalFileRepository();

  getPackageFilePath(packagePath: string): string {
    return join(packagePath, 'Cargo.toml');
  }

  async validatePackage(packagePath: string): Promise<boolean> {
    const filePath = this.getPackageFilePath(packagePath);
    return await this.fileRepo.exists(filePath);
  }

  async readVersion(packagePath: string): Promise<string> {
    const filePath = this.getPackageFilePath(packagePath);
    const content = await this.fileRepo.read(filePath);
    const cargo = TOML.parse(content) as CargoToml;

    if (!cargo.package?.version) {
      throw new Error(
        `No version field found in [package] section of ${filePath}`,
      );
    }

    return cargo.package.version;
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

      if (!dryRun) {
        // Update version in Cargo.toml using regex to preserve formatting
        const versionRegex = /^(\s*version\s*=\s*")([^"]+)(")/m;
        const updatedContent = content.replace(
          versionRegex,
          `$1${newVersion}$3`,
        );

        if (updatedContent === content) {
          throw new Error(
            `Failed to update version in ${filePath}. Version field not found or already at target version.`,
          );
        }

        await this.fileRepo.write(filePath, updatedContent);
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
    // Check if create_tag is explicitly set in config
    if (pkg.type === 'cargo' && pkg.create_tag !== undefined) {
      return pkg.create_tag;
    }
    // Default to true for Rust packages
    return true;
  }

  getTagName(pkg: PackageConfig): string {
    // Default cargo tag format (rarely used)
    // Could include crate name in the future: `${pkg.name}-v${pkg.version}`
    return `v${pkg.version}`;
  }

  getPublishCommand(pkg: PackageConfig): string | undefined {
    const pkgDir =
      pkg.relativePath && pkg.relativePath !== '.' ? pkg.relativePath : '.';
    if (pkgDir === '.') {
      return 'cargo publish';
    }
    return `cd ${pkgDir} && cargo publish`;
  }
}
