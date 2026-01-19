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

    await mkdir(join(testDir, 'packages/node-app'), { recursive: true });
    await mkdir(join(testDir, 'packages/node-lib'), { recursive: true });

    await writeFile(
      join(testDir, 'packages/node-app/package.json'),
      JSON.stringify({ name: 'node-app', version: '1.0.0' }, null, 2),
    );
    await writeFile(
      join(testDir, 'packages/node-lib/package.json'),
      JSON.stringify({ name: 'node-lib', version: '2.0.0' }, null, 2),
    );

    const versionsToml = `[[package]]
type = "npm"
path = "packages/node-app"
name = "node-app"
version = "1.1.0"

[[package]]
type = "npm"
path = "packages/node-lib"
name = "node-lib"
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
    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run`,
      { encoding: 'utf-8' },
    );

    expect(output).toContain('node-app');
    expect(output).not.toContain('node-lib');
    expect(output).not.toContain('already at target version');
    expect(output).not.toContain('packages skipped');
  });

  it('should show skipped packages when verbose', () => {
    const output = execSync(
      `node ${join(originalCwd, 'dist/cli.js')} --dry-run --verbose`,
      { encoding: 'utf-8' },
    );

    expect(output).toContain('node-app');
    expect(output).toContain('node-lib');
    expect(output).toContain('already at target version');
    expect(output).toContain('packages skipped');
  });
});
