// npm package updater

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { LocalFileRepository } from '../repositories/index.js';
import type { PackageConfig, UpdateResult } from '../types/index.js';
import type { PackageUpdater } from './base-updater.js';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

type DependencyField = (typeof DEPENDENCY_FIELDS)[number];

interface PackageJson {
  name?: string;
  version?: string;
  workspaces?: string[] | { packages?: string[] };
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
}

interface WorkspaceInfo {
  rootPath: string;
  packageManager: 'yarn' | 'pnpm' | 'npm';
}

export class NpmPackageUpdater implements PackageUpdater {
  readonly type = 'npm' as const;
  private fileRepo = new LocalFileRepository();
  // Track workspace roots that need a single root-level install at the end.
  private pendingWorkspaceInstalls = new Map<string, WorkspaceInfo>();

  getPackageFilePath(packagePath: string): string {
    return join(packagePath, 'package.json');
  }

  async validatePackage(packagePath: string): Promise<boolean> {
    const filePath = this.getPackageFilePath(packagePath);
    return await this.fileRepo.exists(filePath);
  }

  async readVersion(packagePath: string): Promise<string> {
    const filePath = this.getPackageFilePath(packagePath);
    const content = await this.fileRepo.read(filePath);
    const pkg = JSON.parse(content);

    if (!pkg.version) {
      throw new Error(`No version field found in ${filePath}`);
    }

    return pkg.version;
  }

