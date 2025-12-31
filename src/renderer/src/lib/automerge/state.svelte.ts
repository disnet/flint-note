/**
 * Unified reactive state management for Flint notes using Automerge
 *
 * This module provides:
 * - Reactive state via Svelte 5 runes
 * - All note/workspace/type mutations via Automerge
 * - Vault management (localStorage for metadata)
 */

/* eslint-disable svelte/prefer-svelte-reactivity -- Date used for computation in utility functions */

import * as Automerge from '@automerge/automerge';
import type { DocHandle } from '@automerge/automerge-repo';
import type {
  Note,
  NoteMetadata,
  NoteContentDocument,
  NoteType,
  NotesDocument,
  Vault,
  Workspace,
  PropertyDefinition,
  Conversation,
  ConversationIndexEntry,
  PersistedChatMessage,
  PersistedToolCall,
  SidebarItemRef,
  SidebarItem,
  ActiveItem,
  SystemView,
  InboxNote,
  AgentRoutine,
  RecurringSpec,
  SupplementaryMaterial,
  RoutineListItem,
  RoutineDueType,
  CreateRoutineInput,
  UpdateRoutineInput,
  CompleteRoutineInput,
  ListRoutinesInput,
  NoteFilter,
  NoteFilterInput,
  SourceFormat,
  ReviewData,
  ReviewHistoryEntry,
  ReviewStatus
} from './types';
import { conversationOpfsStorage } from './conversation-opfs-storage.svelte';
import {
  getFilterFieldValue,
  applyFilterOperator,
  EMPTY_FILTER_VALUE
} from './filter-utils.svelte';
import {
  generateNoteId,
  generateWorkspaceId,
  generateNoteTypeId,
  generateConversationId,
  generateMessageId,
  generateRoutineId,
  generateRoutineCompletionId,
  generateRoutineMaterialId,
  nowISO,
  clone,
  cloneIfObject
} from './utils';
import {
  createRepo,
  getRepo,
  findDocument,
  initializeVaults,
  saveVaults,
  setActiveVaultId as setActiveVaultIdStorage,
  createVault as createVaultInRepo,
  updateVault as updateVaultInRepo,
  connectVaultSync,
  disconnectVaultSync,
  getCurrentSyncedVaultId,
  isFileSyncAvailable,
  selectSyncDirectory,
  clearAllVaults
} from './repo';
import {
  getContentHandle,
  findContentHandle,
  clearContentCache
} from './content-docs.svelte';
import { searchIndex } from './search-index.svelte';
import { parseDeckYaml, type DeckConfig } from '../../../../shared/deck-yaml-utils';

// --- Private reactive state ---

let currentDoc = $state<NotesDocument>({
  notes: {},
  workspaces: {},
  activeWorkspaceId: '',
  noteTypes: {}
});

let docHandle: DocHandle<NotesDocument> | null = null;

// Vault state
let vaults = $state<Vault[]>([]);
let activeVaultId = $state<string | null>(null);

// UI state (persisted in Automerge document's lastViewState)
let activeItem = $state<ActiveItem>(null);
let activeSystemView = $state<SystemView>(null);
let selectedNoteTypeId = $state<string | null>(null);

// Loading states
let isInitialized = $state(false);
let isLoading = $state(true);

// Conversation cache - stores loaded conversations from OPFS
const conversationCache = new Map<string, Conversation>();

// Default note type ID
const DEFAULT_NOTE_TYPE_ID = 'type-default';

// System note types that have protected names and cannot be archived
// Their purpose, icon, properties, and other fields can still be modified
const PROTECTED_TYPE_IDS = new Set(['type-default', 'type-daily']);

/**
 * Check if a note type ID is a protected system type
 */
export function isProtectedType(typeId: string): boolean {
  return PROTECTED_TYPE_IDS.has(typeId);
}

/**
 * Get the source format for a note.
 * Determines which viewer/editor to use, independent of the organizational note type.
 * Handles backward compatibility by inferring from note type if sourceFormat is not set.
 */
export function getSourceFormat(note: NoteMetadata): SourceFormat {
  // If sourceFormat is explicitly set, use it
  if (note.sourceFormat) {
    return note.sourceFormat;
  }

  // Backward compatibility: infer from note type
  switch (note.type) {
    case PDF_NOTE_TYPE_ID:
      return 'pdf';
    case EPUB_NOTE_TYPE_ID:
      return 'epub';
    case WEBPAGE_NOTE_TYPE_ID:
      return 'webpage';
    case DECK_NOTE_TYPE_ID:
      return 'deck';
    default:
      return 'markdown';
  }
}

// --- Initialization ---

/**
 * Initialize the state system
 * Creates repo, loads vaults, and subscribes to document changes
 * If no vaults exist, initializes in "no vault" state for first-time experience
 */
export async function initializeState(vaultId?: string): Promise<void> {
  isLoading = true;

  try {
    const repo = createRepo();

    // Initialize vaults
    const { vaults: loadedVaults, activeVault } = await initializeVaults(repo);
    vaults = loadedVaults;

    // If no active vault, we're in first-time experience mode
    if (!activeVault) {
      activeVaultId = null;
      isInitialized = true;
      return;
    }

    // Use provided vaultId or the active vault
    const targetVault = vaultId
      ? loadedVaults.find((v) => v.id === vaultId) || activeVault
      : activeVault;

    activeVaultId = targetVault.id;

    // Load the document
    let handle;
    try {
      handle = await findDocument(repo, targetVault.docUrl);
    } catch (error) {
      // Document is unavailable - this typically happens when IndexedDB was cleared
      // but localStorage still has vault data. Clear the orphaned vault data and
      // go to first-time experience mode.
      console.warn(
        'Document unavailable, clearing orphaned vault data:',
        error instanceof Error ? error.message : error
      );

      // Clear all vault data since the documents no longer exist
      clearAllVaults();
      vaults = [];
      activeVaultId = null;
      isInitialized = true;
      return;
    }

    docHandle = handle;

    // Get initial state
    const doc = handle.doc();
    if (doc) {
      currentDoc = doc;
    }

    // Ensure default note type exists (migration for existing vaults)
    ensureDefaultNoteType();

    // Migrate notes with special types to have explicit sourceFormat
    migrateSourceFormat();

    // Run schema versioned migrations
    runSchemaMigrations();

    // Migrate deck notes from YAML content to structured props (async, runs in background)
    migrateDeckConfigsToProps().catch((err) => {
      console.error('[Migration] Deck config migration failed:', err);
    });

    // Restore last view state if available
    restoreLastViewState();

    // Subscribe to future changes
    handle.on('change', ({ doc }) => {
      currentDoc = doc;
    });

    // Connect file sync if vault has baseDirectory
    if (targetVault.baseDirectory) {
      await connectVaultSync(repo, targetVault);

      // Set up file sync listener for files added from filesystem
      // Using dynamic import to avoid circular dependency with file-sync.svelte.ts
      try {
        const { setupFileSyncListener } = await import('./file-sync.svelte');
        setupFileSyncListener();
      } catch (error) {
        console.error('[FileSync] Failed to set up file sync listener:', error);
      }
    }

    // Initialize search index in background
    initializeSearchIndex();

    isInitialized = true;
  } finally {
    isLoading = false;
  }
}

/**
 * Ensure the default note type exists in the document
 */
function ensureDefaultNoteType(): void {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc?.noteTypes?.[DEFAULT_NOTE_TYPE_ID]) {
    docHandle.change((d) => {
      if (!d.noteTypes) {
        d.noteTypes = {};
      }
      if (!d.noteTypes[DEFAULT_NOTE_TYPE_ID]) {
        d.noteTypes[DEFAULT_NOTE_TYPE_ID] = {
          id: DEFAULT_NOTE_TYPE_ID,
          name: 'Note',
          purpose: 'General purpose notes',
          icon: '📝',
          archived: false,
          created: nowISO()
        };
      }
    });
  }
}

/**
 * Migrate existing notes with legacy source type IDs.
 * - Sets explicit sourceFormat based on the legacy type
 * - Changes note type to DEFAULT_NOTE_TYPE_ID
 * - Removes the legacy type entries from noteTypes
 */
function migrateSourceFormat(): void {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc?.notes) return;

  const LEGACY_TYPE_IDS = [
    PDF_NOTE_TYPE_ID,
    EPUB_NOTE_TYPE_ID,
    WEBPAGE_NOTE_TYPE_ID,
    DECK_NOTE_TYPE_ID
  ];

  // Find notes that need migration: have legacy type ID
  const allNotes = Object.values(doc.notes) as NoteMetadata[];
  const notesToMigrate = allNotes.filter((note) => {
    return LEGACY_TYPE_IDS.includes(note.type);
  });

  // Check if we need to remove legacy type entries
  const legacyTypesToRemove = LEGACY_TYPE_IDS.filter((typeId) => doc.noteTypes?.[typeId]);

  if (notesToMigrate.length === 0 && legacyTypesToRemove.length === 0) return;

  if (notesToMigrate.length > 0) {
    console.log(
      `[Migration] Migrating ${notesToMigrate.length} notes from legacy type IDs`
    );
  }
  if (legacyTypesToRemove.length > 0) {
    console.log(
      `[Migration] Removing ${legacyTypesToRemove.length} legacy note type entries`
    );
  }

  docHandle.change((d) => {
    // Migrate notes
    for (const note of notesToMigrate) {
      const docNote = d.notes[note.id];
      if (!docNote) continue;

      // Set sourceFormat based on current type (if not already set)
      if (!docNote.sourceFormat) {
        switch (note.type) {
          case PDF_NOTE_TYPE_ID:
            docNote.sourceFormat = 'pdf';
            break;
          case EPUB_NOTE_TYPE_ID:
            docNote.sourceFormat = 'epub';
            break;
          case WEBPAGE_NOTE_TYPE_ID:
            docNote.sourceFormat = 'webpage';
            break;
          case DECK_NOTE_TYPE_ID:
            docNote.sourceFormat = 'deck';
            break;
        }
      }

      // Change type to default
      docNote.type = DEFAULT_NOTE_TYPE_ID;
    }

    // Remove legacy type entries
    for (const typeId of legacyTypesToRemove) {
      if (d.noteTypes?.[typeId]) {
        delete d.noteTypes[typeId];
      }
    }
  });
}

// ============================================================================
// Schema Versioning & Migrations
// ============================================================================

/** Current schema version - increment when adding new migrations */
const CURRENT_SCHEMA_VERSION = 2;

/**
 * Migration v1: Clean up legacy props from old migrations.
 * - Removes standard Note field keys from props (flint_id, flint_title, etc.)
 * - Converts flattened review props to structured ReviewData
 */
function migratePropsCleanup(d: NotesDocument): void {
  if (!d.notes) return;

  const LEGACY_PROP_KEYS = new Set([
    'flint_id',
    'id',
    'flint_title',
    'title',
    'flint_type',
    'type',
    'flint_kind',
    'flint_filename',
    'flint_created',
    'created',
    'flint_updated',
    'updated',
    'flint_archived',
    'archived',
    'flint_lastOpened',
    'lastOpened'
  ]);

  const REVIEW_PROP_KEYS = new Set([
    'reviewEnabled',
    'reviewCount',
    'reviewSessionNumber',
    'reviewInterval',
    'reviewStatus',
    'reviewHistory',
    'reviewNextReview',
    'reviewLastReviewed'
  ]);

  for (const noteId of Object.keys(d.notes)) {
    const note = d.notes[noteId];
    if (!note?.props) continue;

    // Remove legacy prop keys
    for (const key of LEGACY_PROP_KEYS) {
      if (key in note.props) {
        delete note.props[key];
      }
    }

    // Convert flattened review props to ReviewData
    if (!note.review && note.props.reviewEnabled !== undefined) {
      const reviewHistory = (note.props.reviewHistory as ReviewHistoryEntry[]) ?? [];
      note.review = {
        enabled: Boolean(note.props.reviewEnabled),
        lastReviewed: (note.props.reviewLastReviewed as string) || null,
        nextSessionNumber: (note.props.reviewSessionNumber as number) ?? 1,
        currentInterval: (note.props.reviewInterval as number) ?? 1,
        status: (note.props.reviewStatus as ReviewStatus) ?? 'active',
        reviewCount: (note.props.reviewCount as number) ?? 0,
        reviewHistory: clone(reviewHistory)
      };
    }

    // Remove flattened review props
    for (const key of REVIEW_PROP_KEYS) {
      if (key in note.props) {
        delete note.props[key];
      }
    }

    // Remove empty props object
    if (Object.keys(note.props).length === 0) {
      delete note.props;
    }
  }
}

/**
 * Migration v2: Convert deck filter field names to new props.* convention.
 * - System fields: flint_type -> type, flint_title -> title, etc.
 * - Custom props: fieldname -> props.fieldname
 */
function migrateDeckFieldNames(d: NotesDocument): void {
  if (!d.notes) return;

  const FLINT_TO_SYSTEM: Record<string, string> = {
    flint_type: 'type',
    flint_title: 'title',
    flint_created: 'created',
    flint_updated: 'updated',
    flint_archived: 'archived'
  };

  const SYSTEM_FIELD_NAMES = new Set([
    'type',
    'type_id',
    'title',
    'created',
    'updated',
    'archived'
  ]);

  function migrateFieldName(field: string): string {
    // Already migrated (props.* format)
    if (field.startsWith('props.')) return field;

    // Convert flint_* to system field name
    if (FLINT_TO_SYSTEM[field]) return FLINT_TO_SYSTEM[field];

    // Already a system field name
    if (SYSTEM_FIELD_NAMES.has(field)) return field;

    // Custom field without prefix - add props. prefix
    return `props.${field}`;
  }

  for (const noteId of Object.keys(d.notes)) {
    const note = d.notes[noteId];
    if (!note?.props?.deckConfig) continue;

    const deckConfig = note.props.deckConfig as DeckConfig;
    if (!deckConfig.views) continue;

    let modified = false;

    for (const view of deckConfig.views) {
      // Migrate filters
      if (view.filters) {
        for (const filter of view.filters) {
          const newField = migrateFieldName(filter.field);
          if (newField !== filter.field) {
            filter.field = newField;
            modified = true;
          }
        }
      }

      // Migrate sort field
      if (view.sort) {
        const newField = migrateFieldName(view.sort.field);
        if (newField !== view.sort.field) {
          view.sort.field = newField;
          modified = true;
        }
      }

      // Migrate column fields
      if (view.columns) {
        for (let i = 0; i < view.columns.length; i++) {
          const col = view.columns[i];
          const fieldName = typeof col === 'string' ? col : col.field;
          const newField = migrateFieldName(fieldName);

          if (newField !== fieldName) {
            if (typeof col === 'string') {
              view.columns[i] = newField;
            } else {
              col.field = newField;
            }
            modified = true;
          }
        }
      }
    }

    if (modified) {
      note.updated = nowISO();
    }
  }
}

/** Migration functions keyed by target version */
const SCHEMA_MIGRATIONS: Record<number, (d: NotesDocument) => void> = {
  1: migratePropsCleanup,
  2: migrateDeckFieldNames
};

/**
 * Run schema migrations if needed.
 * Only runs migrations for versions greater than the document's current version.
 */
function runSchemaMigrations(): void {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc) return;

  const currentVersion = doc.schemaVersion ?? 0;

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return; // Already up to date
  }

  console.log(
    `[Migration] Upgrading schema from v${currentVersion} to v${CURRENT_SCHEMA_VERSION}`
  );

  docHandle.change((d) => {
    // Run each migration in order
    for (let version = currentVersion + 1; version <= CURRENT_SCHEMA_VERSION; version++) {
      const migration = SCHEMA_MIGRATIONS[version];
      if (migration) {
        console.log(`[Migration] Running migration to v${version}`);
        migration(d);
      }
    }
    // Update schema version
    d.schemaVersion = CURRENT_SCHEMA_VERSION;
  });
}

/**
 * Migrate existing deck notes that have YAML content to use structured props.deckConfig.
 * This runs asynchronously after other migrations since it needs to load content documents.
 */
