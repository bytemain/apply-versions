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

  it('should not create tags by default', () => {
    const shouldCreateTag = updater.shouldCreateTag(mockPackages.npm);
    expect(shouldCreateTag).toBe(false);
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
      expect(result.error).toContain('npm install failed');
    }
  });
});
