/**
 * Two-way sync between Automerge document and markdown files.
 */

import fs from 'fs';
import path from 'path';
import type { Repo, AutomergeUrl, DocHandle } from '@automerge/automerge-repo';
import {
  generateNoteId,
  titleFromFilename,
  toSafeFilename,
  getUniqueFilename,
  ensureNotesDir,
  ensureTypeDir,
  getTypeName,
  buildMarkdownWithFrontmatter,
  parseMarkdownFile,
  type SyncNote,
  type SyncNoteType
} from './utils';
import { logger } from '../logger';

// Document structure matching the Automerge document
interface NotesDocument {
  notes: Record<string, SyncNote>;
  noteTypes: Record<string, SyncNoteType>;
}

// Map of vaultId -> Map<noteId, filename> for tracking renames
const noteFileMappings = new Map<string, Map<string, string>>();

// Map of vaultId -> Set<filename> for files currently being written (to prevent sync loops)
const filesBeingWritten = new Map<string, Set<string>>();

// Map of vaultId -> FSWatcher for file watching
const fileWatchers = new Map<string, fs.FSWatcher>();

/**
 * Sync a single note to a markdown file.
 * Files are organized by type: notes/<TypeName>/<note-title>.md
 */
function syncNoteToFile(
  baseDirectory: string,
  note: SyncNote,
  noteTypes: Record<string, SyncNoteType> | undefined,
  mappings: Map<string, string>,
  vaultId: string
): void {
  const notesDir = ensureNotesDir(baseDirectory);
  const typeName = getTypeName(noteTypes, note.type);
  const safeTitle = toSafeFilename(note.title);
  const newRelativePath = getUniqueFilename(typeName, safeTitle, note.id, mappings);
  const oldRelativePath = mappings.get(note.id);

  // Ensure the type subdirectory exists
  ensureTypeDir(baseDirectory, typeName);

  // Get or create the set of files being written for this vault
  if (!filesBeingWritten.has(vaultId)) {
    filesBeingWritten.set(vaultId, new Set());
  }
  const writing = filesBeingWritten.get(vaultId)!;

  // If path changed (title rename or type change), delete old file
  if (oldRelativePath && oldRelativePath !== newRelativePath) {
    const oldPath = path.join(notesDir, oldRelativePath);
    writing.add(oldRelativePath);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
      logger.debug(`[MarkdownSync] Deleted old file: ${oldRelativePath}`);
    }
    // Remove from writing set after a short delay
    setTimeout(() => writing.delete(oldRelativePath), 100);
  }

  // Mark file as being written to prevent sync loop
  writing.add(newRelativePath);

  // Write the new file with frontmatter
  const filePath = path.join(notesDir, newRelativePath);
  const fileContent = buildMarkdownWithFrontmatter(note);
  fs.writeFileSync(filePath, fileContent, 'utf-8');

  // Update mapping
  mappings.set(note.id, newRelativePath);

  // Remove from writing set after a short delay to allow fs events to settle
  setTimeout(() => writing.delete(newRelativePath), 100);

  logger.debug(`[MarkdownSync] Synced: ${newRelativePath}`);
}

/**
 * Remove a note's markdown file.
 */
function removeNoteFile(
  baseDirectory: string,
  noteId: string,
  mappings: Map<string, string>,
  vaultId: string
): void {
  const relativePath = mappings.get(noteId);
  if (relativePath) {
    // Get or create the set of files being written for this vault
    if (!filesBeingWritten.has(vaultId)) {
      filesBeingWritten.set(vaultId, new Set());
    }
    const writing = filesBeingWritten.get(vaultId)!;
    writing.add(relativePath);

    const notesDir = path.join(baseDirectory, 'notes');
    const filePath = path.join(notesDir, relativePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug(`[MarkdownSync] Removed: ${relativePath}`);
    }
    mappings.delete(noteId);

    // Remove from writing set after a short delay
    setTimeout(() => writing.delete(relativePath), 100);
  }
}

/**
 * Perform full sync of all notes to markdown files.
 * Returns list of orphaned files (files not matching any note) for import.
 * Orphaned files are returned as relative paths: "TypeName/filename.md"
 */
