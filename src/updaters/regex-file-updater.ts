// Regex-based version file updater
// Handles replacing version strings in arbitrary files using regex patterns

import { join } from 'node:path';
import type { FileRepository } from '../repositories/index.js';
import { LocalFileRepository } from '../repositories/index.js';
import type { VersionFileConfig } from '../types/index.js';

const VERSION_PLACEHOLDER = '{{version}}';
// Matches semver-like version strings: major.minor.patch with optional prerelease and build metadata
const VERSION_REGEX_PATTERN = '\\d+\\.\\d+\\.\\d+(?:-[\\w.]+)?(?:\\+[\\w.]+)?';

export interface RegexFileUpdateResult {
  updatedFiles: string[];
  errors: string[];
}

export class RegexFileUpdater {
  private fileRepo: FileRepository;

  constructor(fileRepo?: FileRepository) {
    this.fileRepo = fileRepo ?? new LocalFileRepository();
  }

  /**
   * Update version strings in the specified files using regex patterns.
   *
   * The pattern string supports a `{{version}}` placeholder which matches
   * any semver-like version string. The matched version is replaced with
   * the new version while preserving the surrounding text.
   *
   * Example pattern: `export const VERSION = "{{version}}"`
   * This would match: `export const VERSION = "1.2.3"`
   * And replace to:   `export const VERSION = "2.0.0"`
   */
  async updateVersionFiles(
    packagePath: string,
    versionFiles: VersionFileConfig[],
    newVersion: string,
    dryRun: boolean,
  ): Promise<RegexFileUpdateResult> {
    const updatedFiles: string[] = [];
    const errors: string[] = [];

    for (const versionFile of versionFiles) {
      const filePath = join(packagePath, versionFile.path);

      try {
        const content = await this.fileRepo.read(filePath);
        const regex = this.buildRegex(versionFile.pattern);
        const updatedContent = this.replaceVersion(
          content,
          regex,
          newVersion,
          versionFile.pattern,
        );

        if (updatedContent === content) {
          errors.push(
            `No match found for pattern "${versionFile.pattern}" in ${filePath}`,
          );
          continue;
        }

        if (!dryRun) {
          await this.fileRepo.write(filePath, updatedContent);
        }

        updatedFiles.push(filePath);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to update ${filePath}: ${message}`);
      }
    }

    return { updatedFiles, errors };
  }

  /**
   * Build a RegExp from the pattern string.
   * Replaces `{{version}}` with a regex that captures a version string.
   */
  buildRegex(pattern: string): RegExp {
    if (!pattern.includes(VERSION_PLACEHOLDER)) {
      // Treat the entire pattern as a raw regex with a named capture group
      return new RegExp(pattern, 'g');
    }

    // Split by placeholder and escape each literal part
    const parts = pattern.split(VERSION_PLACEHOLDER);
    const regexParts = parts.map((part) => this.escapeRegex(part));
    // Join with a capture group for the version
    const regexString = regexParts.join(`(${VERSION_REGEX_PATTERN})`);
    return new RegExp(regexString, 'g');
  }

  /**
   * Replace version strings in content using the built regex.
   */
  private replaceVersion(
    content: string,
    regex: RegExp,
    newVersion: string,
    originalPattern: string,
  ): string {
    if (originalPattern.includes(VERSION_PLACEHOLDER)) {
      // For {{version}} patterns: replace the captured version group
      return content.replace(regex, (...args) => {
        // args: [fullMatch, ...captureGroups, offset, string, namedGroups]
        // We need to reconstruct the match with the new version replacing captured groups
        const fullMatch = args[0] as string;
        const captureGroups: string[] = [];

        // Collect all capture groups (they come after fullMatch and before offset)
        for (let i = 1; i < args.length - 2; i++) {
          if (typeof args[i] === 'string') {
            captureGroups.push(args[i]);
          } else {
            break;
          }
        }

        // Replace each captured version in the full match
        let result = fullMatch;
        for (const group of captureGroups) {
          result = result.replace(group, newVersion);
        }
        return result;
      });
    }

    // For raw regex patterns: replace named group (?<version>...) if present
    if (originalPattern.includes('(?<version>')) {
      return content.replace(regex, (...args) => {
        const namedGroups = args[args.length - 1] as
          | Record<string, string>
          | undefined;
        if (namedGroups?.version) {
          const fullMatch = args[0] as string;
          return fullMatch.replace(namedGroups.version, newVersion);
        }
        return args[0];
      });
    }

    // For raw regex without named groups: replace the first capture group
    return content.replace(regex, (...args) => {
      if (typeof args[1] === 'string') {
        const fullMatch = args[0] as string;
        return fullMatch.replace(args[1], newVersion);
      }
      return args[0];
    });
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
