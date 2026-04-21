// Local file repository implementation

import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import type { DirectoryEntry, FileRepository } from './file-repository.js';

export class LocalFileRepository implements FileRepository {
  async read(path: string): Promise<string> {
    return await readFile(path, 'utf-8');
  }

  async write(path: string, content: string): Promise<void> {
    await writeFile(path, content, 'utf-8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async listDir(path: string): Promise<DirectoryEntry[]> {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }));
    } catch {
      return [];
    }
  }
}