function fullSync(
  baseDirectory: string,
  notes: Record<string, SyncNote>,
  noteTypes: Record<string, SyncNoteType> | undefined,
  mappings: Map<string, string>,
  vaultId: string
): string[] {
  const notesDir = ensureNotesDir(baseDirectory);

  // Get set of note IDs that should exist
  const activeNoteIds = new Set<string>();

  // Sync all non-archived notes
  for (const [noteId, note] of Object.entries(notes)) {
    if (!note.archived) {
      activeNoteIds.add(noteId);
      syncNoteToFile(baseDirectory, note, noteTypes, mappings, vaultId);
    }
  }

  // Remove files for archived/deleted notes
  for (const [noteId] of mappings) {
    if (!activeNoteIds.has(noteId)) {
      removeNoteFile(baseDirectory, noteId, mappings, vaultId);
    }
  }

  // Find orphaned .md files not in our mappings (to be imported)
  // Need to scan all type subdirectories
  const orphanedFiles: string[] = [];
  const expectedFiles = new Set(mappings.values());
  try {
    const typeDirs = fs.readdirSync(notesDir, { withFileTypes: true });
    for (const dirent of typeDirs) {
      if (dirent.isDirectory()) {
        const typeDir = dirent.name;
        const typeDirPath = path.join(notesDir, typeDir);
        const files = fs.readdirSync(typeDirPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const relativePath = `${typeDir}/${file}`;
            if (!expectedFiles.has(relativePath)) {
              orphanedFiles.push(relativePath);
            }
          }
        }
      }
    }
  } catch {
    // Directory might not exist yet, that's ok
  }

  return orphanedFiles;
}

/**
 * Import an orphaned markdown file as a new note.
 * relativePath is in format "TypeName/filename.md"
 */
function importOrphanedFile(
  relativePath: string,
  baseDirectory: string,
  mappings: Map<string, string>,
  vaultId: string,
  docHandle: DocHandle<NotesDocument>,
  previousNotes: Record<string, SyncNote>
): void {
  const notesDir = path.join(baseDirectory, 'notes');
  const filePath = path.join(notesDir, relativePath);

  // Extract the type directory name and filename
  const pathParts = relativePath.split('/');
  const filename = pathParts[1];

  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    logger.error(`[MarkdownSync] Failed to read orphaned file ${relativePath}:`, err);
    return;
  }

  const parsed = parseMarkdownFile(fileContent);

  if (parsed) {
    // File has frontmatter - check if note exists
    const { id: noteId, title, content, type } = parsed;
    const doc = docHandle.doc();

    if (doc && doc.notes && doc.notes[noteId] && !doc.notes[noteId].archived) {
      // Note exists, just update mapping
      mappings.set(noteId, relativePath);
      logger.debug(`[MarkdownSync] Linked existing note to file: ${relativePath}`);
    } else {
      // Note doesn't exist or is archived, create/restore it
      logger.info(
        `[MarkdownSync] Importing note from file: ${relativePath} -> ${noteId}`
      );
      docHandle.change((doc) => {
        doc.notes[noteId] = {
          id: noteId,
          title,
          content,
          type
        };
      });
      mappings.set(noteId, relativePath);
    }
  } else {
    // No frontmatter - create new note
    // Use filename (without .md) as title
    const title = titleFromFilename(filename);
    const noteId = generateNoteId();
    const content = fileContent;
    const type = 'type-default';

    logger.info(
      `[MarkdownSync] Creating new note from file: ${relativePath} -> ${noteId}`
    );

    docHandle.change((doc) => {
      doc.notes[noteId] = {
        id: noteId,
        title,
        content,
        type
      };
    });

    mappings.set(noteId, relativePath);

    // Write the file back with frontmatter
    const updatedDoc = docHandle.doc();
    syncNoteToFile(
      baseDirectory,
      { id: noteId, title, content, type },
      updatedDoc?.noteTypes,
      mappings,
      vaultId
    );
  }

  // Update previous state
  const updatedDoc = docHandle.doc();
  if (updatedDoc && updatedDoc.notes) {
    Object.assign(previousNotes, updatedDoc.notes);
  }
}

/**
 * Set up two-way sync between Automerge document and markdown files.
 * Returns a cleanup function.
 */
