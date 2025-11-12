// Console progress observer implementation

import * as readline from 'node:readline';
import Table from 'cli-table3';
import type { ProgressObserver } from './base-observer.js';
import type {
	PackageConfig,
	PackageChange,
	ChangeSummary,
	Summary,
	UpdateResult,
} from '../types/index.js';

export class ConsoleProgressObserver implements ProgressObserver {
	constructor(
		private dryRun: boolean = false,
		private autoConfirm: boolean = false,
	) {}

	onAnalysisStart(packageCount: number): void {
		const prefix = this.dryRun ? '[DRY RUN] ' : '';
		console.log(`🔍 ${prefix}Analyzing ${packageCount} packages...`);
	}

	onAnalysisComplete(changes: PackageChange[]): void {
		const toUpdate = changes.filter((c) => c.needsUpdate);
		const toSkip = changes.filter((c) => !c.needsUpdate);

		if (toUpdate.length > 0) {
			console.log('\nThe following packages will be updated:\n');
			this.displayChangesTable(toUpdate);
		}

		if (toSkip.length > 0) {
			console.log(
				'\nThe following packages are already at target version:\n',
			);
			for (const change of toSkip) {
				console.log(
					`  • ${change.config.name} (${change.config.type}) - ${change.currentVersion}`,
				);
			}
		}
	}

	async onConfirmationPrompt(summary: ChangeSummary): Promise<boolean> {
		if (this.dryRun || this.autoConfirm) {
			this.displaySummary(summary);
			return true;
		}

		this.displaySummary(summary);

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		return new Promise((resolve) => {
			rl.question('\n❓ Do you want to proceed? [y/N] ', (answer: string) => {
				rl.close();
				const confirmed =
					answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
				resolve(confirmed);
			});
		});
	}

	onPackageStart(pkg: PackageConfig): void {
		const prefix = this.dryRun ? '[DRY RUN] ' : '';
		console.log(`\n📦 ${prefix}Processing ${pkg.name} (${pkg.type})`);
	}

	onPackageComplete(pkg: PackageConfig, result: UpdateResult): void {
		if (result.success) {
			console.log(`  Current version: ${result.oldVersion}`);
			console.log(`  Target version:  ${result.newVersion}`);
			const prefix = this.dryRun ? 'Would update' : 'Updated';
			console.log(`  ✓ ${prefix} ${pkg.type} package`);
		} else {
			console.log(`  ✗ Failed: ${result.error}`);
		}
	}

	onPackageSkipped(pkg: PackageConfig, reason: string): void {
		console.log(`\n⊘ Skipping ${pkg.name} (${pkg.type})`);
		console.log(`  ${reason}`);
	}

	onComplete(summary: Summary): void {
		const prefix = this.dryRun ? '[DRY RUN] ' : '';
		console.log(`\n✅ ${prefix}Summary:`);
		console.log(`  - ${summary.updated} packages updated`);
		if (summary.skipped > 0) {
			console.log(`  - ${summary.skipped} packages skipped`);
		}
		if (summary.failed > 0) {
			console.log(`  - ${summary.failed} packages failed`);
		}
		console.log(`  - ${summary.commits} commits created`);
		if (summary.tags > 0) {
			console.log(`  - ${summary.tags} tags created`);
		}

		if (this.dryRun) {
			console.log('\nNo changes were made.');
		}
	}

	onError(message: string): void {
		console.error(`\n❌ Error: ${message}`);
	}

	private displayChangesTable(changes: PackageChange[]): void {
		const table = new Table({
			head: ['Package', 'Type', 'Current', 'New', 'Tag'],
			colWidths: [40, 10, 12, 12, 8],
		});

		for (const change of changes) {
			table.push([
				change.config.name,
				change.config.type,
				change.currentVersion,
				change.newVersion,
				change.willCreateTag ? 'Yes' : 'No',
			]);
		}

		console.log(table.toString());
	}

	private displaySummary(summary: ChangeSummary): void {
		console.log('\nSummary:');
		console.log(`  • ${summary.toUpdate} packages will be updated`);
		if (summary.toSkip > 0) {
			console.log(`  • ${summary.toSkip} packages will be skipped`);
		}
		console.log(`  • ${summary.commits} commits will be created`);
		if (summary.tags.length > 0) {
			console.log(
				`  • ${summary.tags.length} Git tags will be created (${summary.tags.join(', ')})`,
			);
		}
	}
}
