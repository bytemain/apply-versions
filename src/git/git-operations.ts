// Git operations

import { simpleGit, type SimpleGit } from 'simple-git';
import type { PackageConfig, GitOperationResult } from '../types/index.js';

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

	async hasUncommittedChanges(): Promise<boolean> {
		const status = await this.git.status();
		return !status.isClean();
	}

	async stageAndCommit(
		pkg: PackageConfig,
		filePath: string,
		oldVersion: string,
		newVersion: string,
		dryRun: boolean,
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
