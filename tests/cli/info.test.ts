import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('CLI - info current', () => {
  let testDir: string;
  let originalCwd: string;
  let cliPath: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    cliPath = join(originalCwd, 'dist/cli.js');
    testDir = mkdtempSync(join(tmpdir(), 'apply-versions-test-'));
  });

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should display current package info in table format', () => {
    // Create versions.toml
    const tomlContent = `
[[package]]
name = "my-app"
version = "1.0.0"
type = "npm"
path = "."
`;
    writeFileSync(join(testDir, 'versions.toml'), tomlContent);

    // Create package.json
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-app', version: '0.9.0' }, null, 2),
    );

    // Run info current command
    const result = execSync(`node ${cliPath} info current`, {
      cwd: testDir,
      encoding: 'utf8',
    });

    expect(result).toContain('Package Information from versions.toml');
    expect(result).toContain('my-app');
    expect(result).toContain('1.0.0');
    expect(result).toContain('npm');
  });

  it('should output JSON format with --json flag', () => {
    // Create versions.toml
    const tomlContent = `
[[package]]
name = "my-app"
version = "1.0.0"
type = "npm"
path = "."
`;
    writeFileSync(join(testDir, 'versions.toml'), tomlContent);

    // Create package.json
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-app', version: '0.9.0' }, null, 2),
    );

    // Run info current command with --json
    const result = execSync(`node ${cliPath} info current --json`, {
      cwd: testDir,
      encoding: 'utf8',
    });

    const json = JSON.parse(result);
    // Now returns array of all packages
    expect(json).toEqual([
      {
        name: 'my-app',
        version: '1.0.0',
        type: 'npm',
        path: '.',
      },
    ]);
  });

  it('should output all packages from versions.toml', () => {
    // Create versions.toml with multiple packages
    const tomlContent = `
[[package]]
name = "my-app"
version = "1.0.0"
type = "npm"
path = "."

[[package]]
name = "sub-package"
version = "2.0.0"
type = "npm"
path = "packages/sub"
`;
    writeFileSync(join(testDir, 'versions.toml'), tomlContent);

    // Create package.json
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-app', version: '0.9.0' }, null, 2),
    );

    // Run info current command with --json from root
    // Should show all packages
    const result = execSync(`node ${cliPath} info current --json`, {
      cwd: testDir,
      encoding: 'utf8',
    });

    const json = JSON.parse(result);
    // Should be an array with both packages
    expect(json).toHaveLength(2);
    expect(json[0].name).toBe('my-app');
    expect(json[1].name).toBe('sub-package');
  });

  it('should show error when versions.toml is empty', () => {
    // Create empty versions.toml
    const tomlContent = ``;
    writeFileSync(join(testDir, 'versions.toml'), tomlContent);

    // Run info current command from root
    try {
      execSync(`node ${cliPath} info current`, {
        cwd: testDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      // Exit code 2 for configuration/parsing errors
      expect(error.status).toBeGreaterThan(0);
      expect(error.stderr || error.stdout).toContain(
        'Failed to parse configuration',
      );
    }
  });

  it('should show error in JSON format when versions.toml is empty with --json', () => {
    // Create empty versions.toml
    const tomlContent = ``;
    writeFileSync(join(testDir, 'versions.toml'), tomlContent);

    // Run info current command with --json from root
    try {
      execSync(`node ${cliPath} info current --json`, {
        cwd: testDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      // Exit code 2 for configuration/parsing errors
      expect(error.status).toBeGreaterThan(0);
      const output = error.stderr || error.stdout;
      const json = JSON.parse(output);
      expect(json).toHaveProperty('error');
      expect(json.error).toContain('Failed to parse configuration');
    }
  });

  it('should use custom config file path', () => {
    // Create custom config file
    const tomlContent = `
[[package]]
name = "my-app"
version = "2.5.0"
type = "npm"
path = "."
`;
    writeFileSync(join(testDir, 'custom-versions.toml'), tomlContent);

    // Create package.json
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-app', version: '2.0.0' }, null, 2),
    );

    // Run info current command with custom config
    const result = execSync(
      `node ${cliPath} info current --config custom-versions.toml --json`,
      { cwd: testDir, encoding: 'utf8' },
    );

    const json = JSON.parse(result);
    expect(json[0].version).toBe('2.5.0');
  });

  it('should work from subdirectory', () => {
    // Create versions.toml
    const tomlContent = `
[[package]]
name = "root-app"
version = "1.0.0"
type = "npm"
path = "."

[[package]]
name = "sub-app"
version = "2.0.0"
type = "npm"
path = "packages/sub"
`;
    writeFileSync(join(testDir, 'versions.toml'), tomlContent);

    // Create subdirectory and package.json
    const subDir = join(testDir, 'packages', 'sub');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(
      join(subDir, 'package.json'),
      JSON.stringify({ name: 'sub-app', version: '1.5.0' }, null, 2),
    );

    // Run info current command from subdirectory
    // Now returns all packages, not just the current one
    const result = execSync(`node ${cliPath} info current --json`, {
      cwd: subDir,
      encoding: 'utf8',
    });

    const json = JSON.parse(result);
    // Returns array of all packages
    expect(json).toHaveLength(2);
    const subPackage = json.find((p: any) => p.name === 'sub-app');
    expect(subPackage).toBeDefined();
    expect(subPackage.version).toBe('2.0.0');
  });
});
