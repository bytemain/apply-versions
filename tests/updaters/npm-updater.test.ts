// NPM package updater tests

import { spawn } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NpmPackageUpdater } from '../../src/updaters/npm-updater.js';
import { MockFileRepository, mockFiles, mockPackages } from '../test-utils.js';

// Mock child_process.spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

describe('NpmPackageUpdater', () => {
  let updater: NpmPackageUpdater;
  let mockFileRepo: MockFileRepository;

  beforeEach(() => {
    updater = new NpmPackageUpdater();
    mockFileRepo = new MockFileRepository();
    // Replace the file repository with our mock
    (updater as any).fileRepo = mockFileRepo;

    // Clear previous mock calls
    mockSpawn.mockClear();

    // Setup successful npm install mock
    mockSpawn.mockImplementation(() => {
      const mockProcess = {
        stdin: null,
        stdout: null,
        stderr: null,
        stdio: [],
        pid: 12345,
        connected: true,
        killed: false,
        exitCode: null,
        signalCode: null,
        spawnargs: [],
        spawnfile: '',
        kill: vi.fn(),
        send: vi.fn(),
        disconnect: vi.fn(),
        unref: vi.fn(),
        ref: vi.fn(),
        addListener: vi.fn(),
        emit: vi.fn(),
        eventNames: vi.fn(),
        getMaxListeners: vi.fn(),
        listenerCount: vi.fn(),
        listeners: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        prependListener: vi.fn(),
        prependOnceListener: vi.fn(),
        rawListeners: vi.fn(),
        removeAllListeners: vi.fn(),
        removeListener: vi.fn(),
        setMaxListeners: vi.fn(),
        on: vi.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            // Simulate successful npm install
            setTimeout(() => callback(0), 0);
          }
        }),
      };
      return mockProcess as any;
    });
  });

  it('should have correct type', () => {
    expect(updater.type).toBe('npm');
  });

  it('should get correct package file path', () => {
    const path = updater.getPackageFilePath('packages/web');
    expect(path).toBe('packages/web/package.json');
  });

  it('should validate package existence', async () => {
    mockFileRepo.setFile('packages/web/package.json', mockFiles.packageJson);

    const exists = await updater.validatePackage('packages/web');
    expect(exists).toBe(true);
  });

  it('should return false for non-existent package', async () => {
    const exists = await updater.validatePackage('nonexistent/path');
    expect(exists).toBe(false);
  });

  it('should read version from package.json', async () => {
    mockFileRepo.setFile('packages/web/package.json', mockFiles.packageJson);

    const version = await updater.readVersion('packages/web');
    expect(version).toBe('1.0.0');
  });

  it('should throw error for package.json without version', async () => {
    const packageJsonWithoutVersion = JSON.stringify(
      {
        name: '@myorg/web',
        dependencies: {},
      },
      null,
      2,
    );
    mockFileRepo.setFile(
      'packages/web/package.json',
      packageJsonWithoutVersion,
    );

    await expect(updater.readVersion('packages/web')).rejects.toThrow(
      'No version field found in packages/web/package.json',
    );
  });

  it('should update version in package.json', async () => {
    mockFileRepo.setFile('packages/web/package.json', mockFiles.packageJson);

    const result = await updater.updateVersion('packages/web', '2.0.0', false);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.oldVersion).toBe('1.0.0');
      expect(result.newVersion).toBe('2.0.0');
    }

    const updatedContent = mockFileRepo.getFileContent(
      'packages/web/package.json',
    );
    const updatedPackage = JSON.parse(updatedContent!);
    expect(updatedPackage.version).toBe('2.0.0');
    expect(updatedPackage.name).toBe('@myorg/web'); // Other fields preserved

    // Should have called npm install
    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install'], {
      cwd: 'packages/web',
      stdio: 'inherit',
    });
  });

  it('should handle dry run mode', async () => {
    mockFileRepo.setFile('packages/web/package.json', mockFiles.packageJson);

    const result = await updater.updateVersion('packages/web', '2.0.0', true);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.oldVersion).toBe('1.0.0');
      expect(result.newVersion).toBe('2.0.0');
    }

    // File should not be modified in dry run
    const content = mockFileRepo.getFileContent('packages/web/package.json');
    const pkg = JSON.parse(content!);
    expect(pkg.version).toBe('1.0.0');

    // Should NOT have called npm install in dry run mode
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should create tags by default', () => {
    const shouldCreateTag = updater.shouldCreateTag(mockPackages.npm);
    expect(shouldCreateTag).toBe(true);
  });

  it('should respect create_tag config when set to false', () => {
    const pkg = { ...mockPackages.npm, create_tag: false };
    const shouldCreateTag = updater.shouldCreateTag(pkg);
    expect(shouldCreateTag).toBe(false);
  });

  it('should respect create_tag config when set to true', () => {
    const pkg = { ...mockPackages.npm, create_tag: true };
    const shouldCreateTag = updater.shouldCreateTag(pkg);
    expect(shouldCreateTag).toBe(true);
  });

  it('should generate simple tag name', () => {
    const tagName = updater.getTagName(mockPackages.npm);
    expect(tagName).toBe('v1.2.3');
  });

  it('should handle file read errors', async () => {
    // File doesn't exist, should return failure result
    const result = await updater.updateVersion('nonexistent', '1.0.0', false);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('ENOENT');
    }
  });

  it('should handle invalid JSON', async () => {
    mockFileRepo.setFile('packages/web/package.json', 'invalid json {{{');

    const result = await updater.updateVersion('packages/web', '1.0.0', false);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('JSON');
    }
  });

  it('should preserve formatting in package.json', async () => {
    const originalJson =
      JSON.stringify(
        {
          name: '@myorg/web',
          version: '1.0.0',
          dependencies: {
            react: '^18.0.0',
          },
        },
        null,
        2,
      ) + '\n';

    mockFileRepo.setFile('packages/web/package.json', originalJson);

    await updater.updateVersion('packages/web', '2.0.0', false);

    const updatedContent = mockFileRepo.getFileContent(
      'packages/web/package.json',
    )!;

    // Should have proper formatting (2 spaces, trailing newline)
    expect(updatedContent).toMatch(/^\{[\s\S]*\}\n$/);
    expect(updatedContent).toContain('  "version": "2.0.0"');

    const parsed = JSON.parse(updatedContent);
    expect(parsed.version).toBe('2.0.0');
    expect(parsed.dependencies.react).toBe('^18.0.0');

    // Should have called npm install
    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install'], {
      cwd: 'packages/web',
      stdio: 'inherit',
    });
  });

  it('should handle npm install failure', async () => {
    mockFileRepo.setFile('packages/web/package.json', mockFiles.packageJson);

    // Mock failed npm install
    mockSpawn.mockImplementationOnce(() => {
      const mockProcess = {
        stdin: null,
        stdout: null,
        stderr: null,
        stdio: [],
        pid: 12345,
        connected: true,
        killed: false,
        exitCode: null,
        signalCode: null,
        spawnargs: [],
        spawnfile: '',
        kill: vi.fn(),
        send: vi.fn(),
        disconnect: vi.fn(),
        unref: vi.fn(),
        ref: vi.fn(),
        addListener: vi.fn(),
        emit: vi.fn(),
        eventNames: vi.fn(),
        getMaxListeners: vi.fn(),
        listenerCount: vi.fn(),
        listeners: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        prependListener: vi.fn(),
        prependOnceListener: vi.fn(),
        rawListeners: vi.fn(),
        removeAllListeners: vi.fn(),
        removeListener: vi.fn(),
        setMaxListeners: vi.fn(),
        on: vi.fn((event: string, callback: (code?: number) => void) => {
          if (event === 'close') {
            // Simulate failed npm install
            setTimeout(() => callback(1), 0);
          }
        }),
      };
      return mockProcess as any;
    });

    const result = await updater.updateVersion('packages/web', '2.0.0', false);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('failed with exit code');
    }
  });

  describe('workspace mode', () => {
    function makeSuccessSpawn() {
      return vi.fn(() => {
        const mockProcess: any = {
          on: vi.fn((event: string, callback: (code?: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 0);
            }
          }),
        };
        return mockProcess;
      });
    }

    function setRootPackageJson(
      repo: MockFileRepository,
      pkg: Record<string, unknown>,
    ) {
      repo.setFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
    }

    function setMember(
      repo: MockFileRepository,
      path: string,
      pkg: Record<string, unknown>,
    ) {
      repo.setFile(`${path}/package.json`, `${JSON.stringify(pkg, null, 2)}\n`);
    }

    it('detects yarn workspace and updates sibling deps in same atomic commit', async () => {
      setRootPackageJson(mockFileRepo, {
        name: 'root',
        private: true,
        workspaces: ['packages/*'],
        packageManager: 'yarn@4.0.2',
      });
      setMember(mockFileRepo, 'packages/core', {
        name: '@myorg/core',
        version: '1.0.0',
      });
      setMember(mockFileRepo, 'packages/app', {
        name: '@myorg/app',
        version: '1.0.0',
        dependencies: { '@myorg/core': '^1.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      });
      setMember(mockFileRepo, 'packages/lib', {
        name: '@myorg/lib',
        version: '0.5.0',
        peerDependencies: { '@myorg/core': '~1.0.0' },
        optionalDependencies: { '@myorg/core': '>=1.0.0' },
      });

      mockSpawn.mockImplementation(makeSuccessSpawn() as any);

      const result = await updater.updateVersion(
        'packages/core',
        '2.0.0',
        false,
      );

      expect(result.success).toBe(true);
      // No per-package npm install should run during updateVersion in workspace mode
      expect(mockSpawn).not.toHaveBeenCalled();

      const appPkg = JSON.parse(
        mockFileRepo.getFileContent('packages/app/package.json')!,
      );
      expect(appPkg.dependencies['@myorg/core']).toBe('^2.0.0');
      // Unrelated deps untouched
      expect(appPkg.devDependencies.typescript).toBe('^5.0.0');

      const libPkg = JSON.parse(
        mockFileRepo.getFileContent('packages/lib/package.json')!,
      );
      expect(libPkg.peerDependencies['@myorg/core']).toBe('~2.0.0');
      expect(libPkg.optionalDependencies['@myorg/core']).toBe('>=2.0.0');

      // The bumped package itself
      const corePkg = JSON.parse(
        mockFileRepo.getFileContent('packages/core/package.json')!,
      );
      expect(corePkg.version).toBe('2.0.0');

      // Updated sibling files are returned for the atomic commit, but not
      // the package's own package.json (that's the primary file)
      if (result.success) {
        const additional = result.additionalFiles ?? [];
        expect(additional).toEqual(
          expect.arrayContaining([
            'packages/app/package.json',
            'packages/lib/package.json',
          ]),
        );
        // Lockfile should NOT be in per-package commit in workspace mode
        expect(additional).not.toContain('packages/core/package-lock.json');
      }
    });

    it('skips workspace:/file:/link:/git/tag/wildcard ranges', async () => {
      setRootPackageJson(mockFileRepo, {
        name: 'root',
        private: true,
        workspaces: ['packages/*'],
      });
      setMember(mockFileRepo, 'packages/core', {
        name: '@myorg/core',
        version: '1.0.0',
      });
      setMember(mockFileRepo, 'packages/app', {
        name: '@myorg/app',
        version: '1.0.0',
        dependencies: {
          '@myorg/core': 'workspace:^',
        },
        devDependencies: {
          '@myorg/core': 'file:../core',
        },
        peerDependencies: {
          '@myorg/core': '*',
        },
        optionalDependencies: {
          '@myorg/core': 'latest',
        },
      });

      mockSpawn.mockImplementation(makeSuccessSpawn() as any);

      const result = await updater.updateVersion(
        'packages/core',
        '2.0.0',
        false,
      );

      expect(result.success).toBe(true);
      const appPkg = JSON.parse(
        mockFileRepo.getFileContent('packages/app/package.json')!,
      );
      expect(appPkg.dependencies['@myorg/core']).toBe('workspace:^');
      expect(appPkg.devDependencies['@myorg/core']).toBe('file:../core');
      expect(appPkg.peerDependencies['@myorg/core']).toBe('*');
      expect(appPkg.optionalDependencies['@myorg/core']).toBe('latest');
      if (result.success) {
        // No sibling updates means no extra files staged
        expect(result.additionalFiles ?? []).toEqual([]);
      }
    });

    it('dry run does not write files or run install', async () => {
      setRootPackageJson(mockFileRepo, {
        name: 'root',
        private: true,
        workspaces: ['packages/*'],
        packageManager: 'pnpm@9.0.0',
      });
      setMember(mockFileRepo, 'packages/core', {
        name: '@myorg/core',
        version: '1.0.0',
      });
      setMember(mockFileRepo, 'packages/app', {
        name: '@myorg/app',
        version: '1.0.0',
        dependencies: { '@myorg/core': '^1.0.0' },
      });

      mockSpawn.mockImplementation(makeSuccessSpawn() as any);

      const result = await updater.updateVersion(
        'packages/core',
        '2.0.0',
        true,
      );

      expect(result.success).toBe(true);
      expect(mockSpawn).not.toHaveBeenCalled();

      const corePkg = JSON.parse(
        mockFileRepo.getFileContent('packages/core/package.json')!,
      );
      expect(corePkg.version).toBe('1.0.0');
      const appPkg = JSON.parse(
        mockFileRepo.getFileContent('packages/app/package.json')!,
      );
      expect(appPkg.dependencies['@myorg/core']).toBe('^1.0.0');

      await updater.finalize(true);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('finalize runs single root install with detected package manager', async () => {
      setRootPackageJson(mockFileRepo, {
        name: 'root',
        private: true,
        workspaces: { packages: ['packages/*'] },
        packageManager: 'yarn@4.0.2',
      });
      setMember(mockFileRepo, 'packages/core', {
        name: '@myorg/core',
        version: '1.0.0',
      });
      setMember(mockFileRepo, 'packages/app', {
        name: '@myorg/app',
        version: '1.0.0',
        dependencies: { '@myorg/core': '^1.0.0' },
      });

      mockSpawn.mockImplementation(makeSuccessSpawn() as any);

      const result = await updater.updateVersion(
        'packages/core',
        '1.1.0',
        false,
      );
      expect(result.success).toBe(true);
      expect(mockSpawn).not.toHaveBeenCalled();

      await updater.finalize(false);

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const callArgs = mockSpawn.mock.calls[0];
      expect(callArgs[0]).toBe('yarn');
      expect(callArgs[1]).toEqual(['install']);
      expect((callArgs[2] as any).cwd).toBe('.');

      // Subsequent finalize call should be a no-op
      mockSpawn.mockClear();
      await updater.finalize(false);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('falls back to npm when packageManager is missing', async () => {
      setRootPackageJson(mockFileRepo, {
        name: 'root',
        private: true,
        workspaces: ['packages/*'],
      });
      setMember(mockFileRepo, 'packages/core', {
        name: '@myorg/core',
        version: '1.0.0',
      });

      mockSpawn.mockImplementation(makeSuccessSpawn() as any);

      await updater.updateVersion('packages/core', '1.1.0', false);
      await updater.finalize(false);

      expect(mockSpawn).toHaveBeenCalledWith(
        'npm',
        ['install'],
        expect.objectContaining({ cwd: '.' }),
      );
    });

    it('detects pnpm workspace via packageManager', async () => {
      setRootPackageJson(mockFileRepo, {
        name: 'root',
        private: true,
        workspaces: ['packages/*'],
        packageManager: 'pnpm@9.1.0',
      });
      setMember(mockFileRepo, 'packages/core', {
        name: '@myorg/core',
        version: '1.0.0',
      });

      mockSpawn.mockImplementation(makeSuccessSpawn() as any);

      await updater.updateVersion('packages/core', '1.1.0', false);
      await updater.finalize(false);

      expect(mockSpawn).toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.anything(),
      );
    });
  });
});
