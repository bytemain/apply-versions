#!/usr/bin/env node

// CLI entry point

import { Command } from 'commander';
import { ConfigParser } from './parsers/toml-parser.js';
import { PackageProcessor } from './processors/index.js';
import { ConsoleProgressObserver } from './observers/index.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface CLIOptions {
	config: string;
	dryRun: boolean;
	yes: boolean;
	verbose: boolean;
}

async function main() {
	const program = new Command();

	// Read package.json to get version
	const packageJson = JSON.parse(
		await readFile(
			new URL('../package.json', import.meta.url),
			'utf-8',
		),
	);

	program
		.name('apply-versions')
		.description(
			'A CLI tool for managing versions across multi-language monorepo projects',
		)
		.version(packageJson.version)
		.option(
			'-c, --config <path>',
			'Path to versions.toml configuration file',
			'./versions.toml',
		)
		.option('-d, --dry-run', 'Preview changes without applying them', false)
		.option(
			'-y, --yes',
			'Skip confirmation prompt and proceed automatically',
			false,
		)
		.option('-v, --verbose', 'Show detailed output and debug information', false);

	program.parse();

	const options = program.opts<CLIOptions>();

	try {
		// Pre-flight checks
		const configPath = resolve(options.config);

		if (options.verbose) {
			console.log(`Configuration file: ${configPath}`);
			console.log(`Dry run: ${options.dryRun}`);
			console.log(`Auto-confirm: ${options.yes}`);
		}

		// Read and parse configuration
		const parser = new ConfigParser();
		const packages = await parser.parse(configPath);

		if (options.verbose) {
			console.log(`Found ${packages.length} packages in configuration`);
		}

		// Create observer
		const observer = new ConsoleProgressObserver(options.dryRun, options.yes);

		// Create processor
		const processor = new PackageProcessor(observer, options.dryRun);

		// Process packages
		const summary = await processor.process(packages);

		// Exit with appropriate code
		if (summary.failed > 0) {
			process.exit(1); // Partial failure
		}

		if (summary.updated === 0 && summary.skipped === 0) {
			process.exit(2); // Total failure
		}

		process.exit(0); // Success
	} catch (error) {
		console.error(
			`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
		if (options.verbose && error instanceof Error) {
			console.error('\nStack trace:');
			console.error(error.stack);
		}
		process.exit(2); // Configuration or pre-flight check failed
	}
}

main().catch((error) => {
	console.error('Unexpected error:', error);
	process.exit(2);
});