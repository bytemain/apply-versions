// Go package updater

import { join, relative } from 'node:path';
import { simpleGit } from 'simple-git';
import { LocalFileRepository } from '../repositories/index.js';
import type { PackageConfig, UpdateResult } from '../types/index.js';
import type { PackageUpdater } from './base-updater.js';

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

    // Parse go.mod to extract module path
    const moduleMatch = content.match(/^module\s+(.+)$/m);
    if (!moduleMatch) {
      throw new Error(`No module directive found in ${filePath}`);
    }

    // For Go modules, the version comes from Git tags, not go.mod
    // We need to find the latest tag that matches this package path
    try {
      const git = simpleGit(process.cwd());
      const tags = await git.tags();

      // Get git root to calculate relative path for tag matching
      const gitRoot = await git.revparse(['--show-toplevel']);
      const relativePath = relative(gitRoot.trim(), packagePath);

      // Generate the tag prefix for this package using relative path
      const tagPrefix = this.getTagPrefix(relativePath);

      // Find all tags that match this package
      const packageTags = tags.all
        .filter((tag) => tag.startsWith(tagPrefix))
        .map((tag) => {
          // Extract version from tag (e.g., "v1.2.3" or "path/v1.2.3")
          const versionMatch = tag.match(/v(\d+\.\d+\.\d+.*)$/);
          return versionMatch ? versionMatch[1] : null;
        })
        .filter((version) => version !== null)
        .sort((a, b) => {
          // Simple version comparison
          const aParts = a!.split('.').map((n) => parseInt(n, 10));
          const bParts = b!.split('.').map((n) => parseInt(n, 10));

          for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aVal = aParts[i] || 0;
            const bVal = bParts[i] || 0;
            if (aVal !== bVal) {
              return bVal - aVal; // Descending order
            }
          }
          return 0;
        });

      // Return the latest version, or "0.0.0" if no tags found
      return packageTags.length > 0 ? packageTags[0]! : '0.0.0';
    } catch (error) {
      // If git operations fail, return default
      console.warn(`Failed to read git tags for ${packagePath}: ${error}`);
      return '0.0.0';
    }
  }

  private getTagPrefix(packagePath: string): string {
    // For root-level packages, tag prefix is just "v"
    // For subpath packages, tag prefix is "path/v"
    if (packagePath === '.' || packagePath === '') {
      return 'v';
    }
    return `${packagePath}/v`;
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
    // Use relativePath if available, otherwise fall back to path
    const pkgPath = pkg.relativePath || pkg.path;
    if (pkgPath === '.' || pkgPath === '') {
      return `v${pkg.version}`;
    }

    return `${pkgPath}/v${pkg.version}`;
  }

  getPublishCommand(pkg: PackageConfig): string | undefined {
    // Go packages are published via Git tags, no additional command needed
    return undefined;
  }
}
