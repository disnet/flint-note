/**
 * Utility functions for markdown file sync
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * Note metadata interface (without content) matching the Automerge document structure
 */
export interface SyncNoteMetadata {
  id: string;
  title: string;
  type: string;
  archived?: boolean;
  props?: Record<string, unknown>;
}

/**
 * Full note interface with content (for file sync operations)
 */
export interface SyncNote {
  id: string;
  title: string;
  content: string;
  type: string;
  archived?: boolean;
  props?: Record<string, unknown>;
}

/**
 * Content document interface for per-note content storage
 */
export interface SyncNoteContentDocument {
  noteId: string;
  content: string;
}

/**
 * NoteType interface
 */
export interface SyncNoteType {
  id: string;
  name: string;
}

/**
 * Generate a new note ID.
 */
export function generateNoteId(): string {
  const bytes = new Uint8Array(4);
  // Use crypto.getRandomValues if available (Node 15+), otherwise Math.random fallback
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `n-${hex}`;
}

/**
 * Extract title from filename (remove .md extension and any counter suffix).
 */
export function titleFromFilename(filename: string): string {
  let title = filename.replace(/\.md$/, '');
  // Remove counter suffix like " (1)", " (2)", etc.
  title = title.replace(/\s+\(\d+\)$/, '');
  return title;
}

/**
 * Convert a note title to a safe filename.
 * Removes/replaces characters that are invalid in filenames.
 */
export function toSafeFilename(title: string): string {
  if (!title || title.trim() === '') {
    return 'Untitled';
  }

  // Replace invalid filename characters with safe alternatives
  let safe = title
    .replace(/[<>:"/\\|?*]/g, '-') // Invalid on Windows
    // eslint-disable-next-line no-control-regex -- Intentionally matching control characters for filename sanitization
    .replace(/[\x00-\x1f]/g, '') // Control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Remove leading/trailing dots and spaces (Windows restriction)
  safe = safe.replace(/^[.\s]+|[.\s]+$/g, '');

  // Limit length (leave room for .md extension and potential counter)
  if (safe.length > 200) {
    safe = safe.substring(0, 200).trim();
  }

  return safe || 'Untitled';
}

/**
 * Get a unique filename for a note, handling duplicates.
 * Returns a relative path including the type subdirectory: "TypeName/filename.md"
 */
export function getUniqueFilename(
  typeName: string,
  baseFilename: string,
  noteId: string,
  existingMappings: Map<string, string>
): string {
  const safeTypeName = toSafeFilename(typeName);
  // Check if another note already uses this filename in the same type directory
  let filename = `${baseFilename}.md`;
  let relativePath = `${safeTypeName}/${filename}`;
  let counter = 1;

  // Use case-insensitive comparison for collision detection on case-insensitive filesystems
  // Keep checking until we find a path with no collisions
  let hasCollision = true;
  while (hasCollision) {
    hasCollision = false;
    for (const [id, existingPath] of existingMappings) {
      if (id !== noteId && existingPath.toLowerCase() === relativePath.toLowerCase()) {
        // Collision detected, add counter and restart check
        filename = `${baseFilename} (${counter}).md`;
        relativePath = `${safeTypeName}/${filename}`;
        counter++;
        hasCollision = true;
        break; // Restart the check with new path
      }
    }
  }

  return relativePath;
}

/**
 * Ensure the notes directory exists.
 */
export function ensureNotesDir(baseDirectory: string): string {
  const notesDir = path.join(baseDirectory, 'notes');
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true });
  }
  return notesDir;
}

/**
 * Ensure a type subdirectory exists within the notes directory.
 * Returns the full path to the type directory.
 */
export function ensureTypeDir(baseDirectory: string, typeName: string): string {
  const safeTypeName = toSafeFilename(typeName);
  const typeDir = path.join(baseDirectory, 'notes', safeTypeName);
  if (!fs.existsSync(typeDir)) {
    fs.mkdirSync(typeDir, { recursive: true });
  }
  return typeDir;
}

/**
 * Get the type name from noteTypes, defaulting to 'Note' for the default type.
 */
export function getTypeName(
  noteTypes: Record<string, SyncNoteType> | undefined,
  typeId: string
): string {
  if (!typeId || typeId === 'type-default') {
    return 'Note';
  }
  const noteType = noteTypes?.[typeId];
  return noteType?.name || 'Note';
}

/**
 * Build markdown content with YAML frontmatter.
 */
export function buildMarkdownWithFrontmatter(note: SyncNote): string {
  const frontmatterData: Record<string, unknown> = {
    id: note.id,
    title: note.title || '',
    type: note.type || 'type-default'
  };

  // Only add props section if there are props to write
  if (note.props && Object.keys(note.props).length > 0) {
    frontmatterData.props = note.props;
  }

  const frontmatter = `---\n${yaml.dump(frontmatterData)}---\n\n`;
  const content = note.content || '';
  return frontmatter + content;
}

/**
 * Parsed markdown file result
 */
export interface ParsedMarkdownFile {
  id: string;
  title: string;
  content: string;
  type: string;
  props?: Record<string, unknown>;
}

/**
 * Parse a markdown file with YAML frontmatter.
 * Returns parsed data or null if parsing fails.
 */
export function parseMarkdownFile(fileContent: string): ParsedMarkdownFile | null {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/;
  const match = fileContent.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  try {
    const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
    const content = match[2] || '';

    if (!frontmatter || !frontmatter.id) {
      return null;
    }

    // Known system fields that should not be treated as custom props
    const systemFields = new Set(['id', 'title', 'type', 'props']);

    // Start with explicitly namespaced props, or empty object
    const props: Record<string, unknown> = {};

    // Add explicitly namespaced props from the props key
    if (frontmatter.props && typeof frontmatter.props === 'object') {
      Object.assign(props, frontmatter.props as Record<string, unknown>);
    }

    // Collect unknown fields into props (for backward compatibility and external edits)
    for (const [key, value] of Object.entries(frontmatter)) {
      if (!systemFields.has(key)) {
        props[key] = value;
      }
    }

    return {
      id: frontmatter.id as string,
      title: (frontmatter.title as string) || '',
      content,
      type: (frontmatter.type as string) || 'type-default',
      props: Object.keys(props).length > 0 ? props : undefined
    };
  } catch (err) {
    console.error('[MarkdownSync] Failed to parse frontmatter:', err);
    return null;
  }
}

/**
 * Deep equality comparison for props objects.
 * Returns true if both values have the same structure and values.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;

  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
    if (!deepEqual(objA[key], objB[key])) return false;
  }

  return true;
}

/**
 * Check if props have changed between two notes.
 * Returns true if props are different, false if they are the same.
 */
export function propsChanged(
  propsA: Record<string, unknown> | undefined,
  propsB: Record<string, unknown> | undefined
): boolean {
  if (propsA === propsB) return false;
  if (!propsA && !propsB) return false;
  if (!propsA || !propsB) return true;
  return !deepEqual(propsA, propsB);
}
