import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

describe('CLI bump command', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `apply-versions-bump-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create monorepo structure
    await mkdir(join(testDir, 'packages/service-a'), { recursive: true });
    await mkdir(join(testDir, 'packages/service-b'), { recursive: true });

    // Create package.json files
    await writeFile(
      join(testDir, 'packages/service-a/package.json'),
      JSON.stringify({ name: 'service-a', version: '1.0.0' }, null, 2),
    );
    await writeFile(
      join(testDir, 'packages/service-b/package.json'),
      JSON.stringify({ name: 'service-b', version: '2.0.0' }, null, 2),
    );

    // Create versions.toml
    const versionsToml = `[[package]]
type = "npm"
path = "packages/service-a"
name = "service-a"
version = "1.0.0"

[[package]]
type = "npm"
path = "packages/service-b"
name = "service-b"
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
    process.chdir(originalCwd);
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should bump patch version with --yes flag', async () => {
    process.chdir(join(testDir, 'packages/service-a'));

    execSync(`node ${join(originalCwd, 'dist/cli.js')} bump patch --yes`, {
      encoding: 'utf-8',
    });

    // Check that versions.toml was updated
    const tomlContent = await readFile(join(testDir, 'versions.toml'), 'utf-8');
    expect(tomlContent).toContain('version = "1.0.1"');

    // Check that package.json was updated
    const pkgContent = await readFile(
      join(testDir, 'packages/service-a/package.json'),
      'utf-8',
    );
    const pkg = JSON.parse(pkgContent);
    expect(pkg.version).toBe('1.0.1');
  });

  it('should bump minor version with --yes flag', async () => {
    process.chdir(join(testDir, 'packages/service-a'));

    execSync(`node ${join(originalCwd, 'dist/cli.js')} bump minor --yes`, {
      encoding: 'utf-8',
    });

    // Check that versions.toml was updated
    const tomlContent = await readFile(join(testDir, 'versions.toml'), 'utf-8');
    expect(tomlContent).toContain('version = "1.1.0"');

    // Check that package.json was updated
    const pkgContent = await readFile(
      join(testDir, 'packages/service-a/package.json'),
      'utf-8',
    );
    const pkg = JSON.parse(pkgContent);
    expect(pkg.version).toBe('1.1.0');
  });

  it('should bump major version with --yes flag', async () => {
    process.chdir(join(testDir, 'packages/service-a'));

    execSync(`node ${join(originalCwd, 'dist/cli.js')} bump major --yes`, {
      encoding: 'utf-8',
    });

    // Check that versions.toml was updated
    const tomlContent = await readFile(join(testDir, 'versions.toml'), 'utf-8');
    expect(tomlContent).toContain('version = "2.0.0"');

    // Check that package.json was updated
    const pkgContent = await readFile(
      join(testDir, 'packages/service-a/package.json'),
      'utf-8',
    );
    const pkg = JSON.parse(pkgContent);
    expect(pkg.version).toBe('2.0.0');
  });

  it('should error when not in a package directory', async () => {
    process.chdir(testDir);

    expect(() => {
      execSync(`node ${join(originalCwd, 'dist/cli.js')} bump patch --yes`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();
  });

  it('should handle multiple packages in same directory', async () => {
    process.chdir(join(testDir, 'packages'));

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} bump patch --yes`,
      { encoding: 'utf-8' },
    );

    // Should bump both packages
    expect(output).toContain('service-a');
    expect(output).toContain('service-b');

    const tomlContent = await readFile(join(testDir, 'versions.toml'), 'utf-8');
    expect(tomlContent).toContain('version = "1.0.1"'); // service-a
    expect(tomlContent).toContain('version = "2.0.1"'); // service-b
  });

  it('should preserve other fields in versions.toml', async () => {
    // Add a comment and other packages
    const versionsToml = `# Project configuration
[[package]]
type = "npm"
path = "packages/service-a"
name = "service-a"
version = "1.0.0"

[[package]]
type = "npm"
path = "packages/service-b"
name = "service-b"
version = "2.0.0"
`;
    await writeFile(join(testDir, 'versions.toml'), versionsToml);

    process.chdir(join(testDir, 'packages/service-a'));

    execSync(`node ${join(originalCwd, 'dist/cli.js')} bump patch --yes`, {
      encoding: 'utf-8',
    });

    const tomlContent = await readFile(join(testDir, 'versions.toml'), 'utf-8');

    // Comment should be preserved
    expect(tomlContent).toContain('# Project configuration');

    // service-b should remain unchanged
    expect(tomlContent).toMatch(/name = "service-b"[\s\S]*version = "2\.0\.0"/);

    // service-a should be bumped
    expect(tomlContent).toMatch(/name = "service-a"[\s\S]*version = "1\.0\.1"/);
  });

  it('should show preview without --yes flag', async () => {
    process.chdir(join(testDir, 'packages/service-a'));

    const output = execSync(
      `echo "n" | node ${join(originalCwd, 'dist/cli.js')} bump patch`,
      { encoding: 'utf-8', shell: '/bin/bash' },
    );

    expect(output).toContain('1.0.0');
    expect(output).toContain('1.0.1');

    // versions.toml should NOT be updated
    const tomlContent = await readFile(join(testDir, 'versions.toml'), 'utf-8');
    expect(tomlContent).toContain('version = "1.0.0"');
  });
});