async function migrateDeckConfigsToProps(): Promise<void> {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc?.notes) return;

  // Find deck notes without props.deckConfig
  const deckNotesToMigrate: string[] = [];
  for (const noteId of Object.keys(doc.notes)) {
    const note = doc.notes[noteId];
    if (!note) continue;

    // Check if this is a deck note (by sourceFormat or by having deck note type)
    const isDeck =
      note.sourceFormat === 'deck' ||
      note.type === 'type-flint-deck' ||
      note.type === 'Deck';

    if (!isDeck) continue;

    // Check if already migrated (has deckConfig in props)
    if (note.props?.deckConfig) continue;

    deckNotesToMigrate.push(noteId);
  }

  if (deckNotesToMigrate.length === 0) return;

  console.log(
    `[Migration] Migrating ${deckNotesToMigrate.length} deck notes to structured config`
  );

  // Process each deck note
  for (const noteId of deckNotesToMigrate) {
    try {
      // Load content from content document
      const content = await getNoteContent(noteId);
      if (!content) continue;

      // Try to parse flint-deck code block
      const deckMatch = content.match(/```flint-deck\n([\s\S]*?)```/);
      const configYaml = deckMatch ? deckMatch[1] : content.trim();

      // Skip if empty
      if (!configYaml) continue;

      // Parse the YAML
      const deckConfig = parseDeckYaml(configYaml);
      if (!deckConfig) {
        console.warn(`[Migration] Failed to parse deck config for note ${noteId}`);
        continue;
      }

      // Update the note's props.deckConfig
      docHandle.change((d) => {
        const note = d.notes[noteId];
        if (!note) return;

        if (!note.props) {
          note.props = {};
        }
        note.props.deckConfig = clone(deckConfig);

        // Also ensure sourceFormat is set
        if (!note.sourceFormat) {
          note.sourceFormat = 'deck';
        }

        console.log(`[Migration] Migrated deck note ${noteId} to structured config`);
      });
    } catch (err) {
      console.error(`[Migration] Error migrating deck note ${noteId}:`, err);
    }
  }
}

/**
 * Initialize the search index in the background
 * Sets up content loader and starts indexing all notes
 */
function initializeSearchIndex(): void {
  // Set content loader
  searchIndex.setContentLoader(getNoteContent);

  // Get all non-archived notes
  const allNotes = Object.values(currentDoc.notes).filter((n) => !n.archived);

  // Build index in background (non-blocking)
  searchIndex.buildIndex(allNotes).catch((err) => {
    console.error('[Search] Index build failed:', err);
  });
}

/**
 * Restore the last view state from the Automerge document
 * Validates that referenced items still exist and aren't archived
 */
function restoreLastViewState(): void {
  const doc = docHandle?.doc();
  if (!doc?.lastViewState) return;

  const { activeItem: lastActiveItem, systemView: lastSystemView } = doc.lastViewState;

  // Restore system view (always valid since it's just a string enum)
  activeSystemView = lastSystemView;

  // Restore active item only if it still exists and isn't archived
  if (lastActiveItem) {
    if (lastActiveItem.type === 'note') {
      const note = doc.notes[lastActiveItem.id];
      if (note && !note.archived) {
        activeItem = lastActiveItem;
      }
    } else if (lastActiveItem.type === 'conversation') {
      const entry = doc.conversationIndex?.[lastActiveItem.id];
      if (entry && !entry.archived) {
        activeItem = lastActiveItem;
      }
    }
  }
}

// --- Vault getters (reactive) ---

export function getVaultsState(): Vault[] {
  return vaults;
}

export function getNonArchivedVaults(): Vault[] {
  return vaults.filter((v) => !v.archived);
}

export function getActiveVault(): Vault | undefined {
  return vaults.find((v) => v.id === activeVaultId);
}

export function getActiveVaultId(): string | null {
  return activeVaultId;
}

/**
 * Get the current DocHandle for direct automerge-codemirror integration
 * @returns The DocHandle or null if not initialized
 */
export function getDocHandle(): DocHandle<NotesDocument> | null {
  return docHandle;
}

// --- Vault mutations ---

/**
 * Initialize vault state (called during app startup)
 */
export function initVaultState(vaultList: Vault[], activeId: string): void {
  vaults = vaultList;
  activeVaultId = activeId;
}

/**
 * Add a new vault to state
 */
export function addVaultToState(vault: Vault): void {
  vaults = [...vaults, vault];
}

/**
 * Update vault in state
 */
export function updateVaultInState(
  id: string,
  updates: Partial<Pick<Vault, 'name' | 'archived'>>
): void {
  vaults = vaults.map((v) => (v.id === id ? { ...v, ...updates } : v));
  saveVaults(vaults);
}

/**
 * Create a new vault
 */
export function createVault(name: string): Vault {
  const repo = getRepo();
  const vault = createVaultInRepo(repo, name);
  addVaultToState(vault);
  return vault;
}

/**
 * Switch to a different vault
 */
export async function switchVault(
  vaultId: string
): Promise<DocHandle<NotesDocument> | null> {
  const vault = vaults.find((v) => v.id === vaultId);
  if (!vault) return null;

  const repo = getRepo();

  // Clear content cache from previous vault
  clearContentCache();

  // Update active vault
  activeVaultId = vaultId;
  setActiveVaultIdStorage(vaultId);

  // Load the new document
  const handle = await findDocument(repo, vault.docUrl);
  docHandle = handle;

  // Get initial state
  const doc = handle.doc();
  if (doc) {
    currentDoc = doc;
  }

  // Ensure default note type exists
  ensureDefaultNoteType();

  // Migrate notes with special types to have explicit sourceFormat
  migrateSourceFormat();

  // Run schema versioned migrations
  runSchemaMigrations();

  // Subscribe to changes
  handle.on('change', ({ doc }) => {
    currentDoc = doc;
  });

  // Reset view state before restoring from new vault
  activeItem = null;
  activeSystemView = null;

  // Restore last view state from the new vault
  restoreLastViewState();

  return handle;
}

// --- Note getters (reactive) ---

/**
 * Get all non-archived notes (metadata only), sorted by updated time (newest first)
 */
export function getNotes(): NoteMetadata[] {
  return Object.values(currentDoc.notes)
    .filter((note) => !note.archived)
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
}

/**
 * Get all notes including archived (metadata only)
 */
export function getAllNotes(): NoteMetadata[] {
  return Object.values(currentDoc.notes);
}

/**
 * Get all notes as a dictionary (metadata only, for deck queries)
 */
export function getNotesDict(): Record<string, NoteMetadata> {
  return currentDoc.notes;
}

/**
 * Get all note types as a dictionary (for deck queries)
 */
export function getNoteTypesDict(): Record<string, NoteType> {
  return currentDoc.noteTypes;
}

/**
 * Search notes by title only (synchronous, metadata-based search)
 * For full-text search including content, use searchNotesWithContent
 */
export function searchNotes(query: string): NoteMetadata[] {
  if (!query.trim()) return [];
  const lowerQuery = query.toLowerCase();
  return Object.values(currentDoc.notes)
    .filter((note) => !note.archived)
    .filter((note) => note.title.toLowerCase().includes(lowerQuery))
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
}

/**
 * Search notes by title and content (async, loads content on demand)
 */
export async function searchNotesWithContent(query: string): Promise<Note[]> {
  if (!query.trim()) return [];
  if (!activeVaultId) return [];

  const lowerQuery = query.toLowerCase();
  const results: Note[] = [];

  const notes = Object.values(currentDoc.notes).filter((note) => !note.archived);

  for (const note of notes) {
    // Check title first (cheap)
    if (note.title.toLowerCase().includes(lowerQuery)) {
      const content = await getNoteContent(note.id);
      results.push({ ...note, content });
      continue;
    }

    // Load and check content
    const content = await getNoteContent(note.id);
    if (content.toLowerCase().includes(lowerQuery)) {
      results.push({ ...note, content });
    }
  }

  return results.sort(
    (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
  );
}

/**
 * Get notes by type (metadata only)
 */
export function getNotesByType(typeId: string): NoteMetadata[] {
  return Object.values(currentDoc.notes)
    .filter((note) => !note.archived && note.type === typeId)
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
}

/**
 * Filter notes by metadata and custom props
 * Supports comparison operators and AND/OR logic
 */
export function filterNotes(
  notes: NoteMetadata[],
  input?: NoteFilterInput
): NoteMetadata[] {
  if (!input?.filters || input.filters.length === 0) {
    return notes;
  }

  const logic = input.logic ?? 'AND';
  const noteTypes = currentDoc.noteTypes;

  return notes.filter((note) => {
    if (logic === 'AND') {
      return input.filters!.every((filter) => matchesNoteFilter(note, filter, noteTypes));
    } else {
      return input.filters!.some((filter) => matchesNoteFilter(note, filter, noteTypes));
    }
  });
}

/**
 * Check if a note matches a single filter condition
 */
function matchesNoteFilter(
  note: NoteMetadata,
  filter: NoteFilter,
  noteTypes: Record<string, NoteType>
): boolean {
  const { field, operator = '=', value } = filter;
  const noteValue = getFilterFieldValue(note, field, noteTypes);

  // Handle empty filter value
  if (value === EMPTY_FILTER_VALUE) {
    const isEmpty = noteValue === undefined || noteValue === null || noteValue === '';
    return operator === '=' ? isEmpty : !isEmpty;
  }

  // Handle null/undefined note values
  if (noteValue === undefined || noteValue === null) {
    // For !=, notes without the field should match (they don't equal any value)
    if (operator === '!=') return true;
    // For boolean fields filtering on 'false', treat missing as false
    if (operator === '=' && value === 'false') return true;
    return false;
  }

  return applyFilterOperator(noteValue, operator, value);
}

// --- Note mutations ---

/**
 * Create a new note with content in a separate document
 * @returns The new note's ID
 */
export async function createNote(params: {
  title?: string;
  content?: string;
  type?: string;
}): Promise<string> {
  if (!docHandle) throw new Error('Not initialized');
  if (!activeVaultId) throw new Error('No active vault');

  const id = generateNoteId();
  const now = nowISO();
  const repo = getRepo();

  // Create content document first
  const contentHandle = await getContentHandle(repo, activeVaultId, id);

  // Write initial content if provided
  if (params.content) {
    contentHandle.change((doc) => {
      doc.content = params.content || '';
    });
  }

  // Create note metadata in root doc (no content field)
  docHandle.change((doc) => {
    doc.notes[id] = {
      id,
      title: params.title || '',
      type: params.type || DEFAULT_NOTE_TYPE_ID,
      created: now,
      updated: now,
      archived: false
    };

    // Store content URL in root doc for main process access
    if (!doc.contentUrls) {
      doc.contentUrls = {};
    }
    doc.contentUrls[id] = contentHandle.url;

    // Auto-add to recent items in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      const ws = doc.workspaces[workspaceId];
      ensureWorkspaceArrays(ws);
      ws.recentItemIds.unshift({ type: 'note', id });
    }
  });

  // Index the new note for search
  const noteMetadata = currentDoc.notes[id];
  if (noteMetadata) {
    searchIndex.indexNote(noteMetadata, params.content || '').catch((err) => {
      console.error('[Search] Failed to index new note:', err);
    });
  }

  return id;
}

/**
 * Update note metadata (title, type) - does not update content
 * Uses Automerge.updateText() for title to enable fine-grained CRDT updates
 */
export function updateNote(
  id: string,
  updates: Partial<Pick<NoteMetadata, 'title' | 'type'>>
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[id];
    if (!note) return;

    // Use updateText for fine-grained CRDT updates on title
    if (updates.title !== undefined) {
      Automerge.updateText(doc, ['notes', id, 'title'], updates.title);
    }
    // Type is not a text field, direct assignment is fine
    if (updates.type !== undefined) note.type = updates.type;
    note.updated = nowISO();
  });

  // Re-index note when title changes (content will be loaded by indexNote)
  if (updates.title !== undefined) {
    const noteMetadata = currentDoc.notes[id];
    if (noteMetadata) {
      searchIndex.indexNote(noteMetadata).catch((err) => {
        console.error('[Search] Failed to re-index note:', err);
      });
    }
  }
}

/**
 * Update note content in its separate content document
 * Uses Automerge.updateText() for fine-grained CRDT updates
 */
export async function updateNoteContent(id: string, content: string): Promise<void> {
  if (!docHandle) throw new Error('Not initialized');
  if (!activeVaultId) throw new Error('No active vault');

  const repo = getRepo();
  const contentUrl = currentDoc.contentUrls?.[id];
  const contentHandle = await getContentHandle(repo, activeVaultId, id, contentUrl);

  contentHandle.change((doc) => {
    Automerge.updateText(doc, ['content'], content);
  });

  // Update timestamp in root doc
  docHandle.change((doc) => {
    const note = doc.notes[id];
    if (note) {
      note.updated = nowISO();
    }
  });

  // Re-index note with new content
  const noteMetadata = currentDoc.notes[id];
  if (noteMetadata) {
    searchIndex.indexNote(noteMetadata, content).catch((err) => {
      console.error('[Search] Failed to re-index note content:', err);
    });
  }
}

/**
 * Get note content from its separate content document
 */
export async function getNoteContent(noteId: string): Promise<string> {
  if (!activeVaultId) return '';

  const repo = getRepo();
  const contentUrl = currentDoc.contentUrls?.[noteId];
  const handle = await findContentHandle(repo, activeVaultId, noteId, contentUrl);

  if (!handle) return '';

  const doc = handle.doc();
  return doc?.content || '';
}

/**
 * Get full note with content loaded (async)
 */
export async function getFullNote(noteId: string): Promise<Note | undefined> {
  const metadata = currentDoc.notes[noteId];
  if (!metadata) return undefined;

  const content = await getNoteContent(noteId);
  return { ...metadata, content };
}

/**
 * Get the content document handle for a note (for editor integration)
 */
export async function getNoteContentHandle(
  noteId: string
): Promise<DocHandle<NoteContentDocument> | null> {
  if (!activeVaultId) return null;

  const repo = getRepo();
  const contentUrl = currentDoc.contentUrls?.[noteId];
  return getContentHandle(repo, activeVaultId, noteId, contentUrl);
}

/**
 * Archive a note (soft delete)
 * Note: Keeps the note in pinned/recent lists and does not close it.
 * The note becomes readonly until unarchived.
 */
export function archiveNote(id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[id];
    if (note) {
      note.archived = true;
      note.updated = nowISO();
    }
  });

  // Remove from search index (archived notes shouldn't appear in search)
  searchIndex.removeNote(id);
}

/**
 * Unarchive a note (restore from soft delete)
 */
export function unarchiveNote(id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  const note = docHandle.doc()?.notes[id];
  if (!note) return;

  docHandle.change((doc) => {
    const noteToUpdate = doc.notes[id];
    if (noteToUpdate) {
      noteToUpdate.archived = false;
      noteToUpdate.updated = nowISO();
    }
  });

  // Re-add to search index
  const updatedNote = docHandle.doc()?.notes[id];
  if (updatedNote) {
    searchIndex.indexNote(updatedNote);
  }
}

/**
 * Permanently delete a note
 */
export function deleteNote(id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    delete doc.notes[id];

    // Remove from all workspaces
    for (const wsId of Object.keys(doc.workspaces)) {
      const ws = doc.workspaces[wsId];
      ensureWorkspaceArrays(ws);
      // Remove from pinned items
      const pinnedIndex = ws.pinnedItemIds.findIndex(
        (item) => item.type === 'note' && item.id === id
      );
      if (pinnedIndex !== -1) {
        ws.pinnedItemIds.splice(pinnedIndex, 1);
      }
      // Remove from recent items
      const recentIndex = ws.recentItemIds.findIndex(
        (item) => item.type === 'note' && item.id === id
      );
      if (recentIndex !== -1) {
        ws.recentItemIds.splice(recentIndex, 1);
      }
    }
  });

  // Clear active item if it was deleted (using setter for persistence)
  if (activeItem?.type === 'note' && activeItem.id === id) {
    setActiveItem(null);
  }
}

// --- Workspace getters (reactive) ---

/**
 * Get all workspaces in display order
 */
