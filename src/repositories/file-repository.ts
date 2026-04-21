// File repository interface

export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
}

export interface FileRepository {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /**
   * List entries in a directory. Returns an empty array if the directory
   * does not exist or cannot be read.
   */
  listDir(path: string): Promise<DirectoryEntry[]>;
}
