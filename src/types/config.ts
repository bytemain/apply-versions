// Configuration types

import type { PackageConfig } from './package.js';

export interface Config {
  package: PackageConfig[];
}

export interface CLIOptions {
  config: string;
  dryRun: boolean;
  yes: boolean;
  verbose: boolean;
}