export function getWorkspaces(): Workspace[] {
  const workspaces = currentDoc.workspaces;
  const order = currentDoc.workspaceOrder;

  // If we have an order array, use it to sort workspaces
  if (order && order.length > 0) {
    const orderedWorkspaces: Workspace[] = [];
    for (const id of order) {
      if (workspaces[id]) {
        orderedWorkspaces.push(workspaces[id]);
      }
    }
    // Add any workspaces not in the order array (for backwards compatibility)
    for (const workspace of Object.values(workspaces)) {
      if (!order.includes(workspace.id)) {
        orderedWorkspaces.push(workspace);
      }
    }
    return orderedWorkspaces;
  }

  // Fallback: sort by created time for backwards compatibility
  return Object.values(workspaces).sort(
    (a, b) => Date.parse(a.created) - Date.parse(b.created)
  );
}

/**
 * Get the active workspace
 */
export function getActiveWorkspace(): Workspace | undefined {
  const workspaceId = currentDoc.activeWorkspaceId;
  return workspaceId ? currentDoc.workspaces[workspaceId] : undefined;
}

/**
 * Get pinned item refs from a workspace, handling migration from old field names
 */
function getWorkspacePinnedRefs(workspace: Workspace): SidebarItemRef[] {
  // New field name
  if (workspace.pinnedItemIds && Array.isArray(workspace.pinnedItemIds)) {
    return workspace.pinnedItemIds;
  }
  // Old field name (pinnedNoteIds was string[])
  const oldPinned = (workspace as unknown as { pinnedNoteIds?: string[] }).pinnedNoteIds;
  if (oldPinned && Array.isArray(oldPinned)) {
    return oldPinned.map((id) => ({ type: 'note' as const, id }));
  }
  return [];
}

/**
 * Get recent item refs from a workspace, handling migration from old field names
 */
function getWorkspaceRecentRefs(workspace: Workspace): SidebarItemRef[] {
  // New field name
  if (workspace.recentItemIds && Array.isArray(workspace.recentItemIds)) {
    return workspace.recentItemIds;
  }
  // Old field name (recentNoteIds was string[])
  const oldRecent = (workspace as unknown as { recentNoteIds?: string[] }).recentNoteIds;
  if (oldRecent && Array.isArray(oldRecent)) {
    return oldRecent.map((id) => ({ type: 'note' as const, id }));
  }
  return [];
}

/**
 * Ensure a workspace has the new array fields (pinnedItemIds, recentItemIds)
 * Migrates from old field names if necessary.
 * Call this inside Automerge change callbacks before accessing these arrays.
 */
function ensureWorkspaceArrays(ws: Workspace): void {
  // Migrate pinnedNoteIds -> pinnedItemIds if needed
  if (!ws.pinnedItemIds) {
    const oldPinned = (ws as unknown as { pinnedNoteIds?: string[] }).pinnedNoteIds;
    if (oldPinned && Array.isArray(oldPinned)) {
      ws.pinnedItemIds = oldPinned.map((id) => ({ type: 'note' as const, id }));
      // Clean up old field
      delete (ws as unknown as { pinnedNoteIds?: string[] }).pinnedNoteIds;
    } else {
      ws.pinnedItemIds = [];
    }
  }

  // Migrate recentNoteIds -> recentItemIds if needed
  if (!ws.recentItemIds) {
    const oldRecent = (ws as unknown as { recentNoteIds?: string[] }).recentNoteIds;
    if (oldRecent && Array.isArray(oldRecent)) {
      ws.recentItemIds = oldRecent.map((id) => ({ type: 'note' as const, id }));
      // Clean up old field
      delete (ws as unknown as { recentNoteIds?: string[] }).recentNoteIds;
    } else {
      ws.recentItemIds = [];
    }
  }
}

/**
 * Convert a SidebarItemRef to a SidebarItem, or return null if not found
 * Note: Archived notes ARE included so they can be displayed with appropriate styling
 */
function refToSidebarItem(
  ref: SidebarItemRef,
  noteTypes: Record<string, NoteType>
): SidebarItem | null {
  if (ref.type === 'note') {
    const note = currentDoc.notes[ref.id];
    if (!note) return null;
    const noteType = noteTypes[note.type];
    const displayText = note.title || 'Untitled';
    return {
      id: note.id,
      type: 'note',
      title: displayText,
      icon: noteType?.icon || '📝',
      updated: note.updated,
      metadata: {
        noteTypeId: note.type,
        isPreview: !note.title,
        archived: note.archived
      }
    };
  } else if (ref.type === 'conversation') {
    const entry = currentDoc.conversationIndex?.[ref.id];
    if (!entry || entry.archived) return null;
    return {
      id: entry.id,
      type: 'conversation',
      title: entry.title,
      icon: '💬',
      updated: entry.updated,
      metadata: {
        messageCount: entry.messageCount
      }
    };
  }
  return null;
}

/**
 * Get recent items in the active workspace as SidebarItems
 */
export function getRecentItems(): SidebarItem[] {
  const workspace = getActiveWorkspace();
  if (!workspace) return [];

  const noteTypes = currentDoc.noteTypes ?? {};
  const refs = getWorkspaceRecentRefs(workspace);

  return refs
    .map((ref) => refToSidebarItem(ref, noteTypes))
    .filter((item): item is SidebarItem => item !== null);
}

/**
 * Check if an item is in the recent items of the active workspace
 */
export function isItemRecent(ref: SidebarItemRef): boolean {
  const workspace = getActiveWorkspace();
  if (!workspace) return false;
  const refs = getWorkspaceRecentRefs(workspace);
  return refs.some((r) => r.type === ref.type && r.id === ref.id);
}

// --- Workspace mutations ---

/**
 * Create a new workspace
 * @returns The new workspace's ID
 */
export function createWorkspace(params: { name: string; icon: string }): string {
  if (!docHandle) throw new Error('Not initialized');

  const id = generateWorkspaceId();

  docHandle.change((doc) => {
    doc.workspaces[id] = {
      id,
      name: params.name,
      icon: params.icon,
      pinnedItemIds: [],
      recentItemIds: [],
      created: nowISO()
    };

    // Add to workspace order
    if (!doc.workspaceOrder) {
      doc.workspaceOrder = [];
    }
    doc.workspaceOrder.push(id);
  });

  return id;
}

/**
 * Update a workspace
 */
export function updateWorkspace(
  id: string,
  updates: Partial<Pick<Workspace, 'name' | 'icon'>>
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const workspace = doc.workspaces[id];
    if (!workspace) return;

    if (updates.name !== undefined) workspace.name = updates.name;
    if (updates.icon !== undefined) workspace.icon = updates.icon;
  });
}

/**
 * Delete a workspace
 * Cannot delete the last workspace
 */
export function deleteWorkspace(id: string): boolean {
  if (!docHandle) throw new Error('Not initialized');

  const workspaces = Object.keys(currentDoc.workspaces);
  if (workspaces.length <= 1) {
    return false; // Cannot delete last workspace
  }

  docHandle.change((doc) => {
    delete doc.workspaces[id];

    // Remove from workspace order
    if (doc.workspaceOrder) {
      const index = doc.workspaceOrder.indexOf(id);
      if (index !== -1) {
        doc.workspaceOrder.splice(index, 1);
      }
    }

    // If we deleted the active workspace, switch to another
    if (doc.activeWorkspaceId === id) {
      const remaining = Object.keys(doc.workspaces);
      doc.activeWorkspaceId = remaining[0] || '';
    }
  });

  return true;
}

/**
 * Set the active workspace
 */
export function setActiveWorkspace(workspaceId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (doc.workspaces[workspaceId]) {
      doc.activeWorkspaceId = workspaceId;
    }
  });
}

/**
 * Add an item to the active workspace's recent items
 * Does not add if the item is already pinned or already in recent items
 */
export function addItemToWorkspace(ref: SidebarItemRef): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    // Don't add if already pinned
    if (ws.pinnedItemIds.some((r) => r.type === ref.type && r.id === ref.id)) return;

    // Don't add duplicates to recent
    if (ws.recentItemIds.some((r) => r.type === ref.type && r.id === ref.id)) return;

    ws.recentItemIds.unshift(ref);
  });
}

/**
 * Remove an item from the active workspace's recent items
 * @returns The next item to select, or null if none
 */
export function removeItemFromWorkspace(ref: SidebarItemRef): SidebarItemRef | null {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return null;

  const recentRefs = getWorkspaceRecentRefs(workspace);
  const index = recentRefs.findIndex((r) => r.type === ref.type && r.id === ref.id);
  if (index === -1) return null;

  // Determine next item to select
  let nextItem: SidebarItemRef | null = null;
  if (recentRefs.length > 1) {
    if (index < recentRefs.length - 1) {
      nextItem = recentRefs[index + 1];
    } else {
      nextItem = recentRefs[index - 1];
    }
  }

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (ws) {
      ensureWorkspaceArrays(ws);
      const idx = ws.recentItemIds.findIndex(
        (r) => r.type === ref.type && r.id === ref.id
      );
      if (idx !== -1) {
        ws.recentItemIds.splice(idx, 1);
      }
    }
  });

  // Clear active item if it was removed (using setter for persistence)
  if (activeItem?.type === ref.type && activeItem.id === ref.id) {
    if (nextItem) {
      setActiveItem(nextItem);
    } else {
      setActiveItem(null);
    }
  }

  return nextItem;
}

/**
 * Move an item from the current workspace to a target workspace
 * Removes from pinned/recent in current workspace and adds to recent in target
 */
export function moveItemToWorkspace(
  ref: SidebarItemRef,
  targetWorkspaceId: string
): void {
  if (!docHandle) throw new Error('Not initialized');

  const currentWorkspaceId = currentDoc.activeWorkspaceId;

  // Don't do anything if moving to the same workspace
  if (targetWorkspaceId === currentWorkspaceId) return;

  docHandle.change((doc) => {
    // Remove from current workspace (both pinned and recent)
    const currentWs = doc.workspaces[currentWorkspaceId];
    if (currentWs) {
      ensureWorkspaceArrays(currentWs);
      // Remove from pinned
      const pinnedIdx = currentWs.pinnedItemIds.findIndex(
        (r) => r.type === ref.type && r.id === ref.id
      );
      if (pinnedIdx !== -1) {
        currentWs.pinnedItemIds.splice(pinnedIdx, 1);
      }
      // Remove from recent
      const recentIdx = currentWs.recentItemIds.findIndex(
        (r) => r.type === ref.type && r.id === ref.id
      );
      if (recentIdx !== -1) {
        currentWs.recentItemIds.splice(recentIdx, 1);
      }
    }

    // Add to target workspace's recent items
    const targetWs = doc.workspaces[targetWorkspaceId];
    if (targetWs) {
      ensureWorkspaceArrays(targetWs);
      // Don't add if already in target workspace
      const alreadyPinned = targetWs.pinnedItemIds.some(
        (r) => r.type === ref.type && r.id === ref.id
      );
      const alreadyRecent = targetWs.recentItemIds.some(
        (r) => r.type === ref.type && r.id === ref.id
      );
      if (!alreadyPinned && !alreadyRecent) {
        targetWs.recentItemIds.unshift({ type: ref.type, id: ref.id });
      }
    }
  });

  // Clear active item if it was moved (using setter for persistence)
  if (activeItem?.type === ref.type && activeItem.id === ref.id) {
    setActiveItem(null);
  }
}

/**
 * Reorder recent items in the active workspace
 */
export function reorderRecentItems(fromIndex: number, toIndex: number): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    const [removed] = ws.recentItemIds.splice(fromIndex, 1);
    // Create a new plain object to avoid Automerge "existing document object" error
    ws.recentItemIds.splice(toIndex, 0, { type: removed.type, id: removed.id });
  });
}

/**
 * Reorder workspaces in the sidebar
 */
export function reorderWorkspaces(fromIndex: number, toIndex: number): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    // Initialize workspaceOrder if it doesn't exist
    if (!doc.workspaceOrder) {
      // Build order from existing workspaces sorted by created time
      const workspaceValues = Object.values(doc.workspaces) as Workspace[];
      doc.workspaceOrder = workspaceValues
        .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
        .map((w) => w.id);
    }

    if (fromIndex < 0 || fromIndex >= doc.workspaceOrder.length) return;
    if (toIndex < 0 || toIndex >= doc.workspaceOrder.length) return;

    const [removed] = doc.workspaceOrder.splice(fromIndex, 1);
    doc.workspaceOrder.splice(toIndex, 0, removed);
  });
}

// --- Pinned items ---

/**
 * Get pinned items in the active workspace as SidebarItems
 */
export function getPinnedItems(): SidebarItem[] {
  const workspace = getActiveWorkspace();
  if (!workspace) return [];

  const noteTypes = currentDoc.noteTypes ?? {};
  const refs = getWorkspacePinnedRefs(workspace);

  return refs
    .map((ref) => refToSidebarItem(ref, noteTypes))
    .filter((item): item is SidebarItem => item !== null);
}

/**
 * Pin an item to the active workspace
 */
export function pinItem(ref: SidebarItemRef): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  // Don't pin if already pinned
  const pinnedRefs = getWorkspacePinnedRefs(workspace);
  if (pinnedRefs.some((r) => r.type === ref.type && r.id === ref.id)) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    // Add to pinned if not already there
    if (!ws.pinnedItemIds.some((r) => r.type === ref.type && r.id === ref.id)) {
      ws.pinnedItemIds.push(ref);
    }

    // Remove from recent items (pinned items replace recent items)
    const recentIndex = ws.recentItemIds.findIndex(
      (r) => r.type === ref.type && r.id === ref.id
    );
    if (recentIndex !== -1) {
      ws.recentItemIds.splice(recentIndex, 1);
    }
  });
}

/**
 * Unpin an item from the active workspace
 */
export function unpinItem(ref: SidebarItemRef): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    const index = ws.pinnedItemIds.findIndex(
      (r) => r.type === ref.type && r.id === ref.id
    );
    if (index !== -1) {
      ws.pinnedItemIds.splice(index, 1);

      // Add to recent items when unpinned (at the start)
      if (!ws.recentItemIds.some((r) => r.type === ref.type && r.id === ref.id)) {
        ws.recentItemIds.unshift(ref);
      }
    }
  });
}

/**
 * Check if an item is pinned in the active workspace
 */
export function isItemPinned(ref: SidebarItemRef): boolean {
  const workspace = getActiveWorkspace();
  if (!workspace) return false;
  const pinnedRefs = getWorkspacePinnedRefs(workspace);
  return pinnedRefs.some((r) => r.type === ref.type && r.id === ref.id);
}

/**
 * Reorder pinned items in the active workspace
 */
export function reorderPinnedItems(fromIndex: number, toIndex: number): void {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    const [removed] = ws.pinnedItemIds.splice(fromIndex, 1);
    // Create a new plain object to avoid Automerge "existing document object" error
    ws.pinnedItemIds.splice(toIndex, 0, { type: removed.type, id: removed.id });
  });
}

// --- NoteType getters (reactive) ---

/**
 * Get all non-archived note types
 */