  private runInstall(
    cwd: string,
    command: string,
    args: string[],
  ): Promise<void> {
    return new Promise((resolveInstall, rejectInstall) => {
      const child = spawn(command, args, {
        cwd,
        stdio: 'inherit',
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolveInstall();
        } else {
          rejectInstall(
            new Error(
              `${command} ${args.join(' ')} failed with exit code ${code}`,
            ),
          );
        }
      });

      child.on('error', (error) => {
        rejectInstall(new Error(`Failed to run ${command}: ${error.message}`));
      });
    });
  }

  async updateVersion(
    packagePath: string,
    newVersion: string,
    dryRun: boolean,
  ): Promise<UpdateResult> {
    try {
      const filePath = this.getPackageFilePath(packagePath);
      const content = await this.fileRepo.read(filePath);
      const pkg = JSON.parse(content) as PackageJson;
      const oldVersion = pkg.version;
      const pkgName = pkg.name;

      // Detect whether this package lives inside a workspace
      const workspaceInfo = await this.detectWorkspace(packagePath);
      const additionalFiles = new Set<string>();

      if (!dryRun) {
        pkg.version = newVersion;
        const updatedContent = `${JSON.stringify(pkg, null, 2)}\n`;
        await this.fileRepo.write(filePath, updatedContent);
      }

      // Update sibling package.json files inside the workspace that reference
      // this package by name.
      if (workspaceInfo && pkgName) {
        const updatedSiblings = await this.updateWorkspaceSiblingDeps(
          workspaceInfo.rootPath,
          packagePath,
          pkgName,
          newVersion,
          dryRun,
        );
        for (const file of updatedSiblings) {
          additionalFiles.add(file);
        }
      }

      if (!dryRun) {
        if (workspaceInfo) {
          // Defer install to the workspace root, run once after all packages
          this.pendingWorkspaceInstalls.set(
            workspaceInfo.rootPath,
            workspaceInfo,
          );
        } else {
          // Standalone npm package: keep legacy per-package install behavior
          console.log(`Running npm install in ${packagePath}...`);
          await this.runInstall(packagePath, 'npm', ['install']);
        }
      }

      // For standalone packages, include the package-lock.json in the commit
      // (legacy behavior). For workspace packages, the lockfile lives at the
      // root and is updated once at the end, so we don't include it in
      // per-package commits.
      if (!workspaceInfo) {
        additionalFiles.add(join(packagePath, 'package-lock.json'));
      }

      const additionalFilesArray = Array.from(additionalFiles);

      return {
        success: true,
        oldVersion: oldVersion ?? '',
        newVersion,
        additionalFiles:
          additionalFilesArray.length > 0 ? additionalFilesArray : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  shouldCreateTag(pkg: PackageConfig): boolean {
    // Check if create_tag is explicitly set in config
    if (pkg.type === 'npm' && pkg.create_tag !== undefined) {
      return pkg.create_tag;
    }
    // Default to true for npm packages
    return true;
  }

  getTagName(pkg: PackageConfig): string {
    // Default npm tag format (rarely used)
    return `v${pkg.version}`;
  }

  getPublishCommand(pkg: PackageConfig): string | undefined {
    const pkgDir =
      pkg.relativePath && pkg.relativePath !== '.' ? pkg.relativePath : '.';
    if (pkgDir === '.') {
      return 'npm publish';
    }
    return `cd ${pkgDir} && npm publish`;
  }

  async finalize(dryRun: boolean): Promise<void> {
    if (dryRun) {
      this.pendingWorkspaceInstalls.clear();
      return;
    }

    for (const info of Array.from(this.pendingWorkspaceInstalls.values())) {
      const { command, args } = this.getInstallCommand(info.packageManager);
      console.log(
        `Running ${command} ${args.join(' ')} in workspace root ${info.rootPath}...`,
      );
      await this.runInstall(info.rootPath, command, args);
    }
    this.pendingWorkspaceInstalls.clear();
  }

  // ---------------------------------------------------------------------------
  // Workspace helpers
  // ---------------------------------------------------------------------------

  /**
   * Walk upwards from `packagePath` looking for a `package.json` that defines
   * a `workspaces` field. Returns the workspace root path and the package
   * manager to use, or `null` if no workspace is found.
   */
  private async detectWorkspace(
    packagePath: string,
  ): Promise<WorkspaceInfo | null> {
    let currentDir = packagePath || '.';
    const visited = new Set<string>();

    while (!visited.has(currentDir)) {
      visited.add(currentDir);
      const candidate = this.getPackageFilePath(currentDir);
      if (await this.fileRepo.exists(candidate)) {
        try {
          const content = await this.fileRepo.read(candidate);
          const parsed = JSON.parse(content) as PackageJson;
          if (this.getWorkspacePatterns(parsed).length > 0) {
            return {
              rootPath: currentDir,
              packageManager: this.detectPackageManager(parsed),
            };
          }
        } catch {
          // ignore malformed package.json while walking up
        }
      }

      const parent = dirname(currentDir);
      if (parent === currentDir || parent === '.' || parent === '') {
        // Also check '.' as a final candidate when we started below it
        if (parent === '.' && currentDir !== '.') {
          const rootCandidate = this.getPackageFilePath('.');
          if (await this.fileRepo.exists(rootCandidate)) {
            try {
              const parsed = JSON.parse(
                await this.fileRepo.read(rootCandidate),
              ) as PackageJson;
              if (this.getWorkspacePatterns(parsed).length > 0) {
                return {
                  rootPath: '.',
                  packageManager: this.detectPackageManager(parsed),
                };
              }
            } catch {
              // ignore
            }
          }
        }
        break;
      }
      currentDir = parent;
    }

    return null;
  }

  private getWorkspacePatterns(pkg: PackageJson): string[] {
    const ws = pkg.workspaces;
    if (Array.isArray(ws)) return ws;
    if (ws && typeof ws === 'object' && Array.isArray(ws.packages)) {
      return ws.packages;
    }
    return [];
  }

  private detectPackageManager(pkg: PackageJson): 'yarn' | 'pnpm' | 'npm' {
    const pm = pkg.packageManager;
    if (typeof pm === 'string') {
      const name = pm.split('@')[0]?.toLowerCase();
      if (name === 'yarn') return 'yarn';
      if (name === 'pnpm') return 'pnpm';
      if (name === 'npm') return 'npm';
    }
    return 'npm';
  }

  private getInstallCommand(pm: 'yarn' | 'pnpm' | 'npm'): {
    command: string;
    args: string[];
  } {
    if (pm === 'yarn') return { command: 'yarn', args: ['install'] };
    if (pm === 'pnpm') return { command: 'pnpm', args: ['install'] };
    return { command: 'npm', args: ['install'] };
  }

  /**
   * Find every workspace member directory under `workspaceRoot` that matches
   * one of the workspace glob patterns and contains a `package.json`.
   */
  private async findWorkspaceMembers(workspaceRoot: string): Promise<string[]> {
    const rootPkgPath = this.getPackageFilePath(workspaceRoot);
    if (!(await this.fileRepo.exists(rootPkgPath))) return [];
    let rootPkg: PackageJson;
    try {
      rootPkg = JSON.parse(await this.fileRepo.read(rootPkgPath));
    } catch {
      return [];
    }
    const patterns = this.getWorkspacePatterns(rootPkg);
    if (patterns.length === 0) return [];

    const candidates = new Set<string>();
    const includePatterns = patterns.filter((p) => !p.startsWith('!'));
    const excludePatterns = patterns
      .filter((p) => p.startsWith('!'))
      .map((p) => p.slice(1));

    for (const pattern of includePatterns) {
      const matches = await this.expandPattern(workspaceRoot, pattern);
      for (const m of matches) {
        candidates.add(m);
      }
    }

    const excluded = new Set<string>();
    for (const pattern of excludePatterns) {
      const matches = await this.expandPattern(workspaceRoot, pattern);
      for (const m of matches) excluded.add(m);
    }

    const result: string[] = [];
    for (const dir of Array.from(candidates)) {
      if (excluded.has(dir)) continue;
      const pkgFile = this.getPackageFilePath(dir);
      if (await this.fileRepo.exists(pkgFile)) {
        result.push(dir);
      }
    }
    return result;
  }

  /**
   * Expand a workspace glob pattern (supports `*` and `**`) into directory
   * paths underneath `root`. Skips `node_modules` and dotted directories.
   */
  private async expandPattern(
    root: string,
    pattern: string,
  ): Promise<string[]> {
    const segments = pattern.split('/').filter((s) => s.length > 0);
    let current: string[] = [root];
    for (const segment of segments) {
      const next: string[] = [];
      for (const dir of current) {
        if (segment === '**') {
          // Match zero or more directory levels
          for (const d of await this.collectDescendantDirs(dir)) {
            next.push(d);
          }
        } else if (segment.includes('*')) {
          const regex = this.segmentToRegex(segment);
          for (const entry of await this.fileRepo.listDir(dir)) {
            if (
              entry.isDirectory &&
              !this.isIgnoredDirName(entry.name) &&
              regex.test(entry.name)
            ) {
              next.push(join(dir, entry.name));
            }
          }
        } else {
          // Literal segment
          const candidate = join(dir, segment);
          // We can't cheaply check directory existence via FileRepository
          // (only `exists` for files). Treat it as valid; downstream check
          // for package.json existence will filter.
          next.push(candidate);
        }
      }
      current = next;
    }
    return current;
  }

  private async collectDescendantDirs(root: string): Promise<string[]> {
    const result: string[] = [root];
    const queue: string[] = [root];
    while (queue.length > 0) {
      const dir = queue.shift()!;
      const entries = await this.fileRepo.listDir(dir);
      for (const entry of entries) {
        if (!entry.isDirectory) continue;
        if (this.isIgnoredDirName(entry.name)) continue;
        const child = join(dir, entry.name);
        result.push(child);
        queue.push(child);
      }
    }
    return result;
  }

  private isIgnoredDirName(name: string): boolean {
    return name === 'node_modules' || name.startsWith('.');
  }

  private segmentToRegex(segment: string): RegExp {
    const escaped = segment
      .split(/(\*)/)
      .map((part) => {
        if (part === '*') return '[^/]*';
        return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return new RegExp(`^${escaped}$`);
  }

  /**
   * For every workspace member (other than the package being bumped),
   * update any dependency entry whose key equals `pkgName`, preserving the
   * original range prefix. Returns the absolute paths of modified
   * `package.json` files for inclusion in the atomic commit.
   */
  private async updateWorkspaceSiblingDeps(
    workspaceRoot: string,
    packagePath: string,
    pkgName: string,
    newVersion: string,
    dryRun: boolean,
  ): Promise<string[]> {
    const members = await this.findWorkspaceMembers(workspaceRoot);
    const updatedFiles: string[] = [];

    const normalizedSelf = resolve(packagePath);

    for (const member of members) {
      if (resolve(member) === normalizedSelf) continue;
      const memberPkgPath = this.getPackageFilePath(member);
      let memberContent: string;
      try {
        memberContent = await this.fileRepo.read(memberPkgPath);
      } catch {
        continue;
      }
      let memberPkg: PackageJson;
      try {
        memberPkg = JSON.parse(memberContent);
      } catch {
        continue;
      }

      let changed = false;
      for (const field of DEPENDENCY_FIELDS) {
        const deps = memberPkg[field] as Record<string, string> | undefined;
        if (!deps || typeof deps !== 'object') continue;
        const current = deps[pkgName];
        if (typeof current !== 'string') continue;
        const next = this.replaceVersionRange(current, newVersion);
        if (next !== null && next !== current) {
          deps[pkgName] = next;
          changed = true;
        }
      }

      if (changed) {
        if (!dryRun) {
          const newContent = `${JSON.stringify(memberPkg, null, 2)}\n`;
          await this.fileRepo.write(memberPkgPath, newContent);
        }
        updatedFiles.push(memberPkgPath);
      }
    }

    return updatedFiles;
  }

  /**
   * Replace the numeric version inside a semver range while preserving its
   * prefix (e.g. `^1.2.3` → `^2.0.0`, `>=1.2.3 <2` → `>=2.0.0`).
   * Returns `null` for ranges that should not be touched (workspace:, file:,
   * link:, npm:, git URLs, tags like `latest`, wildcards like `*`).
   */
  private replaceVersionRange(
    current: string,
    newVersion: string,
  ): string | null {
    const trimmed = current.trim();
    if (trimmed === '' || trimmed === '*' || trimmed === 'x') return null;
    if (
      trimmed.startsWith('workspace:') ||
      trimmed.startsWith('file:') ||
      trimmed.startsWith('link:') ||
      trimmed.startsWith('npm:') ||
      trimmed.startsWith('git+') ||
      trimmed.startsWith('git:') ||
      trimmed.startsWith('git@') ||
      trimmed.startsWith('http:') ||
      trimmed.startsWith('https:') ||
      trimmed.startsWith('github:') ||
      trimmed.includes('://')
    ) {
      return null;
    }
    // Tag (no digits): leave as-is
    if (!/\d/.test(trimmed)) return null;

    // Match a leading semver-range prefix and the first version inside.
    const match = trimmed.match(
      /^(\s*)(\^|~|>=|<=|>|<|=|)\s*(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(.*)$/,
    );
    if (!match) return null;
    const [, leading, prefix, , rest] = match;
    // If `rest` contains additional comparators, keep behaviour conservative
    // and only replace the first version. This handles `^1.2.3` and `>=1.2.3`
    // cleanly; complex ranges like `>=1.2.3 <2.0.0` get the first version
    // replaced too which matches typical "bump primary range" intent.
    return `${leading}${prefix}${newVersion}${rest}`;
  }
}
