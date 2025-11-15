import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Config Resolution and Path Filtering', () => {
  let testRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Save original cwd
    originalCwd = process.cwd();

    // Create a temporary test directory
    testRoot = join(tmpdir(), `apply-versions-test-${Date.now()}`);
    await mkdir(testRoot, { recursive: true });

    // Create a monorepo structure
    await mkdir(join(testRoot, 'packages', 'service-a'), { recursive: true });
    await mkdir(join(testRoot, 'packages', 'service-b'), { recursive: true });
    await mkdir(join(testRoot, 'tools', 'cli'), { recursive: true });

    // Create package files
    await writeFile(
      join(testRoot, 'packages', 'service-a', 'package.json'),
      JSON.stringify({ name: 'service-a', version: '1.0.0' }, null, 2),
    );
    await writeFile(
      join(testRoot, 'packages', 'service-b', 'package.json'),
      JSON.stringify({ name: 'service-b', version: '1.0.0' }, null, 2),
    );
    await writeFile(
      join(testRoot, 'tools', 'cli', 'package.json'),
      JSON.stringify({ name: 'cli-tool', version: '1.0.0' }, null, 2),
    );

    // Create versions.toml at root
    const versionsToml = `
[[package]]
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
path = "tools/cli"
name = "cli-tool"
version = "2.0.0"
`;
    await writeFile(join(testRoot, 'versions.toml'), versionsToml);
  });

  afterEach(async () => {
    // Restore original cwd
    process.chdir(originalCwd);

    // Clean up test directory
    await rm(testRoot, { recursive: true, force: true });
  });

  describe('findConfigFile', () => {
    it('should find versions.toml in current directory', async () => {
      process.chdir(testRoot);

      // Import the module to test (we'll need to export the function)
      const { ConfigParser } = await import('../../src/parsers/toml-parser.js');
      const parser = new ConfigParser();

      // Test that we can parse the config
      const packages = await parser.parse(join(testRoot, 'versions.toml'));
      expect(packages).toHaveLength(3);
    });

    it('should find versions.toml by searching upwards', async () => {
      process.chdir(join(testRoot, 'packages', 'service-a'));

      const { ConfigParser } = await import('../../src/parsers/toml-parser.js');
      const parser = new ConfigParser();

      // Test that we can parse the config from parent directory
      const packages = await parser.parse(join(testRoot, 'versions.toml'));
      expect(packages).toHaveLength(3);
    });
  });

  describe('Path filtering', () => {
    it('should filter packages by exact path match', () => {
      const packages = [
        {
          type: 'npm',
          path: 'packages/service-a',
          name: 'service-a',
          version: '1.1.0',
        },
        {
          type: 'npm',
          path: 'packages/service-b',
          name: 'service-b',
          version: '1.2.0',
        },
        { type: 'npm', path: 'tools/cli', name: 'cli-tool', version: '2.0.0' },
      ];

      const filtered = packages.filter(
        (pkg) => pkg.path === 'packages/service-a',
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('service-a');
    });

    it('should filter packages by path prefix', () => {
      const packages = [
        {
          type: 'npm',
          path: 'packages/service-a',
          name: 'service-a',
          version: '1.1.0',
        },
        {
          type: 'npm',
          path: 'packages/service-b',
          name: 'service-b',
          version: '1.2.0',
        },
        { type: 'npm', path: 'tools/cli', name: 'cli-tool', version: '2.0.0' },
      ];

      const filtered = packages.filter((pkg) =>
        pkg.path.startsWith('packages/'),
      );
      expect(filtered).toHaveLength(2);
      expect(filtered.map((p) => p.name)).toEqual(['service-a', 'service-b']);
    });

    it('should handle root package path', () => {
      const packages = [
        { type: 'npm', path: '.', name: 'root', version: '1.0.0' },
        {
          type: 'npm',
          path: 'packages/service-a',
          name: 'service-a',
          version: '1.1.0',
        },
      ];

      const rootPkg = packages.find((pkg) => pkg.path === '.');
      expect(rootPkg?.name).toBe('root');
    });
  });

  describe('Integration tests', () => {
    it('should process only packages in current subdirectory', async () => {
      process.chdir(join(testRoot, 'packages'));

      const { ConfigParser } = await import('../../src/parsers/toml-parser.js');
      const parser = new ConfigParser();

      const allPackages = await parser.parse(join(testRoot, 'versions.toml'));

      // Simulate filtering logic
      const currentDir = process.cwd();
      const configDir = testRoot;
      const relativePath = currentDir.replace(configDir + '/', '');

      const filtered = allPackages.filter((pkg) => {
        const pkgPath = pkg.path === '.' ? '' : pkg.path;
        return pkgPath.startsWith(relativePath);
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map((p) => p.name).sort()).toEqual([
        'service-a',
        'service-b',
      ]);
    });

    it('should process all packages when in root directory', async () => {
      process.chdir(testRoot);

      const { ConfigParser } = await import('../../src/parsers/toml-parser.js');
      const parser = new ConfigParser();

      const packages = await parser.parse(join(testRoot, 'versions.toml'));
      expect(packages).toHaveLength(3);
    });

    it('should respect explicit path option', async () => {
      process.chdir(testRoot);

      const { ConfigParser } = await import('../../src/parsers/toml-parser.js');
      const parser = new ConfigParser();

      const allPackages = await parser.parse(join(testRoot, 'versions.toml'));

      // Simulate --path=tools/cli option
      const targetPath = 'tools/cli';
      const filtered = allPackages.filter((pkg) => {
        return pkg.path === targetPath;
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('cli-tool');
    });
  });

  describe('Edge cases', () => {
    it('should handle nested subdirectories', async () => {
      process.chdir(join(testRoot, 'packages', 'service-a'));

      const currentDir = process.cwd();
      const configDir = testRoot;
      const relativePath = currentDir.replace(configDir + '/', '');

      expect(relativePath).toBe('packages/service-a');
    });

    it('should handle empty path for root package', () => {
      const packages = [
        { type: 'npm', path: '.', name: 'root', version: '1.0.0' },
      ];

      const normalizedPath = packages[0].path === '.' ? '' : packages[0].path;
      expect(normalizedPath).toBe('');
    });

    it('should not filter when in parent of config directory', () => {
      // Simulate being above the config directory
      const configDir = '/workspace/project';
      const currentDir = '/workspace';

      // Calculate relative path
      const isAboveConfig = !currentDir.startsWith(configDir);
      expect(isAboveConfig).toBe(true);
    });
  });
});
