// Progress observer interface (Observer pattern)

import type {
	PackageConfig,
	PackageChange,
	ChangeSummary,
	Summary,
	UpdateResult,
} from '../types/index.js';

export interface ProgressObserver {
	onAnalysisStart(packageCount: number): void;
	onAnalysisComplete(changes: PackageChange[]): void;
	onConfirmationPrompt(summary: ChangeSummary): Promise<boolean>;
	onPackageStart(pkg: PackageConfig): void;
	onPackageComplete(pkg: PackageConfig, result: UpdateResult): void;
	onPackageSkipped(pkg: PackageConfig, reason: string): void;
	onComplete(summary: Summary): void;
	onError(message: string): void;
}