export function getNoteTypes(): NoteType[] {
  return Object.values(currentDoc.noteTypes ?? {})
    .filter((type) => !type.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get all note types including archived
 */
export function getAllNoteTypes(): NoteType[] {
  return Object.values(currentDoc.noteTypes ?? {});
}

/**
 * Get a single note type by ID
 */
export function getNoteType(id: string): NoteType | undefined {
  return currentDoc.noteTypes?.[id];
}

// --- NoteType mutations ---

/**
 * Create a new note type
 * @returns The new type's ID
 */
export function createNoteType(params: {
  name: string;
  purpose?: string;
  icon?: string;
  properties?: PropertyDefinition[];
  editorChips?: string[];
}): string {
  if (!docHandle) throw new Error('Not initialized');

  const id = generateNoteTypeId();

  docHandle.change((doc) => {
    if (!doc.noteTypes) {
      doc.noteTypes = {};
    }
    const noteType: NoteType = {
      id,
      name: params.name,
      purpose: params.purpose || '',
      icon: params.icon || '📄',
      archived: false,
      created: nowISO()
    };
    // Only add optional fields if they're defined (Automerge doesn't allow undefined)
    // Use clone() to create fresh objects safe for Automerge
    if (params.properties !== undefined) {
      noteType.properties = clone(params.properties);
    }
    if (params.editorChips !== undefined) {
      noteType.editorChips = [...params.editorChips];
    }
    doc.noteTypes[id] = noteType;
  });

  return id;
}

/**
 * Update a note type
 * System types (default, daily, deck) can have their purpose, icon, properties, and editorChips modified,
 * but not their name (which is protected).
 */
export function updateNoteType(
  id: string,
  updates: Partial<
    Pick<NoteType, 'name' | 'purpose' | 'icon' | 'properties' | 'editorChips'>
  >
): void {
  if (!docHandle) throw new Error('Not initialized');

  // For system types, block name changes but allow other modifications
  if (isProtectedType(id) && updates.name !== undefined) {
    console.warn(`Cannot change name of system note type: ${id}`);
    return;
  }

  docHandle.change((doc) => {
    const noteType = doc.noteTypes?.[id];
    if (!noteType) return;

    // Only update name for non-system types
    if (updates.name !== undefined && !isProtectedType(id)) {
      noteType.name = updates.name;
    }
    if (updates.purpose !== undefined) noteType.purpose = updates.purpose;
    if (updates.icon !== undefined) noteType.icon = updates.icon;
    // Use clone() to create fresh objects safe for Automerge
    if (updates.properties !== undefined) {
      noteType.properties = clone(updates.properties);
    }
    if (updates.editorChips !== undefined) {
      noteType.editorChips = [...updates.editorChips];
    }
  });
}

/**
 * Archive a note type (soft delete)
 * Notes keep their type assignment but type won't appear in lists
 * System types (default, daily, deck) cannot be archived
 */
export function archiveNoteType(id: string): void {
  if (!docHandle) throw new Error('Not initialized');
  if (isProtectedType(id)) {
    console.warn(`Cannot archive system note type: ${id}`);
    return;
  }

  docHandle.change((doc) => {
    const noteType = doc.noteTypes?.[id];
    if (noteType) {
      noteType.archived = true;
    }
  });
}

/**
 * Unarchive a note type (restore from soft delete)
 */
export function unarchiveNoteType(id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const noteType = doc.noteTypes?.[id];
    if (noteType) {
      noteType.archived = false;
    }
  });
}

/**
 * Set a note's type
 */
export function setNoteType(noteId: string, typeId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (note) {
      note.type = typeId;
      note.updated = nowISO();
    }
  });
}

// --- Note Properties ---

/**
 * Get a note's property values
 */
export function getNoteProps(noteId: string): Record<string, unknown> {
  const note = currentDoc.notes[noteId];
  return note?.props ?? {};
}

/**
 * Get a single note metadata by ID (without content)
 */
export function getNote(noteId: string): NoteMetadata | undefined {
  return currentDoc.notes[noteId];
}

/**
 * Set a single property on a note
 */
export function setNoteProp(noteId: string, propName: string, value: unknown): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }
    note.props[propName] = value;
    note.updated = nowISO();
  });
}

/**
 * Set multiple properties on a note
 */
export function setNoteProps(noteId: string, props: Record<string, unknown>): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }
    for (const [key, value] of Object.entries(props)) {
      // Use cloneIfObject() to safely handle both primitives and objects
      note.props[key] = cloneIfObject(value);
    }
    note.updated = nowISO();
  });
}

/**
 * Delete a property from a note
 */
export function deleteNoteProp(noteId: string, propName: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note || !note.props) return;

    delete note.props[propName];
    note.updated = nowISO();
  });
}

/**
 * Get property definitions for a note type
 */
export function getNoteTypeProperties(typeId: string): PropertyDefinition[] {
  const noteType = currentDoc.noteTypes?.[typeId];
  return noteType?.properties ?? [];
}

/**
 * Get editor chips configuration for a note type
 * Returns configured chips or defaults to system fields (handles empty array)
 */
export function getNoteTypeEditorChips(typeId: string): string[] {
  const noteType = currentDoc.noteTypes?.[typeId];
  return noteType?.editorChips?.length ? noteType.editorChips : ['created', 'updated'];
}

// --- Active item and system view (persisted in Automerge document) ---

/**
 * Persist the current view state to the Automerge document
 */
function persistViewState(): void {
  if (!docHandle) return;

  docHandle.change((doc) => {
    doc.lastViewState = {
      activeItem: activeItem ? { type: activeItem.type, id: activeItem.id } : null,
      systemView: activeSystemView
    };
  });
}

/**
 * Get the currently active item
 */
export function getActiveItem(): ActiveItem {
  return activeItem;
}

/**
 * Set the active item (also persists to document)
 * Also updates lastOpened timestamp for notes
 */
export function setActiveItem(item: ActiveItem): void {
  activeItem = item;
  persistViewState();

  // Update lastOpened for notes
  if (item?.type === 'note' && item.id) {
    markNoteOpened(item.id);
  }
}

/**
 * Mark a note as opened (updates lastOpened timestamp)
 */
export function markNoteOpened(noteId: string): void {
  if (!docHandle) return;

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (note) {
      note.lastOpened = nowISO();
    }
  });
}

/**
 * Get the currently active system view
 */
export function getActiveSystemView(): SystemView {
  return activeSystemView;
}

/**
 * Set the active system view (also persists to document)
 */
export function setActiveSystemView(view: SystemView): void {
  activeSystemView = view;
  persistViewState();
}

/**
 * Get the currently selected note type ID
 */
export function getSelectedNoteTypeId(): string | null {
  return selectedNoteTypeId;
}

/**
 * Set the selected note type ID (for navigating to type definition screen)
 */
export function setSelectedNoteTypeId(typeId: string | null): void {
  selectedNoteTypeId = typeId;
}

/**
 * Get the currently active note metadata (convenience getter)
 */
export function getActiveNote(): NoteMetadata | undefined {
  if (!activeItem || activeItem.type !== 'note') return undefined;
  return currentDoc.notes[activeItem.id];
}

/**
 * Get the currently active conversation index entry (convenience getter).
 * Use getConversation() to load the full conversation data.
 */
export function getActiveConversationEntry(): ConversationIndexEntry | undefined {
  if (!activeItem || activeItem.type !== 'conversation') return undefined;
  return currentDoc.conversationIndex?.[activeItem.id];
}

// --- Convenience wrappers for backward compatibility ---

/**
 * Get the active note ID (convenience wrapper)
 */
export function getActiveNoteId(): string | null {
  return activeItem?.type === 'note' ? activeItem.id : null;
}

/**
 * Set the active note by ID (convenience wrapper)
 */
export function setActiveNoteId(noteId: string | null): void {
  if (noteId === null) {
    setActiveItem(null);
  } else {
    setActiveItem({ type: 'note', id: noteId });
  }
}

/**
 * Get the active conversation ID (convenience wrapper)
 */
export function getActiveConversationId(): string | null {
  return activeItem?.type === 'conversation' ? activeItem.id : null;
}

/**
 * Set the active conversation by ID (convenience wrapper)
 */
export function setActiveConversationId(conversationId: string | null): void {
  if (conversationId === null) {
    setActiveItem(null);
  } else {
    setActiveItem({ type: 'conversation', id: conversationId });
  }
}

/**
 * Add a note to the current workspace (convenience wrapper)
 */
export function addNoteToWorkspace(noteId: string): void {
  addItemToWorkspace({ type: 'note', id: noteId });
}

/**
 * Navigate to a note, conversation, or type by ID, or create a new note if shouldCreate is true.
 * This is the centralized handler for wikilink clicks.
 *
 * @param targetId - The ID to navigate to (or the title if creating)
 * @param title - The display title (used when creating a new note)
 * @param options - Options for navigation (shouldCreate, targetType)
 * @returns The ID that was navigated to (either existing or newly created)
 */
export async function navigateToNote(
  targetId: string,
  title: string,
  options?: {
    shouldCreate?: boolean;
    targetType?: 'note' | 'conversation' | 'type';
  }
): Promise<string> {
  const targetType = options?.targetType || 'note';
  const shouldCreate = options?.shouldCreate || false;

  if (targetType === 'conversation') {
    // Navigate to conversation (never create via wikilink)
    setActiveItem({ type: 'conversation', id: targetId });
    addItemToWorkspace({ type: 'conversation', id: targetId });
    return targetId;
  } else if (targetType === 'type') {
    // Navigate to note type definition screen
    setSelectedNoteTypeId(targetId);
    setActiveSystemView('types');
    return targetId;
  } else {
    // Note handling
    if (shouldCreate) {
      // Create a new note with the given title
      const newId = await createNote({ title });
      addItemToWorkspace({ type: 'note', id: newId });
      setActiveItem({ type: 'note', id: newId });
      return newId;
    } else {
      // Navigate to existing note
      setActiveItem({ type: 'note', id: targetId });
      return targetId;
    }
  }
}

// --- Backlinks ---

const LINK_PATTERN = /\[\[(n-[a-f0-9]{8})(?:\|[^\]]+)?\]\]/g;

export interface BacklinkOccurrence {
  lineNumber: number; // 0-indexed line in source
  lineText: string; // Full line text
  charStart: number; // Link start position in line
  charEnd: number; // Link end position in line
}

export interface BacklinkResult {
  note: NoteMetadata;
  occurrences: BacklinkOccurrence[];
}

/**
 * Get backlinks to a note (other notes that link to it)
 * Returns line-level occurrences for each linking note
 */
export async function getBacklinks(noteId: string): Promise<BacklinkResult[]> {
  const backlinks: BacklinkResult[] = [];

  for (const note of Object.values(currentDoc.notes)) {
    if (note.archived || note.id === noteId) continue;

    // Load content for this note
    const content = await getNoteContent(note.id);
    const lines = content.split('\n');
    const occurrences: BacklinkOccurrence[] = [];

    // Find all lines containing links to this note
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      LINK_PATTERN.lastIndex = 0;
      let match;
      while ((match = LINK_PATTERN.exec(line)) !== null) {
        if (match[1] === noteId) {
          occurrences.push({
            lineNumber: i,
            lineText: line,
            charStart: match.index,
            charEnd: match.index + match[0].length
          });
        }
      }
    }

    if (occurrences.length > 0) {
      backlinks.push({ note, occurrences });
    }
  }

  return backlinks.sort((a, b) => b.occurrences.length - a.occurrences.length);
}

// --- Loading state getters ---

export function getIsInitialized(): boolean {
  return isInitialized;
}

export function getIsLoading(): boolean {
  return isLoading;
}

// --- Daily View Support ---

/** Daily note type ID constant */
export const DAILY_NOTE_TYPE_ID = 'type-daily';

/**
 * Interface for daily view day data
 */
export interface DayData {
  date: string; // ISO date string (YYYY-MM-DD)
  dailyNote: NoteMetadata | null;
  createdNotes: NoteMetadata[];
  modifiedNotes: NoteMetadata[];
  totalActivity: number;
}

/**
 * Interface for daily view week data
 */
export interface WeekData {
  startDate: string;
  endDate: string;
  days: DayData[];
}

/**
 * Ensure the daily note type exists in the document
 */
export function ensureDailyNoteType(): void {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc?.noteTypes?.[DAILY_NOTE_TYPE_ID]) {
    docHandle.change((d) => {
      if (!d.noteTypes) {
        d.noteTypes = {};
      }
      if (!d.noteTypes[DAILY_NOTE_TYPE_ID]) {
        d.noteTypes[DAILY_NOTE_TYPE_ID] = {
          id: DAILY_NOTE_TYPE_ID,
          name: 'Daily',
          purpose: 'Daily notes for tracking progress and capturing thoughts',
          icon: '📅',
          archived: false,
          created: nowISO()
        };
      }
    });
  }
}

/**
 * Generate a daily note ID for a specific date
 * Format: "daily-YYYY-MM-DD"
 */
export function getDailyNoteId(date: string): string {
  return `daily-${date}`;
}

/**
 * Get daily note for a specific date (metadata only)
 */
export function getDailyNote(date: string): NoteMetadata | undefined {
  const dailyNoteId = getDailyNoteId(date);
  return currentDoc.notes[dailyNoteId];
}

/**
 * Get or create a daily note for a specific date
 * @returns The daily note metadata
 */
export async function getOrCreateDailyNote(date: string): Promise<NoteMetadata> {
  if (!docHandle) throw new Error('Not initialized');
  if (!activeVaultId) throw new Error('No active vault');

  // Ensure daily note type exists
  ensureDailyNoteType();

  const dailyNoteId = getDailyNoteId(date);
  const existing = currentDoc.notes[dailyNoteId];

  if (existing) {
    return existing;
  }

  // Create content document first
  const repo = getRepo();
  if (!repo) throw new Error('No repo available');

  const contentHandle = await getContentHandle(repo, activeVaultId, dailyNoteId);

  // Create new daily note with predictable ID
  const now = nowISO();
  docHandle.change((doc) => {
    doc.notes[dailyNoteId] = {
      id: dailyNoteId,
      title: date, // Title is the date itself
      type: DAILY_NOTE_TYPE_ID,
      created: now,
      updated: now,
      archived: false
    };
    // Store content URL
    if (!doc.contentUrls) doc.contentUrls = {};
    doc.contentUrls[dailyNoteId] = contentHandle.url;
  });

  return currentDoc.notes[dailyNoteId];
}

/**
 * Update daily note content
 */
export async function updateDailyNote(date: string, content: string): Promise<void> {
  if (!docHandle) throw new Error('Not initialized');

  const dailyNoteId = getDailyNoteId(date);
  const existing = currentDoc.notes[dailyNoteId];

  // If content is empty and note doesn't exist, don't create it
  if (!content.trim() && !existing) {
    return;
  }

  // Create the note if it doesn't exist
  if (!existing) {
    await getOrCreateDailyNote(date);
  }

  // Update content in content document
  await updateNoteContent(dailyNoteId, content);
}

/**
 * Get week data for a specific start date
 */
export function getWeekData(startDate: string): WeekData {
  // Generate 7 days from start date
  const days: DayData[] = [];

  for (let i = 0; i < 7; i++) {
    const dateString = addDaysToDateString(startDate, i);

    // Get daily note for this date
    const dailyNote = getDailyNote(dateString) || null;

    // Get notes created on this date (excluding daily notes)
    const createdNotes = Object.values(currentDoc.notes).filter((note) => {
      if (note.archived) return false;
      if (note.type === DAILY_NOTE_TYPE_ID) return false;
      const createdDate = note.created.split('T')[0];
      return createdDate === dateString;
    });

    // Get notes modified on this date (excluding daily notes and notes created today)
    const modifiedNotes = Object.values(currentDoc.notes).filter((note) => {
      if (note.archived) return false;
      if (note.type === DAILY_NOTE_TYPE_ID) return false;
      const createdDate = note.created.split('T')[0];
      const updatedDate = note.updated.split('T')[0];
      // Only include if modified today but not created today
      return updatedDate === dateString && createdDate !== dateString;
    });

    days.push({
      date: dateString,
      dailyNote,
      createdNotes,
      modifiedNotes,
      totalActivity: createdNotes.length + modifiedNotes.length + (dailyNote ? 1 : 0)
    });
  }

  // Calculate end date (6 days after start)
  const endDate = addDaysToDateString(startDate, 6);

  return {
    startDate,
    endDate,
    days
  };
}

/**
 * Add days to a date string and return a new date string
 * Uses UTC timestamp math to avoid Date object reactivity issues in .svelte.ts files
 */
