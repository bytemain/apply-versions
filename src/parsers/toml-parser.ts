// TOML configuration parser

import { readFile } from 'node:fs/promises';
import * as TOML from 'smol-toml';
import type { Config, PackageConfig } from '../types/index.js';

export class ConfigParser {
  async parse(filePath: string): Promise<PackageConfig[]> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed = TOML.parse(content) as unknown as Config;

      if (!parsed.package || !Array.isArray(parsed.package)) {
        throw new Error(
          'Invalid configuration: missing or invalid "package" array',
        );
      }

      return parsed.package;
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          throw new Error(`Configuration file not found: ${filePath}`);
        }
        throw new Error(`Failed to parse configuration: ${error.message}`);
      }
      throw error;
    }
  }
}
