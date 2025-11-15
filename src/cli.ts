#!/usr/bin/env node

import { Command } from 'commander';
import { ConfigParser } from './parsers/toml-parser.js';
import { PackageProcessor } from './processors/index.js';
import { ConsoleProgressObserver } from './observers/index.js';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import * as readline from 'node:readline';

interface CLIOptions {
  config: string;
  dryRun: boolean;
  yes: boolean;
  verbose: boolean;
  path?: string;
}

interface BumpOptions {
  config?: string;
  yes: boolean;
  verbose: boolean;
}

type BumpType = 'major' | 'minor' | 'patch';

/**
 * Bump a semantic version
 */
function bumpVersion(version: string, type: BumpType): string {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version format: ${version}`);
  }

  const [major, minor, patch] = parts;

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

/**
 * Ask user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Update version in toml file
 */
async function updateTomlVersion(
  tomlPath: string,
  packagePath: string,
  newVersion: string,
): Promise<void> {
  const content = await readFile(tomlPath, 'utf-8');
  const lines = content.split('\n');
  let packageMatched = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if we're entering a package block
    if (line === '[[package]]') {
      packageMatched = false;
    }

    // Check if this package matches our target path
    if (!packageMatched && line.startsWith('path = ')) {
      const pathValue = line.match(/path\s*=\s*["']([^"']+)["']/);
      if (pathValue && pathValue[1] === packagePath) {
        packageMatched = true;
      }
    }

    // If we found the right package, update its version
    if (packageMatched && line.startsWith('version = ')) {
      lines[i] = lines[i].replace(
        /version\s*=\s*["'][^"']+["']/,
        `version = "${newVersion}"`,
      );
      break;
    }
  }

  await writeFile(tomlPath, lines.join('\n'), 'utf-8');
}

/**
 * Find versions.toml by searching upwards from the current directory
 */
async function findConfigFile(
  startDir: string = process.cwd(),
): Promise<string | null> {
  let currentDir = resolve(startDir);
  const root = resolve('/');

  while (currentDir !== root) {
    const configPath = join(currentDir, 'versions.toml');
    try {
      await access(configPath);
      return configPath;
    } catch {
      // File doesn't exist, try parent directory
      currentDir = dirname(currentDir);
    }
  }

  // Check root directory
  const configPath = join(root, 'versions.toml');
  try {
    await access(configPath);
    return configPath;
  } catch {
    return null;
  }
}

/**
 * Resolve the config file path based on user input
 */
async function resolveConfigPath(
  configOption: string | undefined,
): Promise<string> {
  if (configOption) {
    // User specified a custom path, use it directly
    return resolve(configOption);
  }

  // No config specified, search upwards from current directory
  const foundConfig = await findConfigFile();
  if (foundConfig) {
    return foundConfig;
  }

  // Fallback to default location
  return resolve('./versions.toml');
}

/**
 * Filter packages based on the target path
 */
function filterPackagesByPath(
  packages: any[],
  configDir: string,
  targetPath: string,
  verbose: boolean,
): any[] {
  const currentDir = resolve(process.cwd());
  const resolvedTarget = resolve(currentDir, targetPath);
  const relativeTarget = relative(configDir, resolvedTarget);

  if (verbose) {
    console.log(`Config directory: ${configDir}`);
    console.log(`Current directory: ${currentDir}`);
    console.log(`Target path: ${resolvedTarget}`);
    console.log(`Relative target: ${relativeTarget}`);
  }

  return packages.filter((pkg) => {
    const pkgPath = pkg.path === '.' ? '' : pkg.path;
    const match =
      pkgPath === relativeTarget ||
      relativeTarget.startsWith(pkgPath + '/') ||
      pkgPath.startsWith(relativeTarget + '/') ||
      (relativeTarget === '' && pkgPath === '') ||
      (relativeTarget === '.' && pkgPath === '');

    if (verbose && match) {
      console.log(`Including package: ${pkg.name} (path: ${pkg.path})`);
    }

    return match;
  });
}

/**
 * Auto-filter packages when running from a subdirectory
 */
function autoFilterPackages(
  packages: any[],
  configDir: string,
  verbose: boolean,
): any[] {
  const currentDir = resolve(process.cwd());
  const relativeToConfig = relative(configDir, currentDir);

  // If we're in the config directory or above it, don't filter
  if (!relativeToConfig || relativeToConfig.startsWith('..')) {
    return packages;
  }

  if (verbose) {
    console.log(`Auto-filtering packages under: ${relativeToConfig}`);
  }

  return packages.filter((pkg) => {
    const pkgPath = pkg.path === '.' ? '' : pkg.path;
    // Match if:
    // 1. Package path exactly matches current directory
    // 2. Package path is parent of current directory (we're inside the package)
    // 3. Current directory is at package level
    const match =
      pkgPath === relativeToConfig ||
      relativeToConfig.startsWith(pkgPath + '/') ||
      pkgPath.startsWith(relativeToConfig + '/') ||
      relativeToConfig === pkgPath;

    if (verbose && match) {
      console.log(`Auto-including package: ${pkg.name} (path: ${pkg.path})`);
    }

    return match;
  });
}

/**
 * Handle bump command
 */
async function handleBump(bumpType: BumpType, options: BumpOptions) {
  try {
    // Find config file
    const configPath = await resolveConfigPath(options.config);
    const configDir = dirname(configPath);
    const currentDir = process.cwd();
    const relativeToConfig = relative(configDir, currentDir);

    if (options.verbose) {
      console.log(`Configuration file: ${configPath}`);
      console.log(`Current directory: ${currentDir}`);
      console.log(`Relative path: ${relativeToConfig}`);
    }

    // Parse config
    const parser = new ConfigParser();
    const packages = await parser.parse(configPath);

    // Find packages for current directory
    const targetPackages = packages.filter((pkg) => {
      const pkgPath = pkg.path === '.' ? '' : pkg.path;
      return (
        pkgPath === relativeToConfig ||
        relativeToConfig.startsWith(pkgPath + '/') ||
        pkgPath.startsWith(relativeToConfig + '/')
      );
    });

    if (targetPackages.length === 0) {
      console.error(
        `❌ Error: No package found for current directory: ${relativeToConfig}`,
      );
      process.exit(1);
    }

    if (options.verbose) {
      console.log(`Found ${targetPackages.length} package(s) to bump`);
    }

    // Calculate new versions for all packages
    const bumpPlan = targetPackages.map(pkg => ({
      package: pkg,
      oldVersion: pkg.version,
      newVersion: bumpVersion(pkg.version, bumpType)
    }));

    // Show what will be changed
    console.log('\n📦 Packages to bump:\n');
    for (const plan of bumpPlan) {
      console.log(`  ${plan.package.name}`);
      console.log(`    📁 Path: ${plan.package.path}`);
      console.log(`    🔖 ${plan.oldVersion} → ${plan.newVersion} (${bumpType})\n`);
    }

    // Ask for confirmation
    if (!options.yes) {
      const shouldProceed = await confirm('Do you want to proceed?');
      if (!shouldProceed) {
        console.log('\n❌ Cancelled');
        process.exit(0);
      }
    }

    // Update toml file for all packages
    console.log('\n📝 Updating versions.toml...');
    for (const plan of bumpPlan) {
      await updateTomlVersion(configPath, plan.package.path, plan.newVersion);
    }
    console.log('✅ Updated versions.toml');

    // Apply version changes
    console.log('\n🚀 Applying version changes...');

    // Re-parse config with new versions
    let updatedPackages = await parser.parse(configPath);

    // Filter to only the target packages
    const targetNames = new Set(targetPackages.map(pkg => pkg.name));
    updatedPackages = updatedPackages.filter(pkg => targetNames.has(pkg.name));

    // Convert paths to absolute
    updatedPackages = updatedPackages.map((pkg) => ({
      ...pkg,
      path: pkg.path === '.' ? configDir : resolve(configDir, pkg.path),
    }));

    // Create observer and processor
    const observer = new ConsoleProgressObserver(false, true);
    const processor = new PackageProcessor(observer, false);

    // Process the package
    const summary = await processor.process(updatedPackages);

    if (summary.failed > 0) {
      process.exit(1);
    }

    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error(
      `\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    if (options.verbose && error instanceof Error) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(2);
  }
}

