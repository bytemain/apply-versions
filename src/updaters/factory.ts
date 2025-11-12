// Package updater factory

import type { PackageType } from '../types/index.js';
import type { PackageUpdater } from './base-updater.js';
import { GoPackageUpdater } from './go-updater.js';
import { NpmPackageUpdater } from './npm-updater.js';
import { RustPackageUpdater } from './rust-updater.js';

export class PackageUpdaterFactory {
  private static updaters = new Map<PackageType, PackageUpdater>([
    ['npm', new NpmPackageUpdater()],
    ['go', new GoPackageUpdater()],
    ['cargo', new RustPackageUpdater()],
  ]);

  static getUpdater(type: PackageType): PackageUpdater {
    const updater = PackageUpdaterFactory.updaters.get(type);
    if (!updater) {
      const validTypes = Array.from(PackageUpdaterFactory.updaters.keys()).join(
        ', ',
      );
      throw new Error(
        `Unknown package type: ${type}. Valid types are: ${validTypes}`,
      );
    }
    return updater;
  }

  static getSupportedTypes(): PackageType[] {
    return Array.from(PackageUpdaterFactory.updaters.keys());
  }
}