export function setupMarkdownSync(
  vaultId: string,
  repo: Repo,
  docUrl: string,
  baseDirectory: string
): () => void {
  const mappings = new Map<string, string>();
  noteFileMappings.set(vaultId, mappings);

  // Initialize the writing set for this vault
  filesBeingWritten.set(vaultId, new Set());

  // Track previous state for diffing
  let previousNotes: Record<string, SyncNote> = {};
  let docHandle: DocHandle<NotesDocument> | null = null;
  let isSetup = false;
  let fileWatcher: fs.FSWatcher | null = null;

  // Debounce timers for file changes
  const fileChangeTimers = new Map<string, NodeJS.Timeout>();

  // Handle Automerge document changes -> sync to files
  const handleDocChange = ({ doc }: { doc: NotesDocument }): void => {
    if (!doc || !doc.notes) return;

    const currentNotes = doc.notes;
    const noteTypes = doc.noteTypes;

    // Find changed, added, or archived notes
    for (const [noteId, note] of Object.entries(currentNotes)) {
      const prevNote = previousNotes[noteId];

      if (note.archived) {
        // Note was archived, remove file
        if (mappings.has(noteId)) {
          removeNoteFile(baseDirectory, noteId, mappings, vaultId);
        }
      } else if (
        !prevNote ||
        prevNote.title !== note.title ||
        prevNote.content !== note.content ||
        prevNote.archived !== note.archived ||
        prevNote.type !== note.type
      ) {
        // Note is new or changed, sync it
        syncNoteToFile(baseDirectory, note, noteTypes, mappings, vaultId);
      }
    }

    // Find deleted notes (in previous but not in current)
    for (const noteId of Object.keys(previousNotes)) {
      if (!(noteId in currentNotes)) {
        removeNoteFile(baseDirectory, noteId, mappings, vaultId);
      }
    }

    // Update previous state
    previousNotes = { ...currentNotes };
  };

  // Process a file change after debounce
  const processFileChange = (relativePath: string): void => {
    if (!docHandle || !isSetup) return;

    const notesDir = path.join(baseDirectory, 'notes');
    const filePath = path.join(notesDir, relativePath);

    // Extract parts of the path
    const pathParts = relativePath.split('/');
    const filename = pathParts.length > 1 ? pathParts[1] : pathParts[0];

    // Check if file was deleted
    if (!fs.existsSync(filePath)) {
      // Find the note ID from our mappings
      let deletedNoteId: string | null = null;
      for (const [noteId, mappedPath] of mappings) {
        if (mappedPath === relativePath) {
          deletedNoteId = noteId;
          break;
        }
      }

      if (deletedNoteId) {
        logger.info(`[MarkdownSync] File deleted, archiving note: ${relativePath}`);
        // Archive the note in Automerge
        docHandle.change((doc) => {
          if (doc.notes && doc.notes[deletedNoteId!]) {
            doc.notes[deletedNoteId!].archived = true;
          }
        });
        mappings.delete(deletedNoteId);
        // Update previous state
        const doc = docHandle.doc();
        if (doc && doc.notes) {
          previousNotes = { ...doc.notes };
        }
      }
      return;
    }

    // Read and parse the file
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      logger.error(`[MarkdownSync] Failed to read file ${relativePath}:`, err);
      return;
    }

    const parsed = parseMarkdownFile(fileContent);

    // If no valid frontmatter, this is a new file created externally
    if (!parsed) {
      const title = titleFromFilename(filename);
      const noteId = generateNoteId();
      const content = fileContent;
      const type = 'type-default';

      logger.info(
        `[MarkdownSync] New file detected, creating note: ${relativePath} -> ${noteId}`
      );

      // Create the note in Automerge
      docHandle.change((doc) => {
        doc.notes[noteId] = {
          id: noteId,
          title,
          content,
          type
        };
      });

      // Update mappings
      mappings.set(noteId, relativePath);

      // Write the file back with frontmatter
      const updatedDoc = docHandle.doc();
      syncNoteToFile(
        baseDirectory,
        { id: noteId, title, content, type },
        updatedDoc?.noteTypes,
        mappings,
        vaultId
      );

      // Update previous state
      if (updatedDoc && updatedDoc.notes) {
        previousNotes = { ...updatedDoc.notes };
      }
      return;
    }

    const { id: noteId, title, content, type } = parsed;

    // Get current doc state
    const doc = docHandle.doc();
    if (!doc || !doc.notes) return;

    const existingNote = doc.notes[noteId];

    // Check if anything actually changed
    if (
      existingNote &&
      existingNote.content === content &&
      existingNote.title === title &&
      existingNote.type === type
    ) {
      return;
    }

    logger.debug(`[MarkdownSync] File changed, updating note: ${relativePath}`);

    // Update the note in Automerge
    docHandle.change((doc) => {
      if (doc.notes[noteId]) {
        // Update existing note
        doc.notes[noteId].content = content;
        doc.notes[noteId].title = title;
        doc.notes[noteId].type = type;
      } else {
        // Note doesn't exist (maybe was created externally) - create it
        doc.notes[noteId] = {
          id: noteId,
          title,
          content,
          type
        };
      }
    });

    // Update mappings and previous state
    mappings.set(noteId, relativePath);
    const updatedDoc = docHandle.doc();
    if (updatedDoc && updatedDoc.notes) {
      previousNotes = { ...updatedDoc.notes };
    }
  };

  // Handle file system changes -> sync to Automerge
  const handleFileChange = (_eventType: string, filename: string | null): void => {
    if (!filename) return;
    if (!docHandle || !isSetup) return;

    // Only process .md files
    if (!filename.endsWith('.md')) return;

    // Convert backslashes to forward slashes for consistency (Windows)
    const relativePath = filename.replace(/\\/g, '/');

    // Check if we're currently writing this file (prevent sync loop)
    const writing = filesBeingWritten.get(vaultId);
    if (writing && writing.has(relativePath)) {
      return;
    }

    // Debounce file changes
    if (fileChangeTimers.has(relativePath)) {
      clearTimeout(fileChangeTimers.get(relativePath));
    }

    fileChangeTimers.set(
      relativePath,
      setTimeout(() => {
        fileChangeTimers.delete(relativePath);
        processFileChange(relativePath);
      }, 200)
    );
  };

  // Set up async
  const setup = async (): Promise<void> => {
    try {
      // Get the document handle
      docHandle = await repo.find<NotesDocument>(docUrl as AutomergeUrl);

      const doc = docHandle.doc();

      if (doc && doc.notes) {
        logger.info(`[MarkdownSync] Initial sync for vault: ${vaultId}`);
        previousNotes = { ...doc.notes };
        const noteTypes = doc.noteTypes;
        const orphanedFiles = fullSync(
          baseDirectory,
          doc.notes,
          noteTypes,
          mappings,
          vaultId
        );

        // Import any orphaned files (created while sync wasn't running)
        for (const filename of orphanedFiles) {
          importOrphanedFile(
            filename,
            baseDirectory,
            mappings,
            vaultId,
            docHandle,
            previousNotes
          );
        }
      }

      // Subscribe to Automerge document changes
      docHandle.on('change', handleDocChange);

      // Set up file watcher for the notes directory (recursive to watch type subdirectories)
      const notesDir = ensureNotesDir(baseDirectory);
      fileWatcher = fs.watch(
        notesDir,
        { persistent: true, recursive: true },
        handleFileChange
      );
      fileWatchers.set(vaultId, fileWatcher);

      isSetup = true;

      logger.info(`[MarkdownSync] Two-way sync active for vault: ${vaultId}`);
    } catch (err) {
      logger.error(`[MarkdownSync] Setup failed for vault ${vaultId}:`, err);
    }
  };

  // Start setup
  setup();

  // Return cleanup function
  return () => {
    if (docHandle && isSetup) {
      docHandle.off('change', handleDocChange);
    }

    // Clean up file watcher
    if (fileWatcher) {
      fileWatcher.close();
      fileWatchers.delete(vaultId);
    }

    // Clear any pending debounce timers
    for (const timer of fileChangeTimers.values()) {
      clearTimeout(timer);
    }

    noteFileMappings.delete(vaultId);
    filesBeingWritten.delete(vaultId);
  };
}
