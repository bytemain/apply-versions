// Regex file updater tests

import { beforeEach, describe, expect, it } from 'vitest';
import { RegexFileUpdater } from '../../src/updaters/regex-file-updater.js';
import { MockFileRepository } from '../test-utils.js';

describe('RegexFileUpdater', () => {
  let updater: RegexFileUpdater;
  let mockFileRepo: MockFileRepository;

  beforeEach(() => {
    mockFileRepo = new MockFileRepository();
    updater = new RegexFileUpdater(mockFileRepo);
  });

  describe('buildRegex', () => {
    it('should build regex from pattern with {{version}} placeholder', () => {
      const regex = updater.buildRegex('export const VERSION = "{{version}}"');
      expect(regex).toBeInstanceOf(RegExp);
      expect('export const VERSION = "1.2.3"').toMatch(regex);
      expect('export const VERSION = "0.0.1"').toMatch(regex);
      expect('export const VERSION = "1.2.3-beta.1"').toMatch(regex);
    });

    it('should escape special regex characters in the literal parts', () => {
      const regex = updater.buildRegex('version = "{{version}}" // (note)');
      expect(regex).toBeInstanceOf(RegExp);
      expect('version = "1.0.0" // (note)').toMatch(regex);
      expect('version = "1.0.0" // note').not.toMatch(regex);
    });

    it('should support patterns without {{version}} as raw regex', () => {
      const regex = updater.buildRegex(
        'VERSION\\s*=\\s*"(\\d+\\.\\d+\\.\\d+)"',
      );
      expect(regex).toBeInstanceOf(RegExp);
      expect('VERSION = "1.2.3"').toMatch(regex);
    });

    it('should support multiple {{version}} placeholders', () => {
      const regex = updater.buildRegex(
        '"version": "{{version}}", "min": "{{version}}"',
      );
      expect(regex).toBeInstanceOf(RegExp);
      expect('"version": "1.2.3", "min": "1.2.3"').toMatch(regex);
    });
  });

  describe('updateVersionFiles', () => {
    it('should replace version in a TypeScript file using {{version}} pattern', async () => {
      const tsContent = `// version.ts
export const VERSION = "1.0.0";
export const NAME = "my-app";
`;

      mockFileRepo.setFile('/project/src/version.ts', tsContent);

      const result = await updater.updateVersionFiles(
        '/project',
        [{ path: 'src/version.ts', pattern: 'VERSION = "{{version}}"' }],
        '2.0.0',
        false,
      );

      expect(result.updatedFiles).toEqual(['/project/src/version.ts']);
      expect(result.errors).toEqual([]);

      const updated = mockFileRepo.getFileContent('/project/src/version.ts');
      expect(updated).toContain('VERSION = "2.0.0"');
      expect(updated).toContain('NAME = "my-app"');
    });

    it('should replace version with prerelease suffix', async () => {
      const tsContent = 'export const VERSION = "1.0.0-beta.1";\n';

      mockFileRepo.setFile('/project/src/version.ts', tsContent);

      const result = await updater.updateVersionFiles(
        '/project',
        [{ path: 'src/version.ts', pattern: 'VERSION = "{{version}}"' }],
        '1.0.0',
        false,
      );

      expect(result.updatedFiles).toEqual(['/project/src/version.ts']);
      const updated = mockFileRepo.getFileContent('/project/src/version.ts');
      expect(updated).toBe('export const VERSION = "1.0.0";\n');
    });

    it('should handle multiple version_files', async () => {
      mockFileRepo.setFile(
        '/project/src/version.ts',
        'export const VERSION = "1.0.0";\n',
      );
      mockFileRepo.setFile(
        '/project/src/config.ts',
        'export const API_VERSION = "1.0.0";\n',
      );

      const result = await updater.updateVersionFiles(
        '/project',
        [
          { path: 'src/version.ts', pattern: 'VERSION = "{{version}}"' },
          {
            path: 'src/config.ts',
            pattern: 'API_VERSION = "{{version}}"',
          },
        ],
        '2.0.0',
        false,
      );

      expect(result.updatedFiles).toHaveLength(2);
      expect(result.errors).toEqual([]);

      expect(mockFileRepo.getFileContent('/project/src/version.ts')).toContain(
        'VERSION = "2.0.0"',
      );
      expect(mockFileRepo.getFileContent('/project/src/config.ts')).toContain(
        'API_VERSION = "2.0.0"',
      );
    });

    it('should not write files in dry run mode', async () => {
      const originalContent = 'export const VERSION = "1.0.0";\n';
      mockFileRepo.setFile('/project/src/version.ts', originalContent);

      const result = await updater.updateVersionFiles(
        '/project',
        [{ path: 'src/version.ts', pattern: 'VERSION = "{{version}}"' }],
        '2.0.0',
        true,
      );

      expect(result.updatedFiles).toEqual(['/project/src/version.ts']);
      // File should remain unchanged in dry run mode
      expect(mockFileRepo.getFileContent('/project/src/version.ts')).toBe(
        originalContent,
      );
    });

    it('should report error when pattern does not match', async () => {
      mockFileRepo.setFile(
        '/project/src/version.ts',
        'export const NAME = "my-app";\n',
      );

      const result = await updater.updateVersionFiles(
        '/project',
        [{ path: 'src/version.ts', pattern: 'VERSION = "{{version}}"' }],
        '2.0.0',
        false,
      );

      expect(result.updatedFiles).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('No match found');
    });

    it('should report error when file does not exist', async () => {
      const result = await updater.updateVersionFiles(
        '/project',
        [
          {
            path: 'src/nonexistent.ts',
            pattern: 'VERSION = "{{version}}"',
          },
        ],
        '2.0.0',
        false,
      );

      expect(result.updatedFiles).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to update');
    });

    it('should handle raw regex with named capture group', async () => {
      const content = 'const version = "1.0.0";\n';
      mockFileRepo.setFile('/project/src/version.ts', content);

      const result = await updater.updateVersionFiles(
        '/project',
        [
          {
            path: 'src/version.ts',
            pattern: 'const version = "(?<version>\\d+\\.\\d+\\.\\d+)"',
          },
        ],
        '3.0.0',
        false,
      );

      expect(result.updatedFiles).toEqual(['/project/src/version.ts']);
      const updated = mockFileRepo.getFileContent('/project/src/version.ts');
      expect(updated).toBe('const version = "3.0.0";\n');
    });

    it('should handle raw regex with first capture group', async () => {
      const content = 'version: "1.0.0"\n';
      mockFileRepo.setFile('/project/config.yaml', content);

      const result = await updater.updateVersionFiles(
        '/project',
        [
          {
            path: 'config.yaml',
            pattern: 'version: "(\\d+\\.\\d+\\.\\d+)"',
          },
        ],
        '4.0.0',
        false,
      );

      expect(result.updatedFiles).toEqual(['/project/config.yaml']);
      const updated = mockFileRepo.getFileContent('/project/config.yaml');
      expect(updated).toBe('version: "4.0.0"\n');
    });

    it('should replace all occurrences when pattern matches multiple times', async () => {
      const content = `const VERSION = "1.0.0";
const FALLBACK_VERSION = "1.0.0";
`;
      mockFileRepo.setFile('/project/src/version.ts', content);

      const result = await updater.updateVersionFiles(
        '/project',
        [
          {
            path: 'src/version.ts',
            pattern: '"{{version}}"',
          },
        ],
        '2.0.0',
        false,
      );

      expect(result.updatedFiles).toEqual(['/project/src/version.ts']);
      const updated = mockFileRepo.getFileContent('/project/src/version.ts');
      expect(updated).toContain('VERSION = "2.0.0"');
      expect(updated).toContain('FALLBACK_VERSION = "2.0.0"');
    });

    it('should handle version in single quotes', async () => {
      const content = "export const VERSION = '1.0.0';\n";
      mockFileRepo.setFile('/project/src/version.ts', content);

      const result = await updater.updateVersionFiles(
        '/project',
        [{ path: 'src/version.ts', pattern: "VERSION = '{{version}}'" }],
        '2.0.0',
        false,
      );

      expect(result.updatedFiles).toEqual(['/project/src/version.ts']);
      const updated = mockFileRepo.getFileContent('/project/src/version.ts');
      expect(updated).toBe("export const VERSION = '2.0.0';\n");
    });

    it('should handle Python-style version assignment', async () => {
      const content = '__version__ = "1.0.0"\n';
      mockFileRepo.setFile('/project/__init__.py', content);

      const result = await updater.updateVersionFiles(
        '/project',
        [
          {
            path: '__init__.py',
            pattern: '__version__ = "{{version}}"',
          },
        ],
        '2.1.0',
        false,
      );

      expect(result.updatedFiles).toEqual(['/project/__init__.py']);
      const updated = mockFileRepo.getFileContent('/project/__init__.py');
      expect(updated).toBe('__version__ = "2.1.0"\n');
    });

    it('should handle partial failure across multiple files', async () => {
      mockFileRepo.setFile(
        '/project/src/version.ts',
        'export const VERSION = "1.0.0";\n',
      );
      // Second file doesn't exist

      const result = await updater.updateVersionFiles(
        '/project',
        [
          { path: 'src/version.ts', pattern: 'VERSION = "{{version}}"' },
          {
            path: 'src/nonexistent.ts',
            pattern: 'VERSION = "{{version}}"',
          },
        ],
        '2.0.0',
        false,
      );

      expect(result.updatedFiles).toEqual(['/project/src/version.ts']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to update');
    });

    it('should handle version with build metadata', async () => {
      const content = 'export const VERSION = "1.0.0+build.123";\n';
      mockFileRepo.setFile('/project/src/version.ts', content);

      const result = await updater.updateVersionFiles(
        '/project',
        [{ path: 'src/version.ts', pattern: 'VERSION = "{{version}}"' }],
        '2.0.0',
        false,
      );

      expect(result.updatedFiles).toEqual(['/project/src/version.ts']);
      const updated = mockFileRepo.getFileContent('/project/src/version.ts');
      expect(updated).toBe('export const VERSION = "2.0.0";\n');
    });
  });
});
