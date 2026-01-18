// Rust package updater

import { dirname, join, relative } from 'node:path';
import * as TOML from 'smol-toml';
import { LocalFileRepository } from '../repositories/index.js';
import type { PackageConfig, UpdateResult } from '../types/index.js';
import type { PackageUpdater } from './base-updater.js';

interface CargoToml {
  package?: {
    name?: string;
    version?: string | { workspace: true };
    [key: string]: unknown;
  };
  workspace?: {
    members?: string[];
    package?: {
      version?: string;
      [key: string]: unknown;
    };
    dependencies?: Record<string, unknown>;
    [key: string]: unknown;
  };
  dependencies?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CargoSectionRange {
  start: number;
  end: number;
  body: string;
}

export class RustPackageUpdater implements PackageUpdater {
  readonly type = 'cargo' as const;
  private fileRepo = new LocalFileRepository();

  getPackageFilePath(packagePath: string): string {
    return join(packagePath, 'Cargo.toml');
  }

  async validatePackage(packagePath: string): Promise<boolean> {
    const filePath = this.getPackageFilePath(packagePath);
    return await this.fileRepo.exists(filePath);
  }

  async readVersion(packagePath: string): Promise<string> {
    const filePath = this.getPackageFilePath(packagePath);
    const content = await this.fileRepo.read(filePath);
    const cargo = TOML.parse(content) as CargoToml;

    const packageVersion = cargo.package?.version;
    if (typeof packageVersion === 'string') {
      return packageVersion;
    }

    if (typeof cargo.workspace?.package?.version === 'string') {
      return cargo.workspace.package.version;
    }

    if (packageVersion && typeof packageVersion === 'object') {
      if (packageVersion.workspace) {
        const workspaceRoot = await this.findWorkspaceRoot(packagePath);
        if (!workspaceRoot) {
          throw new Error(
            `No workspace root found for ${filePath} with version.workspace = true`,
          );
        }
        return await this.readWorkspaceVersion(workspaceRoot);
      }
    }

    throw new Error(
      `No version field found in [package] section of ${filePath}`,
    );
  }

