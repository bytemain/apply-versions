// Test utilities and mock data

import { join } from 'node:path';
import { vi } from 'vitest';
import type { PackageConfig } from '../src/types/index.js';

export const mockPackages: Record<string, PackageConfig> = {
  npm: {
    path: 'packages/web',
    name: '@myorg/web',
    type: 'npm',
    version: '1.2.3',
  },
  go: {
    path: 'services/api',
    name: 'github.com/org/repo/services/api',
    type: 'go',
    version: '0.5.0',
  },
  goRoot: {
    path: '.',
    name: 'github.com/org/repo',
    type: 'go',
    version: '1.0.0',
  },
  rust: {
    path: 'crates/server',
    name: 'myorg-server',
    type: 'cargo',
    version: '2.1.0',
  },
  rustWithWorkspace: {
    path: 'crates/core',
    name: 'myorg-core',
    type: 'cargo',
    version: '1.5.0',
    update_workspace_deps: true,
  },
};

export const mockFiles = {
  packageJson:
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
    ) + '\n',

  goMod: `module github.com/org/repo/services/api

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
)
`,

  cargoToml: `[package]
name = "myorg-server"
version = "1.0.0"
edition = "2021"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
`,

  versionsToml: `[[package]]
path = "packages/web"
name = "@myorg/web"
type = "npm"
version = "1.2.3"

[[package]]
path = "services/api"
name = "github.com/org/repo/services/api"
type = "go"
version = "0.5.0"

[[package]]
path = "crates/server"
name = "myorg-server"
type = "cargo"
version = "2.1.0"
`,

  invalidVersionsToml: `[[package]]
path = "packages/web"
name = "@myorg/web"
# missing type field
version = "1.2.3"
`,
};

export class MockFileRepository {
  private files = new Map<string, string>();

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  clear(): void {
    this.files.clear();
  }

  getFileContent(path: string): string | undefined {
    return this.files.get(path);
  }
}

export function createMockGitOperations() {
  return {
    isRepository: vi.fn().mockResolvedValue(true),
    hasUncommittedChanges: vi.fn().mockResolvedValue(false),
    stageAndCommit: vi.fn().mockResolvedValue({
      success: true,
      commitHash: 'abc123',
    }),
    createTag: vi.fn().mockResolvedValue({
      success: true,
      tagName: 'v1.0.0',
    }),
  };
}

export function createMockObserver() {
  return {
    onAnalysisStart: vi.fn(),
    onAnalysisComplete: vi.fn(),
    onConfirmationPrompt: vi.fn().mockResolvedValue(true),
    onPackageStart: vi.fn(),
    onPackageComplete: vi.fn(),
    onPackageSkipped: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
  };
}
