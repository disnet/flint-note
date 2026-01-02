/**
 * Types for plain markdown directory import
 */

/**
 * Information about a single markdown file found during directory scan
 */
export interface MarkdownFileInfo {
  /** Relative path from root directory (e.g., "movies/horror/scream.md") */
  relativePath: string;
  /** Filename without .md extension, used as note title */
  title: string;
  /** Content of the markdown file */
  content: string;
  /** First-level directory name, or null for root-level files */
  categoryName: string | null;
}

/**
 * Summary information about a markdown directory
 */
export interface MarkdownDirectoryInfo {
  /** Full path to the directory */
  path: string;
  /** Display name (directory basename) */
  name: string;
  /** Total number of markdown files found */
  fileCount: number;
  /** Unique first-level directory names containing markdown files */
  categories: string[];
}

/**
 * Full import data including directory info and all file contents
 */
export interface MarkdownImportData {
  /** Directory summary info */
  directory: MarkdownDirectoryInfo;
  /** All markdown files with their contents */
  files: MarkdownFileInfo[];
}