async function main() {
  const program = new Command();
  // Read package.json to get version
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf-8'),
  );

  program
    .name('apply-versions')
    .description(
      'A CLI tool for managing versions across multi-language monorepo projects',
    )
    .version(packageJson.version);

  // Default command (apply versions)
  program
    .command('apply', { isDefault: true })
    .description('Apply version changes from versions.toml')
    .option(
      '-c, --config <path>',
      'Path to versions.toml configuration file (default: search upwards from current directory)',
    )
    .option('-d, --dry-run', 'Preview changes without applying them', false)
    .option(
      '-y, --yes',
      'Skip confirmation prompt and proceed automatically',
      false,
    )
    .option(
      '-v, --verbose',
      'Show detailed output and debug information',
      false,
    )
    .option(
      '-p, --path <path>',
      'Only process packages under this path (relative to config file location)',
    )
    .action(async (options: CLIOptions) => {
      await handleApply(options);
    });

  // Bump command
  program
    .command('bump <type>')
    .description('Bump package version (major, minor, or patch)')
    .option(
      '-c, --config <path>',
      'Path to versions.toml configuration file (default: search upwards from current directory)',
    )
    .option(
      '-y, --yes',
      'Skip confirmation prompt and proceed automatically',
      false,
    )
    .option(
      '-v, --verbose',
      'Show detailed output and debug information',
      false,
    )
    .action(async (type: string, options: BumpOptions) => {
      if (!['major', 'minor', 'patch'].includes(type)) {
        console.error(`❌ Error: Invalid bump type: ${type}`);
        console.error('   Valid types: major, minor, patch');
        process.exit(1);
      }
      await handleBump(type as BumpType, options);
    });

  program.parse();
}

/**
 * Handle apply command
 */
async function handleApply(options: CLIOptions) {
  try {
    // Resolve config file path
    const configPath = await resolveConfigPath(options.config);
    const configDir = dirname(configPath);

    if (options.verbose) {
      console.log(`Configuration file: ${configPath}`);
      console.log(`Dry run: ${options.dryRun}`);
      console.log(`Auto-confirm: ${options.yes}`);
    }

    // Read and parse configuration
    const parser = new ConfigParser();
    let packages = await parser.parse(configPath);

    // Filter packages based on path options
    if (options.path) {
      // Manual path filtering
      packages = filterPackagesByPath(
        packages,
        configDir,
        options.path,
        options.verbose,
      );

      if (packages.length === 0) {
        throw new Error(`No packages found under path: ${options.path}`);
      }
    } else if (!options.config) {
      // Auto-filter when no config specified (found by searching upwards)
      packages = autoFilterPackages(packages, configDir, options.verbose);
    }

    // Convert relative paths to absolute paths for validation and processing
    packages = packages.map((pkg) => ({
      ...pkg,
      path: pkg.path === '.' ? configDir : resolve(configDir, pkg.path),
    }));

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
