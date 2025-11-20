// Base package updater interface (Strategy pattern)

import type {
  PackageConfig,
  PackageType,
  UpdateResult,
} from '../types/index.js';

export interface PackageUpdater {
  readonly type: PackageType;
  readVersion(packagePath: string): Promise<string>;
  updateVersion(
    packagePath: string,
    newVersion: string,
    dryRun: boolean,
  ): Promise<UpdateResult>;
  validatePackage(packagePath: string): Promise<boolean>;
  getPackageFilePath(packagePath: string): string;

  // Git tag related methods - each package type decides its own strategy
  shouldCreateTag(pkg: PackageConfig): boolean;
  getTagName(pkg: PackageConfig): string;

  // Get the publish command for this package (optional)
  // Returns undefined if the package type doesn't need publishing
  getPublishCommand?(pkg: PackageConfig): string | undefined;
}
