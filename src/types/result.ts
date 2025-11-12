// Result types

import type { PackageConfig } from './package.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface UpdateSuccess {
  success: true;
  oldVersion: string;
  newVersion: string;
  updatedWorkspaceDeps?: string[];
  additionalFiles?: string[]; // Additional files to stage in git (e.g., package-lock.json)
}

export interface UpdateFailure {
  success: false;
  error: string;
}

export type UpdateResult = UpdateSuccess | UpdateFailure;

export interface GitOperationResult {
  success: boolean;
  commitHash?: string;
  tagName?: string;
  error?: string;
}

export interface ChangeSummary {
  toUpdate: number;
  toSkip: number;
  commits: number;
  tags: string[];
}

export interface Summary {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  commits: number;
  tags: number;
}

export interface ProcessResult {
  package: PackageConfig;
  updated: boolean;
  skipped: boolean;
  error?: string;
  updateResult?: UpdateResult;
  gitResult?: GitOperationResult;
}
