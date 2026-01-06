// Git operations tests

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitOperations } from '../../src/git/git-operations.js';
import { mockPackages } from '../test-utils.js';

// Mock simple-git
const mockGit = {
  status: vi.fn(),
  add: vi.fn(),
  commit: vi.fn(),
  tags: vi.fn(),
  addTag: vi.fn(),
  fetch: vi.fn(),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit),
}));

describe('GitOperations', () => {
  let gitOps: GitOperations;

  beforeEach(() => {
    vi.clearAllMocks();
    gitOps = new GitOperations();
  });

  describe('isRepository', () => {
    it('should return true for valid repository', async () => {
      mockGit.status.mockResolvedValue({ current: 'main' });

      const result = await gitOps.isRepository();
      expect(result).toBe(true);
      expect(mockGit.status).toHaveBeenCalled();
    });

    it('should return false for invalid repository', async () => {
      mockGit.status.mockRejectedValue(new Error('Not a git repository'));

      const result = await gitOps.isRepository();
      expect(result).toBe(false);
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return false for clean working tree', async () => {
      mockGit.status.mockResolvedValue({ isClean: () => true });

      const result = await gitOps.hasUncommittedChanges();
      expect(result).toBe(false);
    });

    it('should return true for dirty working tree', async () => {
      mockGit.status.mockResolvedValue({ isClean: () => false });

      const result = await gitOps.hasUncommittedChanges();
      expect(result).toBe(true);
    });
  });

  describe('fetchTags', () => {
    it('should fetch tags successfully', async () => {
      mockGit.fetch.mockResolvedValue(undefined);

      const result = await gitOps.fetchTags();

      expect(result.success).toBe(true);
      expect(mockGit.fetch).toHaveBeenCalledWith(['--tags', '--force']);
    });

    it('should handle fetch failure gracefully', async () => {
      mockGit.fetch.mockRejectedValue(new Error('No remote configured'));

      const result = await gitOps.fetchTags();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No remote configured');
    });

    it('should handle unknown error types', async () => {
      mockGit.fetch.mockRejectedValue('String error');

      const result = await gitOps.fetchTags();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('getTags', () => {
    it('should fetch and return tags', async () => {
      mockGit.fetch.mockResolvedValue(undefined);
      mockGit.tags.mockResolvedValue({ all: ['v1.0.0', 'v1.1.0'] });

      const result = await gitOps.getTags();

      expect(result).toEqual(['v1.0.0', 'v1.1.0']);
      expect(mockGit.fetch).toHaveBeenCalledWith(['--tags', '--force']);
      expect(mockGit.tags).toHaveBeenCalled();
    });

    it('should return tags even if fetch fails', async () => {
      mockGit.fetch.mockRejectedValue(new Error('No remote configured'));
      mockGit.tags.mockResolvedValue({ all: ['v1.0.0'] });

      const result = await gitOps.getTags();

      expect(result).toEqual(['v1.0.0']);
      expect(mockGit.tags).toHaveBeenCalled();
    });

    it('should return empty array when no tags exist', async () => {
      mockGit.fetch.mockResolvedValue(undefined);
      mockGit.tags.mockResolvedValue({ all: [] });

      const result = await gitOps.getTags();

      expect(result).toEqual([]);
    });
  });

  describe('stageAndCommit', () => {
    const pkg = mockPackages.npm;
    const filePath = 'package.json';
    const oldVersion = '1.0.0';
    const newVersion = '2.0.0';

    it('should stage and commit file', async () => {
      mockGit.add.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue({ commit: 'abc123' });

      const result = await gitOps.stageAndCommit(
        pkg,
        filePath,
        oldVersion,
        newVersion,
        false,
      );

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc123');
      expect(mockGit.add).toHaveBeenCalledWith(filePath);
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.stringContaining('chore(@myorg/web): bump version to 2.0.0'),
      );
    });

    it('should handle dry run mode', async () => {
      const result = await gitOps.stageAndCommit(
        pkg,
        filePath,
        oldVersion,
        newVersion,
        true,
      );

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('dry-run');
      expect(mockGit.add).not.toHaveBeenCalled();
      expect(mockGit.commit).not.toHaveBeenCalled();
    });

    it('should handle git add failure', async () => {
      mockGit.add.mockRejectedValue(new Error('Failed to add file'));

      const result = await gitOps.stageAndCommit(
        pkg,
        filePath,
        oldVersion,
        newVersion,
        false,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to add file');
    });

    it('should handle git commit failure', async () => {
      mockGit.add.mockResolvedValue(undefined);
      mockGit.commit.mockRejectedValue(new Error('Failed to commit'));

      const result = await gitOps.stageAndCommit(
        pkg,
        filePath,
        oldVersion,
        newVersion,
        false,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to commit');
    });

    it('should create proper commit message', async () => {
      mockGit.add.mockResolvedValue(undefined);
      mockGit.commit.mockResolvedValue({ commit: 'abc123' });

      await gitOps.stageAndCommit(pkg, filePath, oldVersion, newVersion, false);

      const expectedMessage = `chore(@myorg/web): bump version to 2.0.0

- Updated npm package at packages/web
- Previous version: 1.0.0
- New version: 2.0.0`;

      expect(mockGit.commit).toHaveBeenCalledWith(expectedMessage);
    });
  });

  describe('createTag', () => {
    const tagName = 'v1.0.0';

    it('should create tag successfully', async () => {
      mockGit.fetch.mockResolvedValue(undefined);
      mockGit.tags.mockResolvedValue({ all: ['v0.9.0'] });
      mockGit.addTag.mockResolvedValue(undefined);

      const result = await gitOps.createTag(tagName, false);

      expect(result.success).toBe(true);
      expect(result.tagName).toBe(tagName);
      expect(mockGit.fetch).toHaveBeenCalledWith(['--tags', '--force']);
      expect(mockGit.tags).toHaveBeenCalled();
      expect(mockGit.addTag).toHaveBeenCalledWith(tagName);
    });

    it('should fetch tags from remote before creating', async () => {
      mockGit.fetch.mockResolvedValue(undefined);
      mockGit.tags.mockResolvedValue({ all: [] });
      mockGit.addTag.mockResolvedValue(undefined);

      await gitOps.createTag(tagName, false);

      // Verify fetch is called before checking/creating tags
      expect(mockGit.fetch).toHaveBeenCalledWith(['--tags', '--force']);
      expect(mockGit.fetch).toHaveBeenCalledBefore(mockGit.tags);
    });

    it('should continue creating tag even if fetch fails', async () => {
      mockGit.fetch.mockRejectedValue(new Error('No remote configured'));
      mockGit.tags.mockResolvedValue({ all: [] });
      mockGit.addTag.mockResolvedValue(undefined);

      const result = await gitOps.createTag(tagName, false);

      expect(result.success).toBe(true);
      expect(result.tagName).toBe(tagName);
      expect(mockGit.tags).toHaveBeenCalled();
      expect(mockGit.addTag).toHaveBeenCalledWith(tagName);
    });

    it('should handle dry run mode', async () => {
      const result = await gitOps.createTag(tagName, true);

      expect(result.success).toBe(true);
      expect(result.tagName).toBe(tagName);
      expect(mockGit.fetch).not.toHaveBeenCalled();
      expect(mockGit.tags).not.toHaveBeenCalled();
      expect(mockGit.addTag).not.toHaveBeenCalled();
    });

    it('should fail if tag already exists', async () => {
      mockGit.fetch.mockResolvedValue(undefined);
      mockGit.tags.mockResolvedValue({ all: ['v0.9.0', 'v1.0.0'] });

      const result = await gitOps.createTag(tagName, false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tag v1.0.0 already exists');
      expect(mockGit.addTag).not.toHaveBeenCalled();
    });

    it('should detect remote tags after fetch and prevent duplicate', async () => {
      // Simulate a tag that exists on remote but not locally before fetch
      mockGit.fetch.mockResolvedValue(undefined);
      mockGit.tags.mockResolvedValue({ all: ['v0.9.0', 'v1.0.0'] });

      const result = await gitOps.createTag(tagName, false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tag v1.0.0 already exists');
    });

    it('should handle git tags failure', async () => {
      mockGit.fetch.mockResolvedValue(undefined);
      mockGit.tags.mockRejectedValue(new Error('Failed to list tags'));

      const result = await gitOps.createTag(tagName, false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to list tags');
    });

    it('should handle git addTag failure', async () => {
      mockGit.fetch.mockResolvedValue(undefined);
      mockGit.tags.mockResolvedValue({ all: [] });
      mockGit.addTag.mockRejectedValue(new Error('Failed to create tag'));

      const result = await gitOps.createTag(tagName, false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create tag');
    });
  });

  describe('error handling', () => {
    it('should handle unknown error types', async () => {
      mockGit.add.mockRejectedValue('String error');

      const result = await gitOps.stageAndCommit(
        mockPackages.npm,
        'file.txt',
        '1.0.0',
        '2.0.0',
        false,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should handle unknown error types in createTag', async () => {
      mockGit.tags.mockRejectedValue('String error');

      const result = await gitOps.createTag('v1.0.0', false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });
});