function addDaysToDateString(dateString: string, daysToAdd: number): string {
  // Parse the date string (YYYY-MM-DD)
  const [year, month, day] = dateString.split('-').map(Number);

  // Create timestamp and add days (using UTC to avoid timezone issues)
  const timestamp = Date.UTC(year, month - 1, day) + daysToAdd * 24 * 60 * 60 * 1000;

  // Extract date components from timestamp using UTC methods
  // We need to convert timestamp to date parts without using mutable Date
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceEpoch = Math.floor(timestamp / msPerDay);

  // Algorithm to convert days since epoch to year/month/day
  // Based on Howard Hinnant's algorithm
  const z = daysSinceEpoch + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) /
      365
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const resultYear = y + (m <= 2 ? 1 : 0);

  return `${resultYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Note: State variables cannot be exported directly because they are reassigned.
// Use the getter functions instead: getIsInitialized(), getIsLoading(), etc.

// --- Conversation getters (reactive) ---

/**
 * Get all non-archived conversations for the active workspace, sorted by updated (newest first).
 * Returns lightweight index entries (not full conversations).
 */
export function getConversations(): ConversationIndexEntry[] {
  const workspace = getActiveWorkspace();
  if (!workspace) return [];

  const index = currentDoc.conversationIndex ?? {};
  return Object.values(index)
    .filter((entry) => !entry.archived && entry.workspaceId === workspace.id)
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
}

/**
 * Get a full conversation by ID (async, loads from OPFS if needed).
 * Returns null if not found.
 */
export async function getConversation(id: string): Promise<Conversation | null> {
  // Check cache first
  const cached = conversationCache.get(id);
  if (cached) return cached;

  // Load from OPFS
  const conversation = await conversationOpfsStorage.retrieve(id);
  if (conversation) {
    conversationCache.set(id, conversation);
  }
  return conversation;
}

/**
 * Get a conversation index entry by ID (sync, for wikilinks/UI).
 * Returns undefined if not found.
 */
export function getConversationEntry(id: string): ConversationIndexEntry | undefined {
  return currentDoc.conversationIndex?.[id];
}

/**
 * Clear a conversation from cache (call after archiving/deleting).
 */
export function clearConversationCache(id?: string): void {
  if (id) {
    conversationCache.delete(id);
  } else {
    conversationCache.clear();
  }
}

// --- Conversation mutations ---

/**
 * Create a new conversation
 * @returns The new conversation's ID
 */
export async function createConversation(params?: {
  title?: string;
  addToRecent?: boolean;
}): Promise<string> {
  if (!docHandle) throw new Error('Not initialized');

  const workspace = getActiveWorkspace();
  if (!workspace) throw new Error('No active workspace');

  const id = generateConversationId();
  const now = nowISO();
  const addToRecent = params?.addToRecent ?? true;
  const title = params?.title || 'New Conversation';

  // Create full conversation object
  const conversation: Conversation = {
    id,
    title,
    workspaceId: workspace.id,
    messages: [],
    created: now,
    updated: now,
    archived: false
  };

  // Store in OPFS
  await conversationOpfsStorage.store(conversation);

  // Cache it
  conversationCache.set(id, conversation);

  // Update index in Automerge
  docHandle.change((doc) => {
    if (!doc.conversationIndex) {
      doc.conversationIndex = {};
    }

    doc.conversationIndex[id] = {
      id,
      title,
      workspaceId: workspace.id,
      created: now,
      updated: now,
      archived: false,
      messageCount: 0
    };

    // Add to workspace's recent items (unless explicitly skipped)
    if (addToRecent) {
      const ws = doc.workspaces[doc.activeWorkspaceId];
      if (ws) {
        ensureWorkspaceArrays(ws);
        ws.recentItemIds.unshift({ type: 'conversation', id });
      }
    }
  });

  return id;
}

/**
 * Add a message to a conversation
 * @returns The new message's ID
 */
export async function addMessageToConversation(
  conversationId: string,
  message: Omit<PersistedChatMessage, 'id' | 'createdAt'>
): Promise<string> {
  if (!docHandle) throw new Error('Not initialized');

  // Load conversation from cache or OPFS
  let conversation: Conversation | undefined = conversationCache.get(conversationId);
  if (!conversation) {
    const retrieved = await conversationOpfsStorage.retrieve(conversationId);
    if (!retrieved) throw new Error('Conversation not found');
    conversation = retrieved;
  }

  const messageId = generateMessageId();
  const now = nowISO();

  // Create the new message
  const newMessage: PersistedChatMessage = {
    id: messageId,
    role: message.role,
    content: message.content,
    createdAt: now
  };

  // Only add toolCalls if there are any
  if (message.toolCalls && message.toolCalls.length > 0) {
    newMessage.toolCalls = message.toolCalls.map((tc) => {
      const toolCall: PersistedToolCall = {
        id: tc.id,
        name: tc.name,
        args: { ...tc.args },
        status: tc.status
      };
      if (tc.result !== undefined) {
        toolCall.result = tc.result;
      }
      if (tc.error !== undefined) {
        toolCall.error = tc.error;
      }
      return toolCall;
    });
  }

  // Update conversation
  conversation.messages.push(newMessage);
  conversation.updated = now;

  // Auto-generate title from first user message
  let titleChanged = false;
  if (conversation.title === 'New Conversation' && message.role === 'user') {
    const preview = message.content.slice(0, 50).trim();
    conversation.title = preview + (message.content.length > 50 ? '...' : '');
    titleChanged = true;
  }

  // Save to OPFS
  await conversationOpfsStorage.store(conversation);

  // Update cache
  conversationCache.set(conversationId, conversation);

  // Update index in Automerge
  docHandle.change((doc) => {
    const entry = doc.conversationIndex?.[conversationId];
    if (entry) {
      entry.updated = now;
      entry.messageCount = conversation!.messages.length;
      if (titleChanged) {
        entry.title = conversation!.title;
      }
    }
  });

  return messageId;
}

/**
 * Update a message in a conversation (for streaming updates)
 */
export async function updateConversationMessage(
  conversationId: string,
  messageId: string,
  updates: Partial<Pick<PersistedChatMessage, 'content' | 'toolCalls'>>
): Promise<void> {
  // Get conversation from cache (should already be loaded during streaming)
  const conversation = conversationCache.get(conversationId);
  if (!conversation) return;

  const messageIndex = conversation.messages.findIndex((m) => m.id === messageId);
  if (messageIndex === -1) return;

  const message = conversation.messages[messageIndex];
  const now = nowISO();

  // Update message content
  if (updates.content !== undefined) {
    message.content = updates.content;
  }
  if (updates.toolCalls !== undefined && updates.toolCalls.length > 0) {
    message.toolCalls = updates.toolCalls.map((tc) => {
      const toolCall: PersistedToolCall = {
        id: tc.id,
        name: tc.name,
        args: { ...tc.args },
        status: tc.status
      };
      if (tc.result !== undefined) {
        toolCall.result = tc.result;
      }
      if (tc.error !== undefined) {
        toolCall.error = tc.error;
      }
      if (tc.commentary !== undefined) {
        toolCall.commentary = tc.commentary;
      }
      return toolCall;
    });
  }
  conversation.updated = now;

  // Save to OPFS
  await conversationOpfsStorage.store(conversation);

  // Update index timestamp in Automerge
  if (docHandle) {
    docHandle.change((doc) => {
      const entry = doc.conversationIndex?.[conversationId];
      if (entry) {
        entry.updated = now;
      }
    });
  }
}

/**
 * Update conversation metadata
 */
export async function updateConversation(
  id: string,
  updates: Partial<Pick<Conversation, 'title'>>
): Promise<void> {
  if (!docHandle) throw new Error('Not initialized');

  const now = nowISO();

  // Update in cache/OPFS if loaded
  const conversation = conversationCache.get(id);
  if (conversation) {
    if (updates.title !== undefined) {
      conversation.title = updates.title;
    }
    conversation.updated = now;
    await conversationOpfsStorage.store(conversation);
  }

  // Update index in Automerge
  docHandle.change((doc) => {
    const entry = doc.conversationIndex?.[id];
    if (!entry) return;

    if (updates.title !== undefined) {
      entry.title = updates.title;
    }
    entry.updated = now;
  });
}

/**
 * Archive a conversation (soft delete)
 */
export async function archiveConversation(id: string): Promise<void> {
  if (!docHandle) throw new Error('Not initialized');

  const now = nowISO();

  // Update in OPFS
  const conversation =
    conversationCache.get(id) || (await conversationOpfsStorage.retrieve(id));
  if (conversation) {
    conversation.archived = true;
    conversation.updated = now;
    await conversationOpfsStorage.store(conversation);
  }

  // Clear from cache
  clearConversationCache(id);

  // Update index in Automerge
  docHandle.change((doc) => {
    const entry = doc.conversationIndex?.[id];
    if (entry) {
      entry.archived = true;
      entry.updated = now;
    }

    // Remove from all workspaces
    for (const wsId of Object.keys(doc.workspaces)) {
      const ws = doc.workspaces[wsId];
      ensureWorkspaceArrays(ws);
      // Remove from pinned items
      const pinnedIndex = ws.pinnedItemIds.findIndex(
        (item) => item.type === 'conversation' && item.id === id
      );
      if (pinnedIndex !== -1) {
        ws.pinnedItemIds.splice(pinnedIndex, 1);
      }
      // Remove from recent items
      const recentIndex = ws.recentItemIds.findIndex(
        (item) => item.type === 'conversation' && item.id === id
      );
      if (recentIndex !== -1) {
        ws.recentItemIds.splice(recentIndex, 1);
      }
    }
  });

  // Clear active item if it was archived (using setter for persistence)
  if (activeItem?.type === 'conversation' && activeItem.id === id) {
    setActiveItem(null);
  }
}

/**
 * Unarchive a conversation (restore from soft delete)
 */
export async function unarchiveConversation(id: string): Promise<void> {
  if (!docHandle) throw new Error('Not initialized');

  const now = nowISO();

  // Update in OPFS
  const conversation =
    conversationCache.get(id) || (await conversationOpfsStorage.retrieve(id));
  if (conversation) {
    conversation.archived = false;
    conversation.updated = now;
    await conversationOpfsStorage.store(conversation);
  }

  // Clear from cache to force reload
  clearConversationCache(id);

  // Update index in Automerge
  docHandle.change((doc) => {
    const entry = doc.conversationIndex?.[id];
    if (entry) {
      entry.archived = false;
      entry.updated = now;
    }
  });
}

/**
 * Delete a conversation permanently
 */
export async function deleteConversation(id: string): Promise<void> {
  if (!docHandle) throw new Error('Not initialized');

  // Remove from OPFS
  await conversationOpfsStorage.remove(id);

  // Clear from cache
  clearConversationCache(id);

  // Remove from index in Automerge
  docHandle.change((doc) => {
    if (doc.conversationIndex) {
      delete doc.conversationIndex[id];
    }

    // Remove from all workspaces
    for (const wsId of Object.keys(doc.workspaces)) {
      const ws = doc.workspaces[wsId];
      ensureWorkspaceArrays(ws);
      // Remove from pinned items
      const pinnedIndex = ws.pinnedItemIds.findIndex(
        (item) => item.type === 'conversation' && item.id === id
      );
      if (pinnedIndex !== -1) {
        ws.pinnedItemIds.splice(pinnedIndex, 1);
      }
      // Remove from recent items
      const recentIndex = ws.recentItemIds.findIndex(
        (item) => item.type === 'conversation' && item.id === id
      );
      if (recentIndex !== -1) {
        ws.recentItemIds.splice(recentIndex, 1);
      }
    }
  });

  // Clear active item if it was deleted (using setter for persistence)
  if (activeItem?.type === 'conversation' && activeItem.id === id) {
    setActiveItem(null);
  }
}

/**
 * Bump an item to front of workspace's recent list
 */
export function bumpItemToRecent(ref: SidebarItemRef): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const ws = doc.workspaces[doc.activeWorkspaceId];
    if (!ws) return;
    ensureWorkspaceArrays(ws);

    // Remove if already present
    const existingIndex = ws.recentItemIds.findIndex(
      (r) => r.type === ref.type && r.id === ref.id
    );
    if (existingIndex !== -1) {
      ws.recentItemIds.splice(existingIndex, 1);
    }

    // Add to front
    ws.recentItemIds.unshift(ref);
  });
}

// --- File Sync Functions ---

/**
 * Check if file sync is available (running in Electron with API)
 */
export function getIsFileSyncAvailable(): boolean {
  return isFileSyncAvailable();
}

/**
 * Check if the active vault has file sync enabled
 */
export function getIsFileSyncEnabled(): boolean {
  const vault = getActiveVault();
  return vault?.baseDirectory !== undefined;
}

/**
 * Get the sync directory path for the active vault
 */
export function getSyncDirectory(): string | undefined {
  const vault = getActiveVault();
  return vault?.baseDirectory;
}

/**
 * Check if the active vault is currently syncing
 */
export function getIsSyncing(): boolean {
  const vault = getActiveVault();
  if (!vault) return false;
  return getCurrentSyncedVaultId() === vault.id;
}

/**
 * Enable file sync for the active vault by selecting a directory
 * @returns The selected directory path, or null if cancelled
 */
export async function enableFileSync(): Promise<string | null> {
  const vault = getActiveVault();
  if (!vault) return null;

  const directory = await selectSyncDirectory();
  if (!directory) return null;

  // Update vault with new baseDirectory
  updateVaultInRepo(vault.id, { baseDirectory: directory });

  // Refresh vaults state
  const updatedVault = { ...vault, baseDirectory: directory };

  // Update local state
  const index = vaults.findIndex((v) => v.id === vault.id);
  if (index !== -1) {
    vaults[index] = updatedVault;
    // Trigger reactivity
    vaults = [...vaults];
  }

  // Connect sync
  const repo = getRepo();
  await connectVaultSync(repo, updatedVault);

  // Perform initial file sync (OPFS -> filesystem and filesystem -> OPFS)
  // Using dynamic import to avoid circular dependency with file-sync.svelte.ts
  try {
    const { performInitialFileSync, performReverseFileSync, setupFileSyncListener } =
      await import('./file-sync.svelte');

    // Sync existing OPFS files to filesystem
    await performInitialFileSync();

    // Import any files already on filesystem into OPFS
    await performReverseFileSync();

    // Set up listener for new files added to filesystem
    setupFileSyncListener();
  } catch (error) {
    console.error('[FileSync] Failed to perform initial file sync:', error);
  }

  return directory;
}

/**
 * Disable file sync for the active vault
 */
export async function disableFileSync(): Promise<void> {
  const vault = getActiveVault();
  if (!vault) return;

  // Disconnect sync first
  await disconnectVaultSync();

  // Update vault to remove baseDirectory
  updateVaultInRepo(vault.id, { baseDirectory: undefined });

  // Refresh vaults state
  const updatedVault = { ...vault, baseDirectory: undefined };

  // Update local state
  const index = vaults.findIndex((v) => v.id === vault.id);
  if (index !== -1) {
    vaults[index] = updatedVault;
    // Trigger reactivity
    vaults = [...vaults];
  }
}

// --- Shelf Items (persisted in Automerge) ---

import type { ShelfItemData } from './types';

/**
 * Get all shelf items
 */
export function getShelfItems(): ShelfItemData[] {
  return currentDoc.shelfItems ?? [];
}

/**
 * Check if an item is on the shelf
 */
export function isItemOnShelf(type: 'note' | 'conversation', id: string): boolean {
  const items = currentDoc.shelfItems ?? [];
  return items.some((item) => item.type === type && item.id === id);
}

/**
 * Add an item to the shelf
 */
export function addShelfItem(type: 'note' | 'conversation', id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  // Don't add if already on shelf
  if (isItemOnShelf(type, id)) return;

  docHandle.change((doc) => {
    if (!doc.shelfItems) {
      doc.shelfItems = [];
    }
    doc.shelfItems.push({ type, id, isExpanded: false });
  });
}

/**
 * Remove an item from the shelf
 */
export function removeShelfItem(type: 'note' | 'conversation', id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.shelfItems) return;
    const index = doc.shelfItems.findIndex(
      (item) => item.type === type && item.id === id
    );
    if (index !== -1) {
      doc.shelfItems.splice(index, 1);
    }
  });
}

/**
 * Toggle the expanded state of a shelf item
 */
export function toggleShelfItemExpanded(type: 'note' | 'conversation', id: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.shelfItems) return;
    const item = doc.shelfItems.find((i) => i.type === type && i.id === id);
    if (item) {
      item.isExpanded = !item.isExpanded;
    }
  });
}

/**
 * Set the expanded state of a shelf item
 */
export function setShelfItemExpanded(
  type: 'note' | 'conversation',
  id: string,
  expanded: boolean
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.shelfItems) return;
    const item = doc.shelfItems.find((i) => i.type === type && i.id === id);
    if (item && item.isExpanded !== expanded) {
      item.isExpanded = expanded;
    }
  });
}

/**
 * Clear all items from the shelf
 */
export function clearShelfItems(): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    doc.shelfItems = [];
  });
}

// --- EPUB Support ---

import type { EpubNoteProps } from './types';

/** EPUB note type ID constant */
export const EPUB_NOTE_TYPE_ID = 'type-epub';

/**
 * Get all non-archived EPUB notes, sorted by last read (most recent first)
 */
export function getEpubNotes(): NoteMetadata[] {
  return Object.values(currentDoc.notes)
    .filter((note) => !note.archived && getSourceFormat(note) === 'epub')
    .sort((a, b) => {
      // Sort by lastRead if available, otherwise by updated
      const aLastRead = (a.props as EpubNoteProps | undefined)?.lastRead || a.updated;
      const bLastRead = (b.props as EpubNoteProps | undefined)?.lastRead || b.updated;
      return new Date(bLastRead).getTime() - new Date(aLastRead).getTime();
    });
}

/**
 * Create an EPUB note
 * @returns The new note's ID
 */
export function createEpubNote(params: {
  title: string;
  epubHash: string;
  epubTitle?: string;
  epubAuthor?: string;
}): string {
  if (!docHandle) throw new Error('Not initialized');

  const id = generateNoteId();
  const now = nowISO();

  // Build props object, excluding undefined values (Automerge doesn't allow undefined)
  const props: Record<string, unknown> = {
    epubHash: params.epubHash,
    progress: 0,
    textSize: 100
  };
  if (params.epubTitle !== undefined) {
    props.epubTitle = params.epubTitle;
  }
  if (params.epubAuthor !== undefined) {
    props.epubAuthor = params.epubAuthor;
  }

  docHandle.change((doc) => {
    doc.notes[id] = {
      id,
      title: params.title,
      content: '',
      type: DEFAULT_NOTE_TYPE_ID,
      sourceFormat: 'epub',
      created: now,
      updated: now,
      archived: false,
      props
    };

    // Auto-add to recent items in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      const ws = doc.workspaces[workspaceId];
      ensureWorkspaceArrays(ws);
      ws.recentItemIds.unshift({ type: 'note', id });
    }
  });

  return id;
}

/**
 * Update EPUB reading state (CFI position, progress, last read time)
 * Use this for debounced reading position updates
 */
export function updateEpubReadingState(
  noteId: string,
  updates: {
    currentCfi?: string;
    progress?: number;
    lastRead?: string;
  }
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }

    const props = note.props as EpubNoteProps;
    if (updates.currentCfi !== undefined) props.currentCfi = updates.currentCfi;
    if (updates.progress !== undefined) props.progress = updates.progress;
    if (updates.lastRead !== undefined) props.lastRead = updates.lastRead;

    note.updated = nowISO();
  });
}

/**
 * Update EPUB text size preference
 */
export function updateEpubTextSize(noteId: string, textSize: number): void {
  if (!docHandle) throw new Error('Not initialized');

  // Clamp text size to valid range
  const clampedSize = Math.max(75, Math.min(200, textSize));

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }

    (note.props as EpubNoteProps).textSize = clampedSize;
    note.updated = nowISO();
  });
}

/**
 * Get EPUB props from a note
 */
export function getEpubProps(noteId: string): EpubNoteProps | undefined {
  const note = currentDoc.notes[noteId];
  if (!note || getSourceFormat(note) !== 'epub') return undefined;
  return note.props as EpubNoteProps | undefined;
}

// --- PDF Support ---

import type { PdfNoteProps } from './types';

/** PDF note type ID constant */
export const PDF_NOTE_TYPE_ID = 'type-pdf';

/**
 * Get all non-archived PDF notes, sorted by last read (most recent first)
 */
export function getPdfNotes(): NoteMetadata[] {
  return Object.values(currentDoc.notes)
    .filter((note) => !note.archived && getSourceFormat(note) === 'pdf')
    .sort((a, b) => {
      // Sort by lastRead if available, otherwise by updated
      const aLastRead = (a.props as PdfNoteProps | undefined)?.lastRead || a.updated;
      const bLastRead = (b.props as PdfNoteProps | undefined)?.lastRead || b.updated;
      return new Date(bLastRead).getTime() - new Date(aLastRead).getTime();
    });
}

/**
 * Create a PDF note
 * @returns The new note's ID
 */
export function createPdfNote(params: {
  title: string;
  pdfHash: string;
  totalPages: number;
  pdfTitle?: string;
  pdfAuthor?: string;
}): string {
  if (!docHandle) throw new Error('Not initialized');

  const id = generateNoteId();
  const now = nowISO();

  // Build props object, excluding undefined values (Automerge doesn't allow undefined)
  const props: Record<string, unknown> = {
    pdfHash: params.pdfHash,
    totalPages: params.totalPages,
    currentPage: 1,
    zoomLevel: 100
  };
  if (params.pdfTitle !== undefined) {
    props.pdfTitle = params.pdfTitle;
  }
  if (params.pdfAuthor !== undefined) {
    props.pdfAuthor = params.pdfAuthor;
  }

  docHandle.change((doc) => {
    doc.notes[id] = {
      id,
      title: params.title,
      content: '',
      type: DEFAULT_NOTE_TYPE_ID,
      sourceFormat: 'pdf',
      created: now,
      updated: now,
      archived: false,
      props
    };

    // Auto-add to recent items in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      const ws = doc.workspaces[workspaceId];
      ensureWorkspaceArrays(ws);
      ws.recentItemIds.unshift({ type: 'note', id });
    }
  });

  return id;
}

/**
 * Update PDF reading state (current page, zoom level, last read time)
 * Use this for debounced reading position updates
 */
export function updatePdfReadingState(
  noteId: string,
  updates: {
    currentPage?: number;
    zoomLevel?: number;
    lastRead?: string;
  }
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }

    const props = note.props as PdfNoteProps;
    if (updates.currentPage !== undefined) props.currentPage = updates.currentPage;
    if (updates.zoomLevel !== undefined) props.zoomLevel = updates.zoomLevel;
    if (updates.lastRead !== undefined) props.lastRead = updates.lastRead;

    note.updated = nowISO();
  });
}

/**
 * Update PDF zoom level preference
 */
export function updatePdfZoomLevel(noteId: string, zoomLevel: number): void {
  if (!docHandle) throw new Error('Not initialized');

  // Clamp zoom level to valid range
  const clampedZoom = Math.max(50, Math.min(200, zoomLevel));

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }

    (note.props as PdfNoteProps).zoomLevel = clampedZoom;
    note.updated = nowISO();
  });
}

/**
 * Get PDF props from a note
 */
export function getPdfProps(noteId: string): PdfNoteProps | undefined {
  const note = currentDoc.notes[noteId];
  if (!note || getSourceFormat(note) !== 'pdf') return undefined;
  return note.props as PdfNoteProps | undefined;
}

// --- Webpage Archive Support ---

import type { WebpageNoteProps } from './types';

/** Webpage note type ID constant */
export const WEBPAGE_NOTE_TYPE_ID = 'type-webpage';

/**
 * Get all non-archived webpage notes, sorted by last read (most recent first)
 */
export function getWebpageNotes(): NoteMetadata[] {
  return Object.values(currentDoc.notes)
    .filter((note) => !note.archived && getSourceFormat(note) === 'webpage')
    .sort((a, b) => {
      // Sort by lastRead if available, otherwise by updated
      const aLastRead = (a.props as WebpageNoteProps | undefined)?.lastRead || a.updated;
      const bLastRead = (b.props as WebpageNoteProps | undefined)?.lastRead || b.updated;
      return new Date(bLastRead).getTime() - new Date(aLastRead).getTime();
    });
}

/**
 * Create a Webpage note
 * @returns The new note's ID
 */
export function createWebpageNote(params: {
  title: string;
  webpageHash: string;
  webpageUrl: string;
  webpageTitle?: string;
  webpageAuthor?: string;
  webpageSiteName?: string;
  webpageExcerpt?: string;
}): string {
  if (!docHandle) throw new Error('Not initialized');

  const id = generateNoteId();
  const now = nowISO();

  // Build props object, excluding undefined values (Automerge doesn't allow undefined)
  const props: Record<string, unknown> = {
    webpageHash: params.webpageHash,
    webpageUrl: params.webpageUrl,
    progress: 0,
    archivedAt: now
  };
  if (params.webpageTitle !== undefined) {
    props.webpageTitle = params.webpageTitle;
  }
  if (params.webpageAuthor !== undefined) {
    props.webpageAuthor = params.webpageAuthor;
  }
  if (params.webpageSiteName !== undefined) {
    props.webpageSiteName = params.webpageSiteName;
  }
  if (params.webpageExcerpt !== undefined) {
    props.webpageExcerpt = params.webpageExcerpt;
  }

  docHandle.change((doc) => {
    doc.notes[id] = {
      id,
      title: params.title,
      content: '',
      type: DEFAULT_NOTE_TYPE_ID,
      sourceFormat: 'webpage',
      created: now,
      updated: now,
      archived: false,
      props
    };

    // Auto-add to recent items in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      const ws = doc.workspaces[workspaceId];
      ensureWorkspaceArrays(ws);
      ws.recentItemIds.unshift({ type: 'note', id });
    }
  });

  return id;
}

/**
 * Update Webpage reading state (progress, last read time)
 * Use this for debounced reading position updates
 */
export function updateWebpageReadingState(
  noteId: string,
  updates: {
    progress?: number;
    lastRead?: string;
  }
): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }

    const props = note.props as WebpageNoteProps;
    if (updates.progress !== undefined) props.progress = updates.progress;
    if (updates.lastRead !== undefined) props.lastRead = updates.lastRead;

    note.updated = nowISO();
  });
}

/**
 * Get Webpage props from a note
 */
export function getWebpageProps(noteId: string): WebpageNoteProps | undefined {
  const note = currentDoc.notes[noteId];
  if (!note || getSourceFormat(note) !== 'webpage') return undefined;
  return note.props as WebpageNoteProps | undefined;
}

// --- Deck Support ---

import { createEmptyDeckConfig } from '../../../../shared/deck-yaml-utils';

/** Deck note type ID constant - kept for backward compatibility during migration */
export const DECK_NOTE_TYPE_ID = 'type-deck';

/**
 * Get all non-archived Deck notes, sorted by updated (most recent first)
 */
export function getDeckNotes(): NoteMetadata[] {
  return Object.values(currentDoc.notes)
    .filter((note) => !note.archived && getSourceFormat(note) === 'deck')
    .sort((a, b) => {
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });
}

/**
 * Create a Deck note with default configuration
 * Config is stored as structured data in note.props.deckConfig
 * @returns The new note's ID
 */
export function createDeckNote(title: string, config?: DeckConfig): string {
  if (!docHandle) throw new Error('Not initialized');

  const id = generateNoteId();
  const now = nowISO();

  // Use provided config or create default deck configuration
  const deckConfig = config ?? createEmptyDeckConfig();

  docHandle.change((doc) => {
    doc.notes[id] = {
      id,
      title,
      content: '', // Content not used for decks - config is in props
      type: DEFAULT_NOTE_TYPE_ID,
      sourceFormat: 'deck',
      created: now,
      updated: now,
      archived: false,
      props: {
        deckConfig: clone(deckConfig)
      }
    };

    // Auto-add to recent items in active workspace
    const workspaceId = doc.activeWorkspaceId;
    if (workspaceId && doc.workspaces[workspaceId]) {
      const ws = doc.workspaces[workspaceId];
      ensureWorkspaceArrays(ws);
      ws.recentItemIds.unshift({ type: 'note', id });
    }
  });

  return id;
}

/**
 * Get the deck configuration for a deck note
 * Returns null if note is not a deck or doesn't have a config
 */
export function getDeckConfig(noteId: string): DeckConfig | null {
  const note = currentDoc.notes[noteId];
  if (!note || getSourceFormat(note) !== 'deck') return null;
  return (note.props?.deckConfig as DeckConfig) ?? null;
}

/**
 * Update the deck configuration for a deck note
 */
export function updateDeckConfig(noteId: string, config: DeckConfig): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    if (!note.props) {
      note.props = {};
    }
    note.props.deckConfig = clone(config);
    note.updated = nowISO();
  });
}

// --- Review Mode ---

import type {
  ReviewRating,
  ReviewConfig,
  ReviewState,
  ReviewSession,
  ReviewSessionResult
} from './types';
import {
  DEFAULT_REVIEW_CONFIG,
  calculateNextSession,
  createReviewHistoryEntry,
  isNewSessionAvailable as checkSessionAvailable,
  getNextSessionAvailableAt,
  generateSessionId
} from './review-scheduler';
import type { ReviewStats } from './review-scheduler';

// Re-export for convenience
export type { ReviewStats };

/**
 * Get the current review state, with defaults if not initialized
 */
export function getReviewState(): ReviewState {
  return (
    currentDoc.reviewState ?? {
      currentSessionNumber: 1,
      lastSessionDate: null,
      config: DEFAULT_REVIEW_CONFIG
    }
  );
}

/**
 * Ensure reviewState exists in the document
 */
function ensureReviewState(): void {
  if (!docHandle) return;

  const doc = docHandle.doc();
  if (!doc?.reviewState) {
    docHandle.change((d) => {
      if (!d.reviewState) {
        d.reviewState = {
          currentSessionNumber: 1,
          lastSessionDate: null,
          config: { ...DEFAULT_REVIEW_CONFIG }
        };
      }
    });
  }
}

/**
 * Get the review configuration
 */
export function getReviewConfig(): ReviewConfig {
  return getReviewState().config ?? DEFAULT_REVIEW_CONFIG;
}

/**
 * Update the review configuration
 */
export function updateReviewConfig(config: Partial<ReviewConfig>): void {
  if (!docHandle) throw new Error('Not initialized');

  ensureReviewState();

  docHandle.change((doc) => {
    if (!doc.reviewState) {
      doc.reviewState = {
        currentSessionNumber: 1,
        lastSessionDate: null,
        config: { ...DEFAULT_REVIEW_CONFIG }
      };
    }
    doc.reviewState.config = { ...doc.reviewState.config, ...config };
  });
}

/**
 * Get the current session number
 */
export function getCurrentSessionNumber(): number {
  return getReviewState().currentSessionNumber;
}

/**
 * Increment the session number (called after completing a session)
 */
export function incrementSessionNumber(): void {
  if (!docHandle) throw new Error('Not initialized');

  ensureReviewState();

  docHandle.change((doc) => {
    if (!doc.reviewState) {
      doc.reviewState = {
        currentSessionNumber: 1,
        lastSessionDate: null,
        config: { ...DEFAULT_REVIEW_CONFIG }
      };
    }
    doc.reviewState.currentSessionNumber++;
    doc.reviewState.lastSessionDate = new Date().toISOString().split('T')[0];
  });
}

/**
 * Check if a new session is available (1 AM reset logic)
 */
export function isSessionAvailable(): boolean {
  const state = getReviewState();
  return checkSessionAvailable(state.lastSessionDate);
}

/**
 * Get the next time a session will become available
 */
export function getNextSessionTime(): Date | null {
  const state = getReviewState();
  return getNextSessionAvailableAt(state.lastSessionDate);
}

// --- Review Operations (per-note) ---

/**
 * Enable review for a note
 */
export function enableReview(noteId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  const currentSession = getCurrentSessionNumber();

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note) return;

    // Initialize review data if not present
    if (!note.review) {
      note.review = {
        enabled: true,
        lastReviewed: null,
        nextSessionNumber: currentSession + 1, // Review in the next session
        currentInterval: 1,
        status: 'active',
        reviewCount: 0,
        reviewHistory: []
      };
    } else {
      note.review.enabled = true;
      note.review.status = 'active';
      // If re-enabling a retired note, schedule for next session
      if (note.review.nextSessionNumber < currentSession) {
        note.review.nextSessionNumber = currentSession + 1;
        note.review.currentInterval = 1;
      }
    }
  });
}

/**
 * Disable review for a note (keeps history)
 */
export function disableReview(noteId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note?.review) return;

    note.review.enabled = false;
  });
}

/**
 * Reactivate a retired note (put back into review rotation)
 */
export function reactivateReview(noteId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  const currentSession = getCurrentSessionNumber();

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note?.review) return;

    note.review.status = 'active';
    note.review.enabled = true;
    note.review.nextSessionNumber = currentSession + 1;
    note.review.currentInterval = 1;
  });
}

/**
 * Get review data for a specific note
 */
export function getReviewData(noteId: string): ReviewData | null {
  const note = currentDoc.notes[noteId];
  return note?.review ?? null;
}

/**
 * Get all notes with review enabled (active or retired) - metadata only
 */
export function getReviewEnabledNotes(): NoteMetadata[] {
  return Object.values(currentDoc.notes).filter(
    (note) => !note.archived && note.review?.enabled
  );
}

/**
 * Get notes due for review in the current session - metadata only
 */
export function getNotesForReview(): NoteMetadata[] {
  const currentSession = getCurrentSessionNumber();
  const config = getReviewConfig();

  const dueNotes = Object.values(currentDoc.notes)
    .filter((note) => {
      if (note.archived) return false;
      if (!note.review?.enabled) return false;
      if (note.review.status === 'retired') return false;
      return note.review.nextSessionNumber <= currentSession;
    })
    .sort((a, b) => {
      // Sort by nextSessionNumber (most overdue first), then by updated
      const aSession = a.review?.nextSessionNumber ?? 0;
      const bSession = b.review?.nextSessionNumber ?? 0;
      if (aSession !== bSession) return aSession - bSession;
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    })
    .slice(0, config.sessionSize);

  return dueNotes;
}

/**
 * Get review statistics for the dashboard
 */
export function getReviewStats(): ReviewStats {
  const currentSession = getCurrentSessionNumber();
  const notes = Object.values(currentDoc.notes);

  let dueThisSession = 0;
  let totalEnabled = 0;
  let retired = 0;

  for (const note of notes) {
    if (note.archived) continue;
    if (!note.review?.enabled) continue;

    totalEnabled++;

    if (note.review.status === 'retired') {
      retired++;
    } else if (note.review.nextSessionNumber <= currentSession) {
      dueThisSession++;
    }
  }

  return {
    dueThisSession,
    totalEnabled,
    retired,
    currentSessionNumber: currentSession
  };
}

/**
 * Get all review history across all notes
 */
export function getAllReviewHistory(): Array<{
  noteId: string;
  noteTitle: string;
  entry: ReviewHistoryEntry;
}> {
  const result: Array<{
    noteId: string;
    noteTitle: string;
    entry: ReviewHistoryEntry;
  }> = [];

  for (const note of Object.values(currentDoc.notes)) {
    if (note.archived) continue;
    if (!note.review?.reviewHistory) continue;

    for (const entry of note.review.reviewHistory) {
      result.push({
        noteId: note.id,
        noteTitle: note.title,
        entry
      });
    }
  }

  // Sort by date, most recent first
  result.sort((a, b) => {
    return new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime();
  });

  return result;
}

// --- Session Management (persisted in Automerge) ---

/**
 * Get the active session if one is in progress
 */
export function getActiveSession(): ReviewSession | null {
  return getReviewState().activeSession ?? null;
}

/**
 * Check if there's an active session
 */
export function hasActiveSession(): boolean {
  return !!getActiveSession();
}

/**
 * Start a new review session
 */
export function startReviewSession(noteIds: string[]): ReviewSession {
  if (!docHandle) throw new Error('Not initialized');

  ensureReviewState();

  const session: ReviewSession = {
    id: generateSessionId(),
    startedAt: nowISO(),
    noteIds,
    currentIndex: 0,
    results: [],
    state: 'prompting'
  };

  docHandle.change((doc) => {
    if (!doc.reviewState) {
      doc.reviewState = {
        currentSessionNumber: 1,
        lastSessionDate: null,
        config: { ...DEFAULT_REVIEW_CONFIG }
      };
    }
    doc.reviewState.activeSession = session;
  });

  return session;
}

/**
 * Update the active session state
 */
export function updateSessionState(updates: Partial<ReviewSession>): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.reviewState?.activeSession) return;

    const session = doc.reviewState.activeSession;

    if (updates.currentIndex !== undefined) {
      session.currentIndex = updates.currentIndex;
    }
    if (updates.currentPrompt !== undefined) {
      session.currentPrompt = updates.currentPrompt;
    }
    if (updates.userResponse !== undefined) {
      session.userResponse = updates.userResponse;
    }
    if (updates.agentFeedback !== undefined) {
      session.agentFeedback = updates.agentFeedback;
    }
    if (updates.state !== undefined) {
      session.state = updates.state;
    }
  });
}

/**
 * Record a review result and update note scheduling
 */
export function recordReview(
  noteId: string,
  rating: ReviewRating,
  prompt: string,
  userResponse: string,
  agentFeedback: string
): number {
  if (!docHandle) throw new Error('Not initialized');

  const currentSession = getCurrentSessionNumber();
  const config = getReviewConfig();

  let scheduledForSession = -1;

  docHandle.change((doc) => {
    const note = doc.notes[noteId];
    if (!note?.review) return;

    const review = note.review;
    const result = calculateNextSession(
      currentSession,
      review.currentInterval,
      rating,
      config
    );

    if (result === 'retired') {
      review.status = 'retired';
      review.nextSessionNumber = 999999; // Far future
      scheduledForSession = -1;
    } else {
      review.nextSessionNumber = result.nextSession;
      review.currentInterval = result.interval;
      scheduledForSession = result.nextSession;
    }

    review.lastReviewed = nowISO();
    review.reviewCount++;

    // Add to history
    if (!review.reviewHistory) {
      review.reviewHistory = [];
    }
    review.reviewHistory.push(
      createReviewHistoryEntry(
        currentSession,
        rating,
        userResponse,
        prompt,
        agentFeedback
      )
    );

    // Update session results
    if (doc.reviewState?.activeSession) {
      const session = doc.reviewState.activeSession;
      const sessionResult: ReviewSessionResult = {
        noteId,
        noteTitle: note.title,
        rating,
        userResponse,
        agentFeedback,
        timestamp: nowISO(),
        scheduledForSession
      };

      if (!session.results) {
        session.results = [];
      }
      session.results.push(sessionResult);

      // Advance to next note
      session.currentIndex++;
      delete session.currentPrompt;
      delete session.userResponse;
      delete session.agentFeedback;
      session.state = 'prompting';
    }
  });

  return scheduledForSession;
}

/**
 * Complete the current session
 */
export function completeSession(): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.reviewState) return;

    // Clear the active session
    delete doc.reviewState.activeSession;

    // Increment session number and record date
    doc.reviewState.currentSessionNumber++;
    doc.reviewState.lastSessionDate = new Date().toISOString().split('T')[0];
  });
}

/**
 * Clear the active session without completing it
 * (e.g., if user wants to abandon a session)
 */
export function clearActiveSession(): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.reviewState) return;
    delete doc.reviewState.activeSession;
  });
}

/**
 * Get the current note being reviewed in the active session
 */
export function getCurrentReviewNote(): NoteMetadata | null {
  const session = getActiveSession();
  if (!session) return null;

  const noteId = session.noteIds[session.currentIndex];
  if (!noteId) return null;

  return currentDoc.notes[noteId] ?? null;
}

/**
 * Get all notes with review data for the queue table
 */
export function getReviewQueueNotes(): Array<{
  note: NoteMetadata;
  review: ReviewData;
  estimatedDue: Date;
  isOverdue: boolean;
}> {
  const currentSession = getCurrentSessionNumber();
  const config = getReviewConfig();

  const result: Array<{
    note: NoteMetadata;
    review: ReviewData;
    estimatedDue: Date;
    isOverdue: boolean;
  }> = [];

  for (const note of Object.values(currentDoc.notes)) {
    if (note.archived) continue;
    if (!note.review?.enabled) continue;

    const review = note.review;
    const sessionsAway = Math.max(0, review.nextSessionNumber - currentSession);
    const daysAway = Math.round((sessionsAway / config.sessionsPerWeek) * 7);

    const estimatedDue = new Date();
    estimatedDue.setDate(estimatedDue.getDate() + daysAway);

    result.push({
      note,
      review,
      estimatedDue,
      isOverdue: review.nextSessionNumber <= currentSession && review.status === 'active'
    });
  }

  // Sort: overdue first, then by nextSessionNumber
  result.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return a.review.nextSessionNumber - b.review.nextSessionNumber;
  });

  return result;
}

// --- Inbox ---

/**
 * Get unprocessed notes (created recently but not marked as processed)
 * @param daysBack Number of days to look back for recently created notes
 */
export function getUnprocessedNotes(daysBack: number = 7): InboxNote[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffTime = cutoffDate.getTime();

  const processedNoteIds = currentDoc.processedNoteIds ?? {};

  return (
    Object.values(currentDoc.notes)
      .filter((note) => {
        if (note.archived) return false;
        // Note must be created within the lookback period
        const createdTime = new Date(note.created).getTime();
        if (createdTime < cutoffTime) return false;
        // Note must not be processed
        return !processedNoteIds[note.id];
      })
      .map((note) => ({
        id: note.id,
        title: note.title,
        type: note.type,
        created: note.created
      }))
      // Sort by created date, newest first
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
  );
}

/**
 * Get processed notes (marked as processed recently)
 * @param daysBack Number of days to look back for processed notes
 */
export function getProcessedNotes(daysBack: number = 7): InboxNote[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffTime = cutoffDate.getTime();

  const processedNoteIds = currentDoc.processedNoteIds ?? {};

  return (
    Object.entries(processedNoteIds)
      .filter(([noteId, processedAt]) => {
        const note = currentDoc.notes[noteId];
        if (!note || note.archived) return false;
        // Must be processed within the lookback period
        const processedTime = new Date(processedAt).getTime();
        return processedTime >= cutoffTime;
      })
      .map(([noteId, processedAt]) => {
        const note = currentDoc.notes[noteId];
        return {
          id: note.id,
          title: note.title,
          type: note.type,
          created: note.created,
          processedAt
        };
      })
      // Sort by processed date, newest first
      .sort((a, b) => {
        return new Date(b.processedAt!).getTime() - new Date(a.processedAt!).getTime();
      })
  );
}

/**
 * Get the count of unprocessed notes for the inbox badge
 */
export function getUnprocessedCount(daysBack: number = 7): number {
  return getUnprocessedNotes(daysBack).length;
}

/**
 * Mark a note as processed
 */
export function markNoteAsProcessed(noteId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.processedNoteIds) {
      doc.processedNoteIds = {};
    }
    doc.processedNoteIds[noteId] = nowISO();
  });
}

/**
 * Unmark a note as processed (move back to unprocessed)
 */
export function unmarkNoteAsProcessed(noteId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (doc.processedNoteIds && doc.processedNoteIds[noteId]) {
      delete doc.processedNoteIds[noteId];
    }
  });
}

/**
 * Mark multiple notes as processed
 */
export function markAllNotesAsProcessed(noteIds: string[]): void {
  if (!docHandle) throw new Error('Not initialized');

  const now = nowISO();
  docHandle.change((doc) => {
    if (!doc.processedNoteIds) {
      doc.processedNoteIds = {};
    }
    for (const noteId of noteIds) {
      doc.processedNoteIds[noteId] = now;
    }
  });
}

/**
 * Unmark multiple notes as processed
 */
export function unmarkAllNotesAsProcessed(noteIds: string[]): void {
  if (!docHandle) throw new Error('Not initialized');

  docHandle.change((doc) => {
    if (!doc.processedNoteIds) return;
    for (const noteId of noteIds) {
      if (doc.processedNoteIds[noteId]) {
        delete doc.processedNoteIds[noteId];
      }
    }
  });
}

/**
 * Check if a note is processed
 */
export function isNoteProcessed(noteId: string): boolean {
  return !!currentDoc.processedNoteIds?.[noteId];
}

// ============================================================================
// Agent Routine Operations
// ============================================================================

/**
 * Get all non-archived routines
 */
export function getRoutines(): AgentRoutine[] {
  const routines = currentDoc.agentRoutines || {};
  return Object.values(routines).filter((r) => r.status !== 'archived');
}

/**
 * Get all routines including archived
 */
export function getAllRoutines(): AgentRoutine[] {
  const routines = currentDoc.agentRoutines || {};
  return Object.values(routines);
}

/**
 * Get a single routine by ID
 */
export function getRoutine(id: string): AgentRoutine | undefined {
  return currentDoc.agentRoutines?.[id];
}

/**
 * Get a routine by name (case-insensitive)
 */
export function getRoutineByName(name: string): AgentRoutine | undefined {
  const routines = currentDoc.agentRoutines || {};
  const lowerName = name.toLowerCase();
  return Object.values(routines).find((r) => r.name.toLowerCase() === lowerName);
}

/**
 * Format recurring spec as human-readable string
 */
export function formatRecurringSchedule(spec: RecurringSpec): string {
  const { frequency, dayOfWeek, dayOfMonth, time } = spec;

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];

  let schedule = '';

  if (frequency === 'daily') {
    schedule = 'Every day';
  } else if (frequency === 'weekly' && dayOfWeek !== undefined) {
    schedule = `Every ${dayNames[dayOfWeek]}`;
  } else if (frequency === 'monthly' && dayOfMonth !== undefined) {
    const suffix =
      dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th';
    schedule = `Every month on the ${dayOfMonth}${suffix}`;
  } else {
    schedule = `Every ${frequency}`;
  }

  if (time) {
    schedule += ` at ${time}`;
  }

  return schedule;
}

/**
 * Check if a routine is currently due
 */
export function isRoutineDue(routine: AgentRoutine, now?: Date): boolean {
  const currentTime = now || new Date();

  // Must be active to be due
  if (routine.status !== 'active') {
    return false;
  }

  // One-time routines with due date
  if (routine.dueDate && !routine.recurringSpec) {
    const dueDate = new Date(routine.dueDate);
    return dueDate <= currentTime;
  }

  // Recurring routines
  if (routine.recurringSpec) {
    const { frequency, dayOfWeek, dayOfMonth } = routine.recurringSpec;

    // If never completed, it's due
    if (!routine.lastCompleted) {
      return true;
    }

    const lastCompleted = new Date(routine.lastCompleted);
    const daysSinceCompleted = Math.floor(
      (currentTime.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24)
    );

    switch (frequency) {
      case 'daily':
        return daysSinceCompleted >= 1;

      case 'weekly':
        if (dayOfWeek === undefined) return false;
        return daysSinceCompleted >= 7 && currentTime.getDay() === dayOfWeek;

      case 'monthly':
        if (dayOfMonth === undefined) return false;
        return daysSinceCompleted >= 28 && currentTime.getDate() === dayOfMonth;

      default:
        return false;
    }
  }

  return false;
}

/**
 * Calculate days until a routine is next due (for recurring routines)
 * Returns null if cannot be determined
 */
export function getDaysUntilNextDue(routine: AgentRoutine, now?: Date): number | null {
  const currentTime = now || new Date();

  // Only for recurring routines
  if (!routine.recurringSpec) {
    return null;
  }

  const { frequency, dayOfWeek, dayOfMonth } = routine.recurringSpec;

  // If never completed, it's due now (return 0)
  if (!routine.lastCompleted) {
    return 0;
  }

  const lastCompleted = new Date(routine.lastCompleted);
  const daysSinceCompleted = Math.floor(
    (currentTime.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24)
  );

  switch (frequency) {
    case 'daily': {
      // Next due date is tomorrow if already completed today
      const daysUntil = 1 - daysSinceCompleted;
      return daysUntil < 0 ? 0 : daysUntil;
    }

    case 'weekly': {
      if (dayOfWeek === undefined) return null;

      const currentDay = currentTime.getDay();
      const targetDay = dayOfWeek;

      // Calculate days until target day of week
      let daysUntilTargetDay = targetDay - currentDay;
      if (daysUntilTargetDay < 0) {
        daysUntilTargetDay += 7;
      }
      if (daysUntilTargetDay === 0) {
        daysUntilTargetDay = 7; // Next week if today is the target day
      }

      // Check if we've already completed it this week
      if (daysSinceCompleted < 7 && currentDay >= targetDay) {
        // Completed this week, so next occurrence is next week
        return daysUntilTargetDay;
      }

      return daysUntilTargetDay;
    }

    case 'monthly': {
      if (dayOfMonth === undefined) return null;

      const currentDay = currentTime.getDate();
      const targetDay = dayOfMonth;

      // Days until target day this month
      let daysUntil = targetDay - currentDay;

      // If target day has passed this month, or we've already completed it this month
      if (daysUntil < 0 || (daysUntil === 0 && daysSinceCompleted < 28)) {
        // Calculate days until next month's target day
        const daysInCurrentMonth = new Date(
          currentTime.getFullYear(),
          currentTime.getMonth() + 1,
          0
        ).getDate();
        const daysLeftInMonth = daysInCurrentMonth - currentDay;
        daysUntil = daysLeftInMonth + targetDay;
      }

      return daysUntil;
    }

    default:
      return null;
  }
}

/**
 * Compute due info for a routine
 */
function computeRoutineDueInfo(
  routine: AgentRoutine,
  now: Date
): RoutineListItem['dueInfo'] | undefined {
  const isRecurring = !!routine.recurringSpec;

  if (isRecurring && routine.recurringSpec) {
    const isDue = isRoutineDue(routine, now);

    let type: RoutineDueType = 'scheduled';
    if (isDue) {
      type = 'due_now';
    } else {
      const daysUntilNext = getDaysUntilNextDue(routine, now);
      if (daysUntilNext !== null && daysUntilNext <= 7) {
        type = 'upcoming';
      }
    }

    return {
      type,
      recurringSchedule: formatRecurringSchedule(routine.recurringSpec)
    };
  } else if (routine.dueDate) {
    const dueDate = new Date(routine.dueDate);
    const diffDays = Math.ceil(
      (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    let type: RoutineDueType;
    if (diffDays < 0) {
      type = 'overdue';
    } else if (diffDays === 0) {
      type = 'due_now';
    } else if (diffDays <= 7) {
      type = 'upcoming';
    } else {
      type = 'scheduled';
    }

    return {
      type,
      dueDate: routine.dueDate
    };
  }

  return undefined;
}

/**
 * Get routines as list items with computed due info
 */
export function getRoutineListItems(input?: ListRoutinesInput): RoutineListItem[] {
  const routines = currentDoc.agentRoutines || {};
  const now = new Date();

  let result = Object.values(routines);

  // Filter by status
  if (input?.status && input.status !== 'all') {
    result = result.filter((r) => r.status === input.status);
  } else if (!input?.includeArchived) {
    result = result.filter((r) => r.status !== 'archived');
  }

  // Filter by type
  if (input?.type && input.type !== 'all') {
    result = result.filter((r) => r.type === input.type);
  }

  // Filter recurring only
  if (input?.recurringOnly) {
    result = result.filter((r) => !!r.recurringSpec);
  }

  // Convert to list items and compute due info
  let listItems: RoutineListItem[] = result.map((r) => {
    const dueInfo = computeRoutineDueInfo(r, now);
    return {
      id: r.id,
      name: r.name,
      purpose: r.purpose,
      status: r.status,
      type: r.type,
      isRecurring: !!r.recurringSpec,
      dueInfo,
      lastCompleted: r.lastCompleted
    };
  });

  // Filter by due soon
  if (input?.dueSoon) {
    listItems = listItems.filter(
      (r) =>
        r.dueInfo &&
        (r.dueInfo.type === 'due_now' ||
          r.dueInfo.type === 'upcoming' ||
          r.dueInfo.type === 'overdue')
    );
  }

  // Filter overdue only
  if (input?.overdueOnly) {
    listItems = listItems.filter((r) => r.dueInfo?.type === 'overdue');
  }

  // Sort
  const sortBy = input?.sortBy || 'dueDate';
  const sortOrder = input?.sortOrder || 'asc';
  const multiplier = sortOrder === 'asc' ? 1 : -1;

  listItems.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return multiplier * a.name.localeCompare(b.name);

      case 'created': {
        const routineA = routines[a.id];
        const routineB = routines[b.id];
        return (
          multiplier *
          (new Date(routineA?.created || 0).getTime() -
            new Date(routineB?.created || 0).getTime())
        );
      }

      case 'lastCompleted': {
        const timeA = a.lastCompleted ? new Date(a.lastCompleted).getTime() : 0;
        const timeB = b.lastCompleted ? new Date(b.lastCompleted).getTime() : 0;
        return multiplier * (timeA - timeB);
      }

      case 'dueDate':
      default: {
        // Priority: overdue > due_now > upcoming > scheduled > no due info
        const priorityOrder: Record<RoutineDueType, number> = {
          overdue: 1,
          due_now: 2,
          upcoming: 3,
          scheduled: 4
        };
        const priorityA = a.dueInfo ? priorityOrder[a.dueInfo.type] : 5;
        const priorityB = b.dueInfo ? priorityOrder[b.dueInfo.type] : 5;
        if (priorityA !== priorityB) {
          return multiplier * (priorityA - priorityB);
        }
        // Secondary sort by name
        return a.name.localeCompare(b.name);
      }
    }
  });

  return listItems;
}

/**
 * Get routines that are currently due
 */
export function getRoutinesDueNow(): RoutineListItem[] {
  return getRoutineListItems({ status: 'active' }).filter(
    (r) => r.dueInfo?.type === 'due_now' || r.dueInfo?.type === 'overdue'
  );
}

/**
 * Get upcoming routines (due in next N days)
 */
export function getUpcomingRoutines(_daysAhead: number = 7): RoutineListItem[] {
  // TODO: Use daysAhead to filter routines by how many days ahead they're due
  return getRoutineListItems({ status: 'active' }).filter(
    (r) =>
      r.dueInfo?.type === 'upcoming' ||
      r.dueInfo?.type === 'due_now' ||
      r.dueInfo?.type === 'overdue'
  );
}

/**
 * Get backlog routines
 */
export function getBacklogRoutines(): RoutineListItem[] {
  return getRoutineListItems({ type: 'backlog', status: 'active' });
}

/**
 * Create a new routine
 * @returns The new routine's ID
 */
export function createRoutine(input: CreateRoutineInput): string {
  if (!docHandle) throw new Error('Not initialized');

  // Validate name length
  if (input.name.length < 1 || input.name.length > 20) {
    throw new Error('Routine name must be between 1 and 20 characters');
  }

  // Validate purpose length
  if (input.purpose.length < 1 || input.purpose.length > 100) {
    throw new Error('Routine purpose must be between 1 and 100 characters');
  }

  // Check for duplicate name
  const existing = getRoutineByName(input.name);
  if (existing && existing.status !== 'archived') {
    throw new Error(`A routine named '${input.name}' already exists`);
  }

  const id = generateRoutineId();
  const now = nowISO();

  docHandle.change((doc) => {
    if (!doc.agentRoutines) {
      doc.agentRoutines = {};
    }

    // Build supplementary materials with clone() to create fresh objects safe for Automerge
    const materials: SupplementaryMaterial[] = (input.supplementaryMaterials || []).map(
      (m, index) => ({
        id: generateRoutineMaterialId(),
        materialType: m.type,
        content: m.content,
        noteId: m.noteId,
        metadata: m.metadata ? clone(m.metadata) : undefined,
        position: index,
        createdAt: now
      })
    );

    doc.agentRoutines[id] = {
      id,
      name: input.name,
      purpose: input.purpose,
      description: input.description,
      status: input.status || 'active',
      type: input.type || 'routine',
      // Use clone() for objects to avoid Automerge reference errors
      recurringSpec: input.recurringSpec ? clone(input.recurringSpec) : undefined,
      dueDate: input.dueDate,
      created: now,
      updated: now,
      supplementaryMaterials: materials.length > 0 ? materials : undefined,
      completionHistory: []
    };
  });

  return id;
}

/**
 * Update an existing routine
 */
export function updateRoutine(input: UpdateRoutineInput): void {
  if (!docHandle) throw new Error('Not initialized');

  const routine = getRoutine(input.routineId);
  if (!routine) {
    throw new Error(`Routine not found: ${input.routineId}`);
  }

  // Validate name if provided
  if (input.name !== undefined) {
    if (input.name.length < 1 || input.name.length > 20) {
      throw new Error('Routine name must be between 1 and 20 characters');
    }
    // Check for duplicate name (excluding self)
    const existing = getRoutineByName(input.name);
    if (existing && existing.id !== input.routineId && existing.status !== 'archived') {
      throw new Error(`A routine named '${input.name}' already exists`);
    }
  }

  // Validate purpose if provided
  if (input.purpose !== undefined) {
    if (input.purpose.length < 1 || input.purpose.length > 100) {
      throw new Error('Routine purpose must be between 1 and 100 characters');
    }
  }

  docHandle.change((doc) => {
    const r = doc.agentRoutines?.[input.routineId];
    if (!r) return;

    if (input.name !== undefined) r.name = input.name;
    if (input.purpose !== undefined) r.purpose = input.purpose;
    if (input.description !== undefined) r.description = input.description;
    if (input.status !== undefined) r.status = input.status;
    if (input.type !== undefined) r.type = input.type;

    // Handle recurringSpec - null means remove, undefined means don't change
    // Use clone() to create fresh objects safe for Automerge
    if (input.recurringSpec === null) {
      r.recurringSpec = undefined;
    } else if (input.recurringSpec !== undefined) {
      r.recurringSpec = clone(input.recurringSpec);
    }

    // Handle dueDate - null means remove, undefined means don't change
    if (input.dueDate === null) {
      r.dueDate = undefined;
    } else if (input.dueDate !== undefined) {
      r.dueDate = input.dueDate;
    }

    r.updated = nowISO();
  });
}

/**
 * Delete a routine (soft delete - set to archived)
 */
export function deleteRoutine(routineId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  const routine = getRoutine(routineId);
  if (!routine) {
    throw new Error(`Routine not found: ${routineId}`);
  }

  docHandle.change((doc) => {
    const r = doc.agentRoutines?.[routineId];
    if (r) {
      r.status = 'archived';
      r.updated = nowISO();
    }
  });
}

/**
 * Complete a routine
 * @returns The completion ID
 */
export function completeRoutine(input: CompleteRoutineInput): string {
  if (!docHandle) throw new Error('Not initialized');

  const routine = getRoutine(input.routineId);
  if (!routine) {
    throw new Error(`Routine not found: ${input.routineId}`);
  }

  const completionId = generateRoutineCompletionId();
  const now = nowISO();

  docHandle.change((doc) => {
    const r = doc.agentRoutines?.[input.routineId];
    if (!r) return;

    // Add completion record
    if (!r.completionHistory) {
      r.completionHistory = [];
    }

    // Build completion record, only including defined values
    // (Automerge doesn't allow undefined)
    const completion: {
      id: string;
      completedAt: string;
      conversationId?: string;
      notes?: string;
      outputNoteId?: string;
      metadata?: { durationMs?: number; toolCallsCount?: number };
    } = {
      id: completionId,
      completedAt: now
    };
    if (input.conversationId !== undefined)
      completion.conversationId = input.conversationId;
    if (input.notes !== undefined) completion.notes = input.notes;
    if (input.outputNoteId !== undefined) completion.outputNoteId = input.outputNoteId;
    if (input.metadata !== undefined) completion.metadata = clone(input.metadata);

    r.completionHistory.push(completion);

    // Update last completed
    r.lastCompleted = now;
    r.updated = now;

    // For one-time routines, mark as completed
    // For recurring routines, keep as active
    if (!r.recurringSpec) {
      r.status = 'completed';
    }
  });

  return completionId;
}

/**
 * Add supplementary material to a routine
 * @returns The material ID
 */
export function addRoutineMaterial(
  routineId: string,
  material: {
    type: 'text' | 'code' | 'note_reference';
    content?: string;
    noteId?: string;
    metadata?: Record<string, unknown>;
    position?: number;
  }
): string {
  if (!docHandle) throw new Error('Not initialized');

  const routine = getRoutine(routineId);
  if (!routine) {
    throw new Error(`Routine not found: ${routineId}`);
  }

  const materialId = generateRoutineMaterialId();
  const now = nowISO();

  // Determine position
  const currentMaterials = routine.supplementaryMaterials || [];
  const position = material.position ?? currentMaterials.length;

  docHandle.change((doc) => {
    const r = doc.agentRoutines?.[routineId];
    if (!r) return;

    if (!r.supplementaryMaterials) {
      r.supplementaryMaterials = [];
    }

    r.supplementaryMaterials.push({
      id: materialId,
      materialType: material.type,
      content: material.content,
      noteId: material.noteId,
      // Use clone() to create fresh objects safe for Automerge
      metadata: material.metadata ? clone(material.metadata) : undefined,
      position,
      createdAt: now
    });

    r.updated = now;
  });

  return materialId;
}

/**
 * Remove supplementary material from a routine
 */
export function removeRoutineMaterial(routineId: string, materialId: string): void {
  if (!docHandle) throw new Error('Not initialized');

  const routine = getRoutine(routineId);
  if (!routine) {
    throw new Error(`Routine not found: ${routineId}`);
  }

  docHandle.change((doc) => {
    const r = doc.agentRoutines?.[routineId];
    if (!r || !r.supplementaryMaterials) return;

    const index = r.supplementaryMaterials.findIndex((m) => m.id === materialId);
    if (index !== -1) {
      r.supplementaryMaterials.splice(index, 1);
      r.updated = nowISO();
    }
  });
}

/**
 * Get routine context for AI system prompt injection
 */
export function getRoutineContextForPrompt(): string {
  const dueNow = getRoutinesDueNow();
  const upcoming = getUpcomingRoutines(7).filter((r) => r.dueInfo?.type === 'upcoming');
  const backlog = getBacklogRoutines();
  const active = getRoutineListItems({ status: 'active', type: 'routine' });

  let context = '## Available Routines\n\n';

  // Due now - highest priority
  if (dueNow.length > 0) {
    context += '### Due Now\n';
    for (const routine of dueNow) {
      const schedule = routine.dueInfo?.recurringSchedule || 'one-time routine';
      context += `- **${routine.name}**: ${routine.purpose} (${schedule})\n`;
    }
    context += '\n';
  }

  // Upcoming
  if (upcoming.length > 0) {
    context += '### Upcoming (Next 7 Days)\n';
    for (const routine of upcoming) {
      const schedule = routine.dueInfo?.recurringSchedule || 'one-time routine';
      context += `- **${routine.name}**: ${routine.purpose} (${schedule})\n`;
    }
    context += '\n';
  }

  // Other active (on-demand)
  const onDemand = active.filter(
    (r) => !dueNow.some((d) => d.id === r.id) && !upcoming.some((u) => u.id === r.id)
  );
  if (onDemand.length > 0) {
    context += '### On-Demand Routines\n';
    for (const routine of onDemand) {
      const schedule = routine.dueInfo?.recurringSchedule;
      context += `- **${routine.name}**: ${routine.purpose}${schedule ? ` (${schedule})` : ''}\n`;
    }
    context += '\n';
  }

  // Backlog (if any)
  if (backlog.length > 0) {
    context += '### Backlog Items\n';
    for (const routine of backlog.slice(0, 5)) {
      context += `- **${routine.name}**: ${routine.purpose}\n`;
    }
    if (backlog.length > 5) {
      context += `- ... and ${backlog.length - 5} more\n`;
    }
    context += '\n';
  }

  if (
    dueNow.length > 0 ||
    upcoming.length > 0 ||
    onDemand.length > 0 ||
    backlog.length > 0
  ) {
    context +=
      '\n*Hint: Use `get_routine` to load full details including instructions and supplementary materials, and `complete_routine` when finished.*\n';
  } else {
    context = '## No Routines Defined\n\nNo active routines are currently defined.\n';
  }

  return context;
}

/**
 * Get note types context for AI system prompt injection.
 * Generates a compact markdown section listing all non-archived note types
 * with their names and purposes.
 */
export function getNoteTypesContextForPrompt(): string {
  const noteTypes = getNoteTypes();

  if (noteTypes.length === 0) {
    return '## Note Types\n\nNo note types are currently defined in this vault.\n';
  }

  let context = '## Note Types\n\n';
  context += 'The following note types are available in this vault:\n\n';

  for (const noteType of noteTypes) {
    const purpose = noteType.purpose?.trim() || 'No purpose defined';
    context += `- **${noteType.name}**: ${purpose}\n`;
  }

  context +=
    '\nWhen creating or updating notes of a specific type, use `get_note_type` to understand the full requirements including metadata schema and agent instructions.\n';

  return context;
}
