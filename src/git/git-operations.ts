// Git operations

import { type SimpleGit, simpleGit } from 'simple-git';
import type { GitOperationResult, PackageConfig } from '../types/index.js';

export class GitOperations {
  private git: SimpleGit;

  constructor(repoPath: string = process.cwd()) {
    this.git = simpleGit(repoPath);
  }

  async isRepository(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  async fetchTags(): Promise<GitOperationResult> {
    try {
      // Fetch all tags from all remotes
      await this.git.fetch(['--tags', '--force']);
      return {
        success: true,
      };
    } catch (error) {
      // If fetch fails (e.g., no remote configured), we continue silently
      // This allows the tool to work in local-only scenarios
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status();
    return !status.isClean();
  }

  async hasFileChanges(filePath: string): Promise<boolean> {
    try {
      const status = await this.git.status();
      const relativePath = filePath.startsWith(process.cwd())
        ? filePath.replace(process.cwd() + '/', '')
        : filePath;

      return status.files.some(
        (file) => file.path === relativePath || file.path === filePath,
      );
    } catch {
      return false;
    }
  }

  async commitSingleFile(
    filePath: string,
    commitMessage: string,
    dryRun: boolean = false,
  ): Promise<GitOperationResult> {
    if (dryRun) {
      return {
        success: true,
        commitHash: 'dry-run',
      };
    }

    try {
      // Stage the file
      await this.git.add(filePath);

      // Create commit
      const result = await this.git.commit(commitMessage);

      return {
        success: true,
        commitHash: result.commit,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown git error',
      };
    }
  }

  async stageAndCommit(
    pkg: PackageConfig,
    filePath: string,
    oldVersion: string,
    newVersion: string,
    dryRun: boolean,
    additionalFiles?: string[],
  ): Promise<GitOperationResult> {
    if (dryRun) {
      return {
        success: true,
        commitHash: 'dry-run',
      };
    }

    try {
      // Stage the main file
      await this.git.add(filePath);

      // Stage additional files if provided
      if (additionalFiles && additionalFiles.length > 0) {
        for (const file of additionalFiles) {
          try {
            await this.git.add(file);
          } catch (error) {
            // If the file doesn't exist, skip it silently
            // This is expected for files like package-lock.json that might not exist
            console.log(`  ℹ Skipping ${file} (file not found)`);
          }
        }
      }

      // Create commit message
      const message = this.createCommitMessage(pkg, oldVersion, newVersion);

      // Commit
      const result = await this.git.commit(message);

      return {
        success: true,
        commitHash: result.commit,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createTag(
    tagName: string,
    dryRun: boolean,
  ): Promise<GitOperationResult> {
    if (dryRun) {
      return {
        success: true,
        tagName,
      };
    }

    try {
      // Fetch tags from remote to ensure we have the latest tags
      // This prevents creating duplicate tags when local is out of sync
      await this.fetchTags();

      // Check if tag already exists
      const tags = await this.git.tags();
      if (tags.all.includes(tagName)) {
        return {
          success: false,
          error: `Tag ${tagName} already exists`,
        };
      }

      // Create tag
      await this.git.addTag(tagName);

      return {
        success: true,
        tagName,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private createCommitMessage(
    pkg: PackageConfig,
    oldVersion: string,
    newVersion: string,
  ): string {
    return `chore(${pkg.name}): bump version to ${newVersion}

- Updated ${pkg.type} package at ${pkg.path}
- Previous version: ${oldVersion}
- New version: ${newVersion}`;
  }
}
