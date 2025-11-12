// Package updater factory

import type { PackageType } from '../types/index.js';
import type { PackageUpdater } from './base-updater.js';
import { NpmPackageUpdater } from './npm-updater.js';
import { GoPackageUpdater } from './go-updater.js';
import { RustPackageUpdater } from './rust-updater.js';

export class PackageUpdaterFactory {
	private static updaters = new Map<PackageType, PackageUpdater>([
		['npm', new NpmPackageUpdater()],
		['go', new GoPackageUpdater()],
		['rust', new RustPackageUpdater()],
	]);

	static getUpdater(type: PackageType): PackageUpdater {
		const updater = this.updaters.get(type);
		if (!updater) {
			const validTypes = Array.from(this.updaters.keys()).join(', ');
			throw new Error(
				`Unknown package type: ${type}. Valid types are: ${validTypes}`,
			);
		}
		return updater;
	}

	static getSupportedTypes(): PackageType[] {
		return Array.from(this.updaters.keys());
	}
}
