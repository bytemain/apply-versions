import { execSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('CLI apply output filtering', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `apply-versions-output-${Date.now()}`);

    await mkdir(join(testDir, 'packages/go-service'), { recursive: true });
    await mkdir(join(testDir, 'packages/node-service'), { recursive: true });

    await writeFile(
      join(testDir, 'packages/go-service/package.json'),
      JSON.stringify({ name: 'go-service', version: '1.0.0' }, null, 2),
    );
    await writeFile(
      join(testDir, 'packages/node-service/package.json'),
      JSON.stringify({ name: 'node-service', version: '2.0.0' }, null, 2),
    );

    const versionsToml = `[[package]]
type = "npm"
path = "packages/go-service"
name = "go-service"
version = "1.1.0"

[[package]]
type = "npm"
path = "packages/node-service"
name = "node-service"
version = "2.0.0"
`;
    await writeFile(join(testDir, 'versions.toml'), versionsToml);

    process.chdir(testDir);
    execSync('git init', { stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { stdio: 'ignore' });
    execSync('git config user.name "Test User"', { stdio: 'ignore' });
    execSync('git add .', { stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { stdio: 'ignore' });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(testDir, { recursive: true, force: true });
  });

  it('should hide skipped packages by default', () => {
    process.chdir(testDir);

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run`,
      { encoding: 'utf-8' },
    );

    expect(output).toContain('go-service');
    expect(output).not.toContain('node-service');
    expect(output).not.toContain('already at target version');
    expect(output).not.toContain('packages skipped');
  });

  it('should show skipped packages when verbose', () => {
    process.chdir(testDir);

    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run --verbose`,
      { encoding: 'utf-8' },
    );

    expect(output).toContain('go-service');
    expect(output).toContain('node-service');
    expect(output).toContain('already at target version');
    expect(output).toContain('packages skipped');
  });
});
