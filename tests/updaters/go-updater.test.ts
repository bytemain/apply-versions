// Go package updater tests

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoPackageUpdater } from '../../src/updaters/go-updater.js';
import { MockFileRepository, mockFiles, mockPackages } from '../test-utils.js';

// Mock simple-git
const mockGit = {
  tags: vi.fn(),
  revparse: vi.fn(),
  fetch: vi.fn(),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit),
}));

describe('GoPackageUpdater', () => {
  let updater: GoPackageUpdater;
  let mockFileRepo: MockFileRepository;

  beforeEach(() => {
    updater = new GoPackageUpdater();
    mockFileRepo = new MockFileRepository();
    // Replace the file repository with our mock
    (updater as any).fileRepo = mockFileRepo;
    // Clear all mocks
    vi.clearAllMocks();
    // Default mock for git root - use empty string to simulate running from git root
    mockGit.revparse.mockResolvedValue('/repo');
    // Default mock for fetch - succeeds by default
    mockGit.fetch.mockResolvedValue(undefined);
  });

  it('should have correct type', () => {
    expect(updater.type).toBe('go');
  });

  it('should get correct package file path', () => {
    const path = updater.getPackageFilePath('services/api');
    expect(path).toBe('services/api/go.mod');
  });

  it('should validate package existence', async () => {
    mockFileRepo.setFile('services/api/go.mod', mockFiles.goMod);

    const exists = await updater.validatePackage('services/api');
    expect(exists).toBe(true);
  });

  it('should return false for non-existent package', async () => {
    const exists = await updater.validatePackage('nonexistent/path');
    expect(exists).toBe(false);
  });

  it('should read version from git tags for root package', async () => {
    mockFileRepo.setFile(
      '/repo/go.mod',
      `module github.com/org/repo

go 1.21
`,
    );
    mockGit.tags.mockResolvedValue({
      all: ['v1.0.0', 'v1.2.3', 'v0.9.0', 'services/api/v1.0.0'],
    });
    mockGit.revparse.mockResolvedValue('/repo');

    const version = await updater.readVersion('/repo');
    expect(version).toBe('1.2.3'); // Latest version
  });

  it('should read version from git tags for subpath package', async () => {
    mockFileRepo.setFile('/repo/services/api/go.mod', mockFiles.goMod);
    mockGit.tags.mockResolvedValue({
      all: [
        'v1.0.0',
        'services/api/v2.1.0',
        'services/api/v2.0.0',
        'services/auth/v1.0.0',
      ],
    });
    mockGit.revparse.mockResolvedValue('/repo');

    const version = await updater.readVersion('/repo/services/api');
    expect(version).toBe('2.1.0'); // Latest version for this package
  });

  it('should return default version when no git tags found', async () => {
    mockFileRepo.setFile('/repo/services/api/go.mod', mockFiles.goMod);
    mockGit.tags.mockResolvedValue({ all: [] });
    mockGit.revparse.mockResolvedValue('/repo');

    const version = await updater.readVersion('/repo/services/api');
    expect(version).toBe('0.0.0');
  });

  it('should fetch tags from remote before reading version', async () => {
    mockFileRepo.setFile('/repo/services/api/go.mod', mockFiles.goMod);
    mockGit.tags.mockResolvedValue({
      all: ['services/api/v1.0.0'],
    });
    mockGit.revparse.mockResolvedValue('/repo');

    await updater.readVersion('/repo/services/api');

    expect(mockGit.fetch).toHaveBeenCalledWith(['--tags', '--force']);
  });

  it('should continue reading version even if fetch fails', async () => {
    mockFileRepo.setFile('/repo/services/api/go.mod', mockFiles.goMod);
    mockGit.fetch.mockRejectedValue(new Error('No remote configured'));
    mockGit.tags.mockResolvedValue({
      all: ['services/api/v1.0.0'],
    });
    mockGit.revparse.mockResolvedValue('/repo');

    const version = await updater.readVersion('/repo/services/api');

    expect(version).toBe('1.0.0');
  });

  it('should return default version when git operation fails', async () => {
    mockFileRepo.setFile('/repo/services/api/go.mod', mockFiles.goMod);
    mockGit.tags.mockRejectedValue(new Error('Not a git repository'));

    // Mock console.warn to avoid output during tests
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const version = await updater.readVersion('/repo/services/api');
    expect(version).toBe('0.0.0');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should throw error for go.mod without module directive', async () => {
    const invalidGoMod = `go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
)
`;
    mockFileRepo.setFile('/repo/services/api/go.mod', invalidGoMod);

    await expect(updater.readVersion('/repo/services/api')).rejects.toThrow(
      'No module directive found in /repo/services/api/go.mod',
    );
  });

  it('should handle version update (no file modification)', async () => {
    mockFileRepo.setFile('/repo/services/api/go.mod', mockFiles.goMod);
    mockGit.tags.mockResolvedValue({
      all: ['services/api/v0.5.0'],
    });
    mockGit.revparse.mockResolvedValue('/repo');

    const result = await updater.updateVersion(
      '/repo/services/api',
      '1.0.0',
      false,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.oldVersion).toBe('0.5.0');
      expect(result.newVersion).toBe('1.0.0');
    }

    // Go modules don't modify go.mod for version updates
    const content = mockFileRepo.getFileContent('/repo/services/api/go.mod');
    expect(content).toBe(mockFiles.goMod);
  });

  it('should handle dry run mode', async () => {
    mockFileRepo.setFile('/repo/services/api/go.mod', mockFiles.goMod);
    mockGit.tags.mockResolvedValue({
      all: ['services/api/v0.5.0'],
    });
    mockGit.revparse.mockResolvedValue('/repo');

    const result = await updater.updateVersion(
      '/repo/services/api',
      '1.0.0',
      true,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.oldVersion).toBe('0.5.0');
      expect(result.newVersion).toBe('1.0.0');
    }
  });

  it('should always create tags', () => {
    const shouldCreateTag = updater.shouldCreateTag(mockPackages.go);
    expect(shouldCreateTag).toBe(true);
  });

  it('should generate root-level tag name', () => {
    const tagName = updater.getTagName(mockPackages.goRoot);
    expect(tagName).toBe('v1.0.0');
  });

  it('should generate subpath tag name', () => {
    const tagName = updater.getTagName(mockPackages.go);
    expect(tagName).toBe('services/api/v0.5.0');
  });

  it('should handle empty path as root', () => {
    const rootPackage = { ...mockPackages.goRoot, path: '' };
    const tagName = updater.getTagName(rootPackage);
    expect(tagName).toBe('v1.0.0');
  });

  it('should handle file read errors', async () => {
    // File doesn't exist, should throw error
    const result = await updater.updateVersion('nonexistent', '1.0.0', false);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('ENOENT');
    }
  });

  it('should parse complex module paths', async () => {
    const complexGoMod = `module github.com/org/repo/tools/generator/v3

go 1.21

require (
	github.com/spf13/cobra v1.7.0
)
`;
    mockFileRepo.setFile('/repo/tools/generator/go.mod', complexGoMod);
    mockGit.tags.mockResolvedValue({
      all: ['tools/generator/v3.0.0'],
    });
    mockGit.revparse.mockResolvedValue('/repo');

    const version = await updater.readVersion('/repo/tools/generator');
    expect(version).toBe('3.0.0');
  });
});