  async updateVersion(
    packagePath: string,
    newVersion: string,
    dryRun: boolean,
  ): Promise<UpdateResult> {
    try {
      const filePath = this.getPackageFilePath(packagePath);
      const content = await this.fileRepo.read(filePath);
      const cargo = TOML.parse(content) as CargoToml;
      const oldVersion = await this.readVersion(packagePath);

      if (oldVersion === newVersion) {
        return {
          success: true,
          oldVersion,
          newVersion,
        };
      }

      const updatedFiles = new Set<string>();
      const workspaceRoot = await this.resolveWorkspaceRoot(packagePath, cargo);

      let updatedContent = content;
      let workspaceInfo:
        | {
            rootPath: string;
            content: string;
            originalContent: string;
            cargo: CargoToml;
          }
        | undefined;

      if (workspaceRoot) {
        const workspaceFilePath = this.getPackageFilePath(workspaceRoot);
        const workspaceContent =
          workspaceFilePath === filePath
            ? content
            : await this.fileRepo.read(workspaceFilePath);
        const workspaceCargo =
          workspaceFilePath === filePath
            ? cargo
            : (TOML.parse(workspaceContent) as CargoToml);
        workspaceInfo = {
          rootPath: workspaceRoot,
          content: workspaceContent,
          originalContent: workspaceContent,
          cargo: workspaceCargo,
        };
      }

      const usesWorkspaceVersion = Boolean(
        workspaceInfo && this.hasWorkspacePackageVersion(workspaceInfo.cargo),
      );

      if (workspaceInfo && usesWorkspaceVersion) {
        const workspaceUpdate = this.updateWorkspacePackage(
          workspaceInfo.content,
          newVersion,
        );
        if (!workspaceUpdate.updated) {
          throw new Error(
            `Failed to update workspace version in ${this.getPackageFilePath(
              workspaceInfo.rootPath,
            )}`,
          );
        }
        updatedFiles.add(this.getPackageFilePath(workspaceInfo.rootPath));
        workspaceInfo = {
          ...workspaceInfo,
          content: workspaceUpdate.content,
        };

        const workspaceMemberUpdate = await this.updateWorkspaceMembers(
          workspaceInfo.rootPath,
          workspaceInfo.cargo,
          newVersion,
          dryRun,
        );
        for (const file of workspaceMemberUpdate.updatedFiles) {
          updatedFiles.add(file);
        }

        const dependencyUpdate = this.updateWorkspaceDependencies(
          workspaceInfo.content,
          workspaceMemberUpdate.memberNames,
          newVersion,
        );
        if (dependencyUpdate.updated) {
          updatedFiles.add(this.getPackageFilePath(workspaceInfo.rootPath));
          workspaceInfo = {
            ...workspaceInfo,
            content: dependencyUpdate.content,
          };
        }

        if (workspaceInfo.rootPath === packagePath) {
          updatedContent = workspaceInfo.content;
        }
      }

      if (!usesWorkspaceVersion) {
        const packageUpdate = this.updatePackageVersion(content, newVersion);
        updatedContent = packageUpdate.content;
        if (packageUpdate.updated) {
          updatedFiles.add(filePath);
        } else {
          throw new Error(
            `Failed to update version in ${filePath}. Version field not found or already at target version.`,
          );
        }
      } else if (typeof cargo.package?.version === 'string') {
        const baseContent =
          workspaceInfo && workspaceInfo.rootPath === packagePath
            ? workspaceInfo.content
            : updatedContent;
        const packageUpdate = this.updatePackageVersion(
          baseContent,
          newVersion,
        );
        if (packageUpdate.updated) {
          if (workspaceInfo && workspaceInfo.rootPath === packagePath) {
            workspaceInfo = {
              ...workspaceInfo,
              content: packageUpdate.content,
            };
          }
          updatedContent = packageUpdate.content;
          updatedFiles.add(filePath);
        } else {
          throw new Error(
            `Failed to update version in ${filePath}. Version field not found or already at target version.`,
          );
        }
      }

      if (!dryRun && updatedFiles.size > 0) {
        if (updatedContent !== content) {
          await this.fileRepo.write(filePath, updatedContent);
        }
        if (
          workspaceInfo &&
          workspaceInfo.content !== workspaceInfo.originalContent
        ) {
          await this.fileRepo.write(
            this.getPackageFilePath(workspaceInfo.rootPath),
            workspaceInfo.content,
          );
        }
      }

      const additionalFiles = Array.from(updatedFiles).filter(
        (file) => file !== filePath,
      );

      return {
        success: true,
        oldVersion,
        newVersion,
        additionalFiles:
          additionalFiles.length > 0 ? additionalFiles : undefined,
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
    if (pkg.type === 'cargo' && pkg.create_tag !== undefined) {
      return pkg.create_tag;
    }
    // Default to true for Rust packages
    return true;
  }

  getTagName(pkg: PackageConfig): string {
    // Default cargo tag format (rarely used)
    // Could include crate name in the future: `${pkg.name}-v${pkg.version}`
    return `v${pkg.version}`;
  }

  getPublishCommand(pkg: PackageConfig): string | undefined {
    const pkgDir =
      pkg.relativePath && pkg.relativePath !== '.' ? pkg.relativePath : '.';
    if (pkgDir === '.') {
      return 'cargo publish';
    }
    return `cd ${pkgDir} && cargo publish`;
  }

  private async resolveWorkspaceRoot(
    packagePath: string,
    cargo: CargoToml,
  ): Promise<string | null> {
    if (cargo.workspace) {
      return packagePath;
    }

    const workspaceRoot = await this.findWorkspaceRoot(packagePath);
    if (!workspaceRoot) {
      return null;
    }

    if (workspaceRoot === packagePath) {
      return workspaceRoot;
    }

    const workspacePath = this.getPackageFilePath(workspaceRoot);
    const workspaceContent = await this.fileRepo.read(workspacePath);
    const workspaceCargo = TOML.parse(workspaceContent) as CargoToml;
    const workspaceMembers = workspaceCargo.workspace?.members;
    const members = Array.isArray(workspaceMembers) ? workspaceMembers : [];

    if (members.length === 0) {
      return workspaceRoot;
    }

    const relativePath = this.getRelativeWorkspacePath(
      workspaceRoot,
      packagePath,
    );
    return this.matchesWorkspaceMember(members, relativePath)
      ? workspaceRoot
      : null;
  }

  private async findWorkspaceRoot(packagePath: string): Promise<string | null> {
    let currentDir = packagePath || '.';

    while (true) {
      const cargoPath = this.getPackageFilePath(currentDir);
      if (await this.fileRepo.exists(cargoPath)) {
        const content = await this.fileRepo.read(cargoPath);
        const cargo = TOML.parse(content) as CargoToml;
        if (cargo.workspace) {
          return currentDir;
        }
      }

      if (currentDir === '.' || currentDir === '') {
        break;
      }

      const parent = dirname(currentDir);
      if (parent === currentDir) {
        break;
      }
      currentDir = parent;
    }

    return null;
  }

  private async readWorkspaceVersion(workspaceRoot: string): Promise<string> {
    const workspacePath = this.getPackageFilePath(workspaceRoot);
    const workspaceContent = await this.fileRepo.read(workspacePath);
    const workspaceCargo = TOML.parse(workspaceContent) as CargoToml;

    if (typeof workspaceCargo.workspace?.package?.version === 'string') {
      return workspaceCargo.workspace.package.version;
    }

    throw new Error(
      `No version field found in [workspace.package] section of ${workspacePath}`,
    );
  }

  private hasWorkspacePackageVersion(cargo: CargoToml): boolean {
    return typeof cargo.workspace?.package?.version === 'string';
  }

  private updateWorkspacePackage(
    content: string,
    newVersion: string,
  ): { content: string; updated: boolean } {
    return this.updateVersionInSection(
      content,
      'workspace.package',
      newVersion,
    );
  }

  private updatePackageVersion(
    content: string,
    newVersion: string,
  ): { content: string; updated: boolean } {
    return this.updateVersionInSection(content, 'package', newVersion);
  }

  private updateWorkspaceDependencies(
    content: string,
    workspacePackageNames: Set<string>,
    newVersion: string,
  ): { content: string; updated: boolean } {
    const section = this.getSectionRange(content, 'workspace.dependencies');
    if (!section) {
      return { content, updated: false };
    }

    const updatedLines = section.body.split('\n').map((line) => {
      const entryMatch = line.match(
        /^\s*(?:"([^"]+)"|([A-Za-z0-9_.-]+))\s*=\s*(.+)$/,
      );
      if (!entryMatch) {
        return line;
      }

      const depName = entryMatch[1] ?? entryMatch[2];
      const value = entryMatch[3];
      if (!depName) {
        return line;
      }
      if (!workspacePackageNames.has(depName)) {
        return line;
      }

      const stringMatch = value.match(/^"([^"]+)"(.*)$/);
      if (stringMatch) {
        return line.replace(stringMatch[0], `"${newVersion}"${stringMatch[2]}`);
      }

      const versionMatch = value.match(/(version\s*=\s*")([^"]+)(")/);
      if (!versionMatch) {
        return line;
      }

      const updatedValue = value.replace(
        versionMatch[0],
        `${versionMatch[1]}${newVersion}${versionMatch[3]}`,
      );
      if (updatedValue === value) {
        return line;
      }
      return line.replace(value, updatedValue);
    });

    const updatedBody = updatedLines.join('\n');
    if (updatedBody === section.body) {
      return { content, updated: false };
    }

    const updatedContent =
      content.slice(0, section.start) +
      updatedBody +
      content.slice(section.end);
    return { content: updatedContent, updated: true };
  }

  private async updateWorkspaceMembers(
    workspaceRoot: string,
    workspaceCargo: CargoToml,
    newVersion: string,
    dryRun: boolean,
  ): Promise<{ updatedFiles: string[]; memberNames: Set<string> }> {
    const workspaceMembers = workspaceCargo.workspace?.members;
    const members = Array.isArray(workspaceMembers) ? workspaceMembers : [];
    const updatedFiles: string[] = [];
    const memberNames = new Set<string>();

    for (const member of members) {
      const memberPath = join(workspaceRoot, member);
      const memberCargoPath = this.getPackageFilePath(memberPath);
      if (!(await this.fileRepo.exists(memberCargoPath))) {
        continue;
      }

      const memberContent = await this.fileRepo.read(memberCargoPath);
      const memberCargo = TOML.parse(memberContent) as CargoToml;
      if (typeof memberCargo.package?.name === 'string') {
        memberNames.add(memberCargo.package.name);
      }

      if (typeof memberCargo.package?.version !== 'string') {
        continue;
      }

      if (memberCargo.package.version === newVersion) {
        continue;
      }

      const updatedMember = this.updatePackageVersion(
        memberContent,
        newVersion,
      );
      if (updatedMember.updated) {
        updatedFiles.push(memberCargoPath);
        if (!dryRun) {
          await this.fileRepo.write(memberCargoPath, updatedMember.content);
        }
      }
    }

    return { updatedFiles, memberNames };
  }

  private getRelativeWorkspacePath(
    workspaceRoot: string,
    packagePath: string,
  ): string {
    if (workspaceRoot === packagePath) {
      return '.';
    }
    const relativePath = relative(workspaceRoot, packagePath);
    return relativePath === '' ? '.' : relativePath;
  }

  private matchesWorkspaceMember(
    members: string[],
    relativePath: string,
  ): boolean {
    for (const member of members) {
      if (member === relativePath) {
        return true;
      }

      if (member.includes('*')) {
        const pattern = this.getWorkspaceGlobPattern(member);
        if (pattern.test(relativePath)) {
          return true;
        }
      }
    }

    return false;
  }

  private getWorkspaceGlobPattern(pattern: string): RegExp {
    const escaped = pattern
      .split(/(\*\*|\*)/)
      .map((part) => {
        if (part === '**') {
          return '.*';
        }
        if (part === '*') {
          return '[^/]*';
        }
        return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return new RegExp(`^${escaped}$`);
  }

  private getSectionRange(
    content: string,
    sectionHeader: string,
  ): CargoSectionRange | null {
    const escapedHeader = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headerRegex = new RegExp(`^\\[${escapedHeader}\\]\\s*$`, 'm');
    const headerMatch = content.match(headerRegex);
    if (!headerMatch || headerMatch.index === undefined) {
      return null;
    }

    const start = headerMatch.index + headerMatch[0].length;
    const rest = content.slice(start);
    const nextHeaderIndex = rest.search(/\n\[\[?[^\]\n]+\]\]?\s*(?:\r?\n|$)/);
    const end =
      nextHeaderIndex === -1 ? content.length : start + nextHeaderIndex;
    const body = content.slice(start, end);
    return { start, end, body };
  }

  private updateVersionInSection(
    content: string,
    sectionHeader: string,
    newVersion: string,
  ): { content: string; updated: boolean } {
    const section = this.getSectionRange(content, sectionHeader);
    if (!section) {
      return { content, updated: false };
    }

    const versionRegex = /^(\s*version\s*=\s*")([^"]+)(")/m;
    if (!versionRegex.test(section.body)) {
      return { content, updated: false };
    }

    const updatedBody = section.body.replace(versionRegex, `$1${newVersion}$3`);
    if (updatedBody === section.body) {
      return { content, updated: false };
    }

    const updatedContent =
      content.slice(0, section.start) +
      updatedBody +
      content.slice(section.end);
    return { content: updatedContent, updated: true };
  }
}
