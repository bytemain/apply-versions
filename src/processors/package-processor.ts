// Package processor - main orchestrator

import { GitOperations } from '../git/index.js';
import type { ProgressObserver } from '../observers/index.js';
import type {
  ChangeSummary,
  PackageChange,
  PackageConfig,
  ProcessResult,
  Summary,
} from '../types/index.js';
import { PackageUpdaterFactory } from '../updaters/index.js';
import { createValidationChain } from '../validators/index.js';

export class PackageProcessor {
  private gitOps: GitOperations;
  private validator = createValidationChain();

  constructor(
    private observer: ProgressObserver,
    private dryRun: boolean = false,
  ) {
    this.gitOps = new GitOperations();
  }

  async process(packages: PackageConfig[]): Promise<Summary> {
    // Analysis phase
    this.observer.onAnalysisStart(packages.length);

    const changes = await this.analyzeChanges(packages);

    if (changes.length === 0) {
      this.observer.onError('No valid packages found to process');
      return this.createSummary([]);
    }

    this.observer.onAnalysisComplete(changes);

    // Confirmation phase
    const summary = this.createChangeSummary(changes);
    const confirmed = await this.observer.onConfirmationPrompt(summary);

    if (!confirmed) {
      console.log('\nOperation cancelled by user.');
      return this.createSummary([]);
    }

    // Execution phase
    const results: ProcessResult[] = [];

    for (const change of changes) {
      if (!change.needsUpdate) {
        this.observer.onPackageSkipped(
          change.config,
          `Already at target version: ${change.currentVersion}`,
        );
        results.push({
          package: change.config,
          updated: false,
          skipped: true,
        });
        continue;
      }

      const result = await this.processPackage(change);
      results.push(result);
    }

    // Complete
    const finalSummary = this.createSummary(results);
    this.observer.onComplete(finalSummary);

    return finalSummary;
  }

  private async analyzeChanges(
    packages: PackageConfig[],
  ): Promise<PackageChange[]> {
    const changes: PackageChange[] = [];

    for (const pkg of packages) {
      try {
        // Validate package config
        const validationResult = await this.validator.validate(pkg);
        if (!validationResult.valid) {
          this.observer.onError(
            `Validation failed for ${pkg.name}: ${validationResult.error}`,
          );
          continue;
        }

        // Get updater
        const updater = PackageUpdaterFactory.getUpdater(pkg.type);

        // Validate package file exists
        const packageExists = await updater.validatePackage(pkg.path);
        if (!packageExists) {
          this.observer.onError(
            `Package file not found for ${pkg.name} at ${pkg.path}`,
          );
          continue;
        }

        // Read current version
        const currentVersion = await updater.readVersion(pkg.path);
        const needsUpdate = currentVersion !== pkg.version;

        // Determine if tag will be created using updater
        const willCreateTag = needsUpdate && updater.shouldCreateTag(pkg);

        changes.push({
          config: pkg,
          currentVersion,
          newVersion: pkg.version,
          needsUpdate,
          willCreateTag,
          tagName: willCreateTag ? updater.getTagName(pkg) : undefined,
        });
      } catch (error) {
        this.observer.onError(
          `Failed to analyze ${pkg.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return changes;
  }

  private async processPackage(change: PackageChange): Promise<ProcessResult> {
    const { config } = change;

    this.observer.onPackageStart(config);

    try {
      // Get updater
      const updater = PackageUpdaterFactory.getUpdater(config.type);

      // Update version
      const updateResult = await updater.updateVersion(
        config.path,
        config.version,
        this.dryRun,
      );

      if (!updateResult.success) {
        this.observer.onPackageComplete(config, updateResult);
        return {
          package: config,
          updated: false,
          skipped: false,
          error: updateResult.error,
          updateResult,
        };
      }

      this.observer.onPackageComplete(config, updateResult);

      // Git operations
      const filePath = updater.getPackageFilePath(config.path);
      const gitResult = await this.gitOps.stageAndCommit(
        config,
        filePath,
        updateResult.oldVersion,
        updateResult.newVersion,
        this.dryRun,
        updateResult.additionalFiles,
      );

      if (!gitResult.success) {
        this.observer.onError(
          `Failed to commit changes for ${config.name}: ${gitResult.error}`,
        );
        return {
          package: config,
          updated: true,
          skipped: false,
          updateResult,
          gitResult,
        };
      }

      const commitPrefix = this.dryRun ? 'Would create' : 'Created';
      console.log(`  ✓ ${commitPrefix} commit`);

      // Create tag if needed
      if (change.willCreateTag) {
        const tagName = updater.getTagName(config);
        const tagResult = await this.gitOps.createTag(tagName, this.dryRun);

        if (tagResult.success) {
          const tagPrefix = this.dryRun ? 'Would create' : 'Created';
          console.log(`  ✓ ${tagPrefix} tag: ${tagResult.tagName}`);
        } else {
          this.observer.onError(
            `Failed to create tag for ${config.name}: ${tagResult.error}`,
          );
        }
      }

      return {
        package: config,
        updated: true,
        skipped: false,
        updateResult,
        gitResult,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.observer.onError(
        `Failed to process ${config.name}: ${errorMessage}`,
      );
      return {
        package: config,
        updated: false,
        skipped: false,
        error: errorMessage,
      };
    }
  }

  private createChangeSummary(changes: PackageChange[]): ChangeSummary {
    const toUpdate = changes.filter((c) => c.needsUpdate);
    const toSkip = changes.filter((c) => !c.needsUpdate);
    const tags = changes
      .filter((c) => c.willCreateTag && c.tagName)
      .map((c) => c.tagName!);

    return {
      toUpdate: toUpdate.length,
      toSkip: toSkip.length,
      commits: toUpdate.length,
      tags,
    };
  }

  private createSummary(results: ProcessResult[]): Summary {
    const updated = results.filter((r) => r.updated).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => r.error).length;

    // Count successful commits and tags
    let commits = 0;
    let tags = 0;

    for (const result of results) {
      if (result.updated && result.gitResult?.success) {
        commits++;
        // Get the updater to check if this package type creates tags
        const updater = PackageUpdaterFactory.getUpdater(result.package.type);
        if (updater.shouldCreateTag(result.package)) {
          tags++;
        }
      }
    }

    return {
      total: results.length,
      updated,
      skipped,
      failed,
      commits,
      tags,
    };
  }
}
