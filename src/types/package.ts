// Package type definitions

export type PackageType = 'npm' | 'go' | 'rust';

export interface BasePackageConfig {
	path: string;
	name: string;
	version: string;
}

export interface NpmPackageConfig extends BasePackageConfig {
	type: 'npm';
}

export interface GoPackageConfig extends BasePackageConfig {
	type: 'go';
}

export interface RustPackageConfig extends BasePackageConfig {
	type: 'rust';
	update_workspace_deps?: boolean;
}

export type PackageConfig =
	| NpmPackageConfig
	| GoPackageConfig
	| RustPackageConfig;

export interface PackageChange {
	config: PackageConfig;
	currentVersion: string;
	newVersion: string;
	needsUpdate: boolean;
	willCreateTag: boolean;
	tagName?: string;
}

export function isRustPackage(
	config: PackageConfig,
): config is RustPackageConfig {
	return config.type === 'rust';
}

export function isGoPackage(config: PackageConfig): config is GoPackageConfig {
	return config.type === 'go';
}

export function isNpmPackage(
	config: PackageConfig,
): config is NpmPackageConfig {
	return config.type === 'npm';
}
