import { execSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('CLI subdirectory execution', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Save original working directory
    originalCwd = process.cwd();

    // Create temporary test directory
    testDir = join(tmpdir(), `apply-versions-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create monorepo structure
    await mkdir(join(testDir, 'packages/service-a'), { recursive: true });
    await mkdir(join(testDir, 'packages/service-b'), { recursive: true });
    await mkdir(join(testDir, 'tools'), { recursive: true });

    // Create package.json files
    await writeFile(
      join(testDir, 'packages/service-a/package.json'),
      JSON.stringify({ name: 'service-a', version: '1.0.0' }, null, 2),
    );
    await writeFile(
      join(testDir, 'packages/service-b/package.json'),
      JSON.stringify({ name: 'service-b', version: '1.0.0' }, null, 2),
    );
    await writeFile(
      join(testDir, 'tools/package.json'),
      JSON.stringify({ name: 'tools', version: '1.0.0' }, null, 2),
    );

    // Create versions.toml
    const versionsToml = `[[package]]
type = "npm"
path = "packages/service-a"
name = "service-a"
version = "1.1.0"

[[package]]
type = "npm"
path = "packages/service-b"
name = "service-b"
version = "1.2.0"

[[package]]
type = "npm"
path = "tools"
name = "tools"
version = "2.0.0"
`;
    await writeFile(join(testDir, 'versions.toml'), versionsToml);

    // Initialize git repository
    process.chdir(testDir);
    execSync('git init', { stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { stdio: 'ignore' });
    execSync('git config user.name "Test User"', { stdio: 'ignore' });
    execSync('git add .', { stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { stdio: 'ignore' });
  });

  afterEach(async () => {
    // Restore original working directory
    process.chdir(originalCwd);

    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should process all packages from root directory', () => {
    process.chdir(testDir);

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run`,
      { encoding: 'utf-8' },
    );

    // Should process all 3 packages
    expect(output).toContain('service-a');
    expect(output).toContain('service-b');
    expect(output).toContain('tools');
    expect(output).toContain('3 packages will be updated');
  });

  it('should auto-filter packages from packages subdirectory', () => {
    process.chdir(join(testDir, 'packages'));

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run`,
      { encoding: 'utf-8' },
    );

    // Should only process service-a and service-b
    expect(output).toContain('service-a');
    expect(output).toContain('service-b');
    expect(output).not.toContain('tools');
    expect(output).toContain('2 packages will be updated');
  });

  it('should auto-filter single package from nested subdirectory', () => {
    process.chdir(join(testDir, 'packages/service-a'));

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run`,
      { encoding: 'utf-8' },
    );

    // Should only process service-a
    expect(output).toContain('service-a');
    expect(output).not.toContain('service-b');
    expect(output).not.toContain('tools');
    expect(output).toContain('1 packages will be updated');
  });

  it('should filter by --path option from root directory', () => {
    process.chdir(testDir);

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run --path tools`,
      { encoding: 'utf-8' },
    );

    // Should only process tools
    expect(output).not.toContain('service-a');
    expect(output).not.toContain('service-b');
    expect(output).toContain('tools');
    expect(output).toContain('1 packages will be updated');
  });

  it('should filter by --path option for packages directory', () => {
    process.chdir(testDir);

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run --path packages`,
      { encoding: 'utf-8' },
    );

    // Should process both services
    expect(output).toContain('service-a');
    expect(output).toContain('service-b');
    expect(output).not.toContain('tools');
    expect(output).toContain('2 packages will be updated');
  });

  it('should not auto-filter when using -c option explicitly', () => {
    process.chdir(join(testDir, 'packages'));

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run -c ${join(testDir, 'versions.toml')}`,
      { encoding: 'utf-8' },
    );

    // Should process all packages (no auto-filter when -c is used)
    expect(output).toContain('service-a');
    expect(output).toContain('service-b');
    expect(output).toContain('tools');
    expect(output).toContain('3 packages will be updated');
  });

  it('should show verbose filtering info with --verbose flag', () => {
    process.chdir(join(testDir, 'packages'));

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run --verbose`,
      { encoding: 'utf-8' },
    );

    // Should show auto-filtering messages
    expect(output).toContain('Auto-filtering packages under: packages');
    expect(output).toContain('Auto-including package: service-a');
    expect(output).toContain('Auto-including package: service-b');
  });

  it('should handle --path with relative paths from subdirectory', () => {
    process.chdir(join(testDir, 'packages'));

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run --path service-a`,
      { encoding: 'utf-8' },
    );

    // Should only process service-a
    expect(output).toContain('service-a');
    expect(output).not.toContain('service-b');
    expect(output).not.toContain('tools');
    expect(output).toContain('1 packages will be updated');
  });

  it('should error when --path points to non-existent package', () => {
    process.chdir(testDir);

    expect(() => {
      execSync(
        `node ${join(originalCwd, 'dist/cli.js')} --dry-run --path nonexistent`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
    }).toThrow();
  });

  it('should find config file when executed from deeply nested directory', async () => {
    // Create a deeply nested directory
    const deepDir = join(testDir, 'packages/service-a/src/components');
    await mkdir(deepDir, { recursive: true });
    process.chdir(deepDir);

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run`,
      { encoding: 'utf-8' },
    );

    // Should find config and process service-a
    expect(output).toContain('service-a');
    expect(output).toContain('1 packages will be updated');
  });

  it('should error when no config file found', async () => {
    // Create isolated directory without versions.toml
    const isolatedDir = join(tmpdir(), `isolated-${Date.now()}`);
    await mkdir(isolatedDir, { recursive: true });
    process.chdir(isolatedDir);

    try {
      expect(() => {
        execSync(`node ${join(originalCwd, 'dist/cli.js')} --dry-run`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
      }).toThrow();
    } finally {
      await rm(isolatedDir, { recursive: true, force: true });
    }
  });
});
