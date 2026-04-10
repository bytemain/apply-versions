// Package type definitions

export type PackageType = 'npm' | 'go' | 'cargo';

export interface VersionFileConfig {
  path: string; // File path relative to the package path
  pattern: string; // Regex pattern string with {{version}} placeholder
}

export interface BasePackageConfig {
  path: string; // Absolute path for file operations
  relativePath?: string; // Original relative path from config (for Git tags)
  name: string;
  version: string;
  version_files?: VersionFileConfig[];
}

export interface NpmPackageConfig extends BasePackageConfig {
  type: 'npm';
  create_tag?: boolean;
}

export interface GoPackageConfig extends BasePackageConfig {
  type: 'go';
}

export interface CargoPackageConfig extends BasePackageConfig {
  type: 'cargo';
  update_workspace_deps?: boolean;
  create_tag?: boolean;
}

export type PackageConfig =
  | NpmPackageConfig
  | GoPackageConfig
  | CargoPackageConfig;

export interface PackageChange {
  config: PackageConfig;
  currentVersion: string;
  newVersion: string;
  needsUpdate: boolean;
  willCreateTag: boolean;
  tagName?: string;
}

export function isCargoPackage(
  config: PackageConfig,
): config is CargoPackageConfig {
  return config.type === 'cargo';
}

export function isGoPackage(config: PackageConfig): config is GoPackageConfig {
  return config.type === 'go';
}

export function isNpmPackage(
  config: PackageConfig,
): config is NpmPackageConfig {
  return config.type === 'npm';
}
