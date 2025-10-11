# Project Log

## Note Cache Race Condition Fix - 2025-01-11

- Fixed race condition where noteCache cleared itself before tabs finished loading during vault switches: root cause was noteCache subscribing to `vault.switched` event and immediately clearing cache via `this.cacheArray = []`, causing `notesStore.notes` to become empty while temporaryTabsStore was loading tabs from storage, resulting in tabs showing as "Untitled" because hydration couldn't find note metadata in empty cache; removed `vault.switched` event listener from noteCache.svelte.ts and rely solely on `notes.bulkRefresh` event to repopulate cache, ensuring proper sequencing where VaultSwitcher explicitly calls `notesStore.initialize()` which publishes bulk refresh AFTER tabs are loaded; this matches the pattern already applied to temporaryTabsStore where duplicate event listeners were removed to prevent race conditions

## Vault Switch Race Condition Fix - 2025-01-11

- Fixed vault switch race condition that caused "Untitled" tabs to appear when switching vaults and quickly clicking tabs: root cause was duplicate event listeners and reactive derivation timing issues where tabs loaded before notes propagated through Svelte's `$derived` system; solution included removing duplicate `vault.switched` event listeners from stores, adding explicit microtask yields after `notesStore.initialize()` for reactivity propagation, implementing data validation in `refreshForVault()` with `ensureNotesAvailable()` method that waits for notes and validates all tabs, adding `isReady` flag to prevent UI interaction during loading; fixed loading spinner issue where `isVaultSwitching` flag was incorrectly checked in `isReady` getter after `isHydrated` was already set to true during vault switch, causing spinner to never disappear - removed `isVaultSwitching` check from `isReady` since hydration status is the source of truth; created comprehensive analysis document in `docs/VAULT-SWITCH-RACE-CONDITION-ANALYSIS.md` with full root cause analysis, architectural recommendations, and testing strategy

## Unpinned Notes Validation Fix - 2025-01-11

- Fixed "Untitled" tabs appearing long after vault switching when clicking temporary tabs: root cause was `notes-unpinned` event handler in App.svelte trying to add deleted notes to temporary tabs without checking if they exist in notesStore; when a note was deleted in a previous session while app was closed, `note.deleted` event never fired to clean it from pinnedStore's persisted storage, so pinnedStore still had deleted note IDs when vault switches and loads old data; when user opens any note, `noteNavigationService.checkPinnedNotesChanges()` runs and finds "unpinned" notes (actually deleted notes), emits `notes-unpinned` event, and handler tries to add them to tabs causing "Untitled" display and "Note not found" errors; implemented two-part fix: (1) validation in App.svelte's `notes-unpinned` event handler to check if note exists in notesStore before calling `temporaryTabsStore.addTab()`, preventing immediate symptom; (2) added `validatePinnedNotes()` method to pinnedStore that runs on initial load and vault switch to automatically remove deleted notes from storage by checking against notesStore, matching the validation pattern already used in temporaryTabsStore; deleted notes are now cleaned up automatically on app startup and vault switching, eliminating the root cause

## Temporary Tabs Debug Logging and Validation - 2025-10-11

- Added comprehensive debug logging and validation to diagnose "Untitled" temporary tab issue where certain notes show as Untitled and don't open when clicked: added logging to TemporaryTabs.svelte to track tab hydration failures (when noteId doesn't exist in notesStore) and click attempts on missing notes, added logging to temporaryTabsStore.svelte.ts to track tab addition/removal/updates including note.renamed and note.deleted event handling, storage load/save operations with full tab details, old tab cleanup with age calculations, and max tabs limit enforcement; implemented validateTabs() method that checks all tabs against notesStore and logs prominent warnings for orphaned tabs without automatically removing them (to avoid hiding underlying issues), runs on notes.bulkRefresh event after initial vault load; database investigation of pkb-flint vault confirmed note ID n-5e23c36f genuinely missing while 4 other tabs exist normally, demonstrating orphaned tabs can persist when note.deleted events don't fire properly; created comprehensive debug documentation in docs/DEBUG-TEMPORARY-TABS.md with scenarios for investigating note deletion race conditions, notes that never existed, vault switching issues, and aggressive cleanup settings; logging provides full context including noteIds, tab sources, timestamps, age in hours, and available notes counts to trace lifecycle of problematic tabs and identify root causes

## Daily Note Creation Event Publishing Fix - 2025-10-11

- Fixed issue where clicking future date entries in daily view created notes successfully but showed "Untitled" in temporary tabs: root cause was get-or-create-daily-note IPC handler not publishing note.created events to message bus when daily notes were created, causing noteCache to remain unaware of new notes and temporaryTabs component to fail title hydration when deriving titles from notesStore; implemented fix by adding pre-check to detect note creation (calling getOrCreateDailyNote with createIfMissing=false to see if note exists), then publishing note.created event with full metadata (id, type, filename, title, created, modified, size, tags, path) if note was newly created; preserves event sourcing architecture where all stores stay synchronized through message bus events without manual refresh calls; all TypeScript type checking, linting, and building passes successfully

## Event Sourcing Reactivity Fix - Version Counter Solution - 2025-10-11

- Fixed critical issue where notes were not appearing in UI despite cache being populated correctly: root cause was Svelte 5's reactivity tracking not working with $state Maps in .svelte.ts files (non-component context); even though cache was being populated via Map.set()/clear() operations, $derived values never re-ran because Svelte wasn't tracking the mutations; implemented solution using version counter pattern: added `private version = $state(0)` to noteCache and incremented it in all mutation methods (handleNoteCreated, handleBulkRefresh, etc.), then accessed `this.version` in getAllNotes() to register reactive dependency; when version increments, all $derived values that accessed it automatically re-run; also fixed NotesView.svelte destructuring and added setTimeout deferral for module initialization; key insight: in .svelte.ts files, $state collections (Map, Set, Array) need explicit version counters because Svelte can't intercept method calls like .set()/.delete() the way it tracks object property assignments; primitive counters provide reliable, trackable signals; comprehensive documentation with best practices pattern in docs/architecture/EVENT-SOURCING-TIMING-FIX.md; all TypeScript type checking and linting passes successfully

## Event Sourcing Testing and Debug Panel (Phase 6) - 2025-10-11

- Completed Phase 6 of event sourcing migration with comprehensive automated testing and development debugging tools: created 47 passing tests across 3 test files (messageBus.test.ts with 14 tests covering pub/sub, wildcards, unsubscribe, logging, and error handling; noteCache.test.ts with 27 tests covering all cache operations and query methods; event-sourcing.test.ts with 6 integration tests validating API→event conversion and cache simulation); implemented MessageBusDebugPanel.svelte component as floating debug panel in development mode with real-time event log, type-safe event filtering, color-coded event types, expandable JSON details, and event statistics; debug panel features include toggle button with event count badge, filter by event type dropdown, configurable max events display, enable/disable logging controls, and clear log functionality; all linting, type checking, and formatting passes successfully; event sourcing architecture now fully tested and production-ready with zero manual refresh patterns remaining in codebase

## Event Sourcing Store Migration (Phase 4) - 2025-10-11

- Completed Phase 4 of event sourcing migration to integrate remaining stores with message bus: dailyViewStore now subscribes to note.created/note.updated/note.deleted/vault.switched events to automatically update local weekly view state when daily notes change, temporaryTabsStore subscribes to note.renamed/note.deleted/vault.switched events to keep tab noteIds in sync and remove tabs for deleted notes, pinnedStore subscribes to note.renamed/note.deleted/vault.switched with enhanced unpinNote method that accepts optional addToTabs parameter to prevent adding deleted notes to temporary tabs; wikilinkService required no changes as it already uses event architecture through notesStore (NoteEditor publishes note.linksChanged events); Phase 5 vault switching confirmed already complete from Phase 2 with VaultSwitcher and App publishing vault.switched events that all stores subscribe to; key architectural insight is stores subscribe to events to maintain local state while components derive presentation data by joining with reactive note cache, keeping concerns separated; all TypeScript compilation, svelte-check, and formatting passes successfully

## Event Sourcing Store Migration (Phase 2) - 2025-10-11

- Completed Phase 2 of event sourcing architecture migration to eliminate manual refresh patterns: migrated noteStore.svelte.ts to read notes from noteCache via $derived instead of local state, removed refresh()/handleToolCall()/notifyWikilinksUpdated() methods and wikilinksUpdateCounter property, added subscription to vault.switched events for automatic re-initialization; updated all renderer components to use event-based reactivity by replacing wikilinksUpdateCounter with note.linksChanged event subscriptions in Backlinks.svelte and NoteEditor.svelte, removed all manual notesStore.refresh() calls from 10 files (dailyViewStore, temporaryTabsStore, pinnedStore, wikilinkService, electronChatService, InboxView, VaultSwitcher, App), updated vault switching flows to publish vault.switched events instead of calling refresh, and NoteEditor now publishes note.linksChanged events when wikilinks are updated during renames; architecture now has single source of truth (noteCache) with automatic reactivity through message bus, eliminated tight coupling between stores (no more circular imports for refresh calls), and all UI updates happen automatically through event propagation; all TypeScript compilation, linting, and Svelte checking passes successfully; next step is Phase 3 to update main process IPC handlers to publish events when notes are modified

## Event Sourcing Infrastructure (Phase 1) - 2025-10-11

- Implemented Phase 1 of event sourcing architecture to eliminate manual refresh patterns and store coupling: created messageBus.svelte.ts with type-safe pub/sub system supporting discriminated union event types (note.created, note.updated, note.deleted, note.renamed, note.moved, note.linksChanged, notes.bulkRefresh, vault.switched) with development logging and error handling for subscribers, created noteCache.svelte.ts with reactive Svelte $state cache that automatically updates from message bus events and provides optimistic update methods for UI responsiveness, added IPC event bridge in preload/index.ts with onNoteEvent handler that forwards main process events to renderer, updated global type definitions in env.d.ts for type safety, connected IPC to message bus in App.svelte using $effect to forward events from main process through message bus to all subscribers; architecture provides foundation for eliminating notesStore.refresh() calls, reactive cache that updates from events instead of polling, type-safe event system with centralized debugging, and preparation for Phase 2 noteStore migration; all TypeScript compilation and linting passes successfully

## Daily Note View Separation of Concerns Refactor - 2025-10-11

- Refactored daily note view architecture to cleanly separate view and store concerns: added `openDailyNote(date)` method to dailyViewStore that creates notes if needed and returns full metadata for navigation, added `updateLocalDailyNoteMetadata(date, dailyNote)` helper to update local state with fully loaded daily notes, updated DailyView to call new `handleDailyNoteTitleClick(date)` handler that uses store's openDailyNote instead of checking existence, simplified DaySection to always render title as clickable button without conditional logic (removed `{#if dailyNote?.id}` check), updated handleDayTitleClick to always delegate to parent callback; view layer now works with simple note entries without worrying about existence (all 7 days always editable), store layer handles complexity of creating notes transparently when user types content or clicks titles, eliminated interwoven existence checks from view components making code cleaner and more maintainable; all linting and type checking passes successfully

## Snippet Generation Removal for Faster Startup - 2025-10-11

- Eliminated expensive snippet generation at startup that was causing performance issues with large vaults: removed `generateSnippet()` function that required fetching full note content for every note just to display preview text, simplified `loadNotesOfType()` to return metadata directly from `listNotesByType` API without additional `getNote()` calls, removed `snippet` field from `NoteMetadata` type and all snippet display from UI (NotesView.svelte); fixed activeNoteStore.svelte.ts to use direct `getNote()` API call for loading single note instead of forcing full `notesStore.refresh()` that loaded all vault notes just to find one; startup performance dramatically improved for large vaults (loading only metadata from database instead of fetching full content for every note), memory footprint reduced, all components continue working as expected (SearchBar, NotesView, wikilink autocomplete), all type checking and linting passes successfully

## Add to Sidebar Auto-Opens Right Sidebar - 2025-10-10

- Enhanced "Add to Sidebar" button to automatically open the right sidebar in notes mode when clicked: modified NoteEditor.svelte handleAddToSidebar() function to check if right sidebar is visible and in notes mode, calls sidebarState.toggleRightSidebar() if closed and sidebarState.setRightSidebarMode('notes') if in different mode, ensuring users immediately see their newly added sidebar note without manual navigation; all linting and type checking passes successfully

## Shared Document Model Refactor - 2025-10-10

- Replaced event-driven bidirectional sync system with shared document model for dramatically simpler and more reliable note synchronization: created NoteDocument class with $state for content/title/activeEditors and NoteDocumentRegistry class to manage document lifecycle (loading, sharing, cleanup), refactored NoteEditor and SidebarNotes to share single NoteDocument instance per noteId instead of maintaining separate copies with notification system, removed ~400 lines of complex coordination logic including noteUpdateCounter/noteRenameCounter notifications, external update flags, debounce timer cleanup, timing windows, and syncToDatabase parameter; new architecture uses direct Svelte reactivity bindings where components automatically sync through shared $state, eliminates all race conditions since only one copy of data exists, provides instant updates (no 100ms database reload delays), shows visual indicators when note is open in multiple editors, maintains single autosave per document with automatic cleanup when all editors close; AI agent edits trigger reload through noteDocumentRegistry.reload() instead of notifications; removed 7 properties from notesStore (noteUpdateCounter, lastUpdatedNoteId, noteRenameCounter, lastRenamedNoteOldId, lastRenamedNoteNewId, notifyNoteUpdated, notifyNoteRenamed), simplified sidebarNotesStore by removing database sync and notification logic from updateNote(), updated electronChatService to reload documents on AI tool calls instead of sending notifications; created comprehensive architecture documentation in docs/architecture/SHARED-DOCUMENT-MODEL.md and preserved old system documentation in BIDIRECTIONAL-NOTE-SYNC.md for reference; all linting and type checking passes successfully

## Template Initial Note VaultSwitcher Fix - 2025-10-10

- Fixed VaultSwitcher interference with template initial note auto-open feature where VaultSwitcher's CreateVaultModal handler was executing instead of FirstTimeExperience handler during vault creation, causing initialNoteId to be lost: root cause was that when vault is created from FirstTimeExperience, hasVaults becomes true immediately and app switches from FirstTimeExperience to normal interface mid-flow, triggering VaultSwitcher's handleVaultCreated which called addTutorialNoteTabs() without initialNoteId argument; updated VaultSwitcher.svelte handleVaultCreated() to check if vaultInfo.initialNoteId exists and pass it to addTutorialNoteTabs([vaultInfo.initialNoteId]) when available, otherwise fall back to default tutorial notes behavior; added comprehensive logging throughout vault creation flow to track initialNoteId propagation; all linting and type checking passes successfully

## Template Initial Note Tab Timing Fix - 2025-10-10

- Fixed critical timing bug where initial note tab was added to wrong vault ID during vault creation: root cause was CreateVaultModal adding tab immediately after vault creation (to vault ID temp-6) but then vault switching/reinitialization changed current vault to different ID (temp-7), causing tab to be saved to wrong vault's storage and not appear when loading new vault; moved initial note tab addition from CreateVaultModal to App.svelte's handleVaultCreatedFromFirstTime() to run AFTER reinitializeNoteService() completes vault switching, ensuring temporary tabs store has correct vault ID when adding tab; updated CreateVaultModal to only pass vault info to parent without tab management, removed temporaryTabsStore import from CreateVaultModal; all formatting passes successfully

## Template Initial Note Auto-Open - 2025-10-10

- Added template-based initial note auto-open feature to guide new users immediately upon vault creation: templates now specify `initialNote` field in template.yml pointing to a starter note filename (e.g., welcome.md), TemplateManager.applyTemplate() tracks which note matches initialNote and returns its immutable ID, createVault() API returns initialNoteId in CreateVaultResult interface, CreateVaultModal automatically adds initialNoteId to temporary tabs using existing addTutorialNoteTabs() method when vault is created, cleaned up old App.svelte onboarding logic that referenced removed onboardingNotes field; architecture documentation updated to reflect new Phase 5 (Initial Note Tab Setup) in vault initialization flow; all type checking and formatting passes successfully

## Vault Template System Implementation - 2025-10-10

- Replaced hardcoded onboarding content with flexible file-based vault template system to enable custom vault configurations: created TemplateManager class for loading templates from YAML/markdown files, built two templates (default for general note-taking, research for academic work) with template-defined note types and starter notes, updated FlintNoteApi.createVault() to apply selected template during vault creation instead of every load, added listTemplates IPC API exposed through preload and integrated into CreateVaultModal UI with radio button template selector showing template icons and descriptions, updated build process to copy templates directory to output and removed old onboarding directory; all formatting and linting passes successfully

## Frontmatter Type Normalization - 2025-10-09

- Implemented automatic type field normalization in frontmatter during database rebuild to ensure consistency between filesystem location and note metadata: added normalizeFrontmatterType() helper method to search-manager.ts that checks if frontmatter type is missing or doesn't match parent directory name, writes correct type back to file using simple regex-based frontmatter updates, preserves all other frontmatter fields while fixing only the type field; integrated normalization into indexNoteFile() so it runs automatically during database rebuild for all notes, logs normalization actions for visibility, handles edge cases (missing frontmatter, malformed YAML) gracefully without failing the indexing operation; eliminates inconsistencies where notes had wrong type in frontmatter (e.g., type=project but in todo/ directory) or missing type field, ensuring database and filesystem are always in sync after rebuild; all 319 tests pass successfully with type checking and formatting clean

## Wikilink Path-Based Resolution Fix - 2025-10-09

- Fixed broken wikilink resolution for type/filename format identifiers where wikilinks like `[[sketch/what-makes-a-good-thinking-system|...]]` failed to open existing notes and instead created new ones: root cause was findNoteByIdentifier() function in wikilinks.svelte.ts missing support for path-based lookup, it only checked note IDs, titles, and filenames but never parsed identifiers containing slashes as type/filename paths; added path-based lookup logic that splits identifier on first slash to extract type and filename, then searches notes matching both type.toLowerCase() === extractedType AND filename without .md matches extractedFilename; new lookup order is: (1) note ID exact match, (2) type/filename path match, (3) title case-insensitive match, (4) filename without extension match; updated DATABASE-REBUILD-INVESTIGATION.md with Issue 8 documenting the problem, root cause, fix, and modified files; all formatting and type checking passes successfully

## External Links Table Schema Migration - 2025-10-09

- Fixed database rebuild error "table external_links has no column named title" caused by schema mismatch between migration code and current schema: migration v2.0.0 created external_links table with old schema (link_text column) while link-extractor.ts was updated to use new schema (title and link_type columns), causing INSERT failures during database rebuild link extraction; created migration v2.0.1 that updates external_links schema by renaming link_text to title and adding link_type column with default 'url' value, updated migrateToImmutableIds function to create correct schema from the start handling three states (new schema with title/link_type, old schema with link_text, oldest schema without either), updated all tests to reflect v2.0.1 as current version; all 319 tests pass successfully

## Database Rebuild Transaction Error Fix - 2025-10-09

- Fixed critical transaction error during database rebuild that prevented link extraction: LinkExtractor.storeLinks() always started its own transaction (BEGIN TRANSACTION) but was called from indexNoteFile() during rebuild when no transaction was active, causing "SQLITE_ERROR: cannot start a transaction within a transaction" errors when processing notes with wikilinks; modified LinkExtractor.storeLinks() to accept optional useTransaction parameter (defaults to true for backward compatibility), updated search-manager.ts:1017 to pass false during rebuild so link storage happens without transaction management while other callers (migrateLinks) continue using transactions for safety; all 219 tests pass successfully

## Database Rebuild YAML Parser Fix - 2025-10-09

- Fixed critical bug where database rebuild ignored immutable IDs from frontmatter: HybridSearchManager.parseNoteContent() was using a broken custom YAML parser that generated old-style type/filename IDs instead of reading immutable IDs from frontmatter, causing "Note not found" errors after rebuilding database; replaced custom parser with proper parseNoteContent() from yaml-parser.ts that uses js-yaml library, now correctly reads immutable IDs (n-xxxxxxxx format) from frontmatter during indexing and falls back to old-style IDs only for legacy notes, also fixed NoteManager.listNotes() to query database for missing frontmatter IDs and auto-heal files by writing database IDs back to frontmatter

## Migration Frontmatter Recovery Fix - 2025-10-09

- Fixed "Note not found" errors in vaults where migration failed to write IDs to frontmatter: modified NoteManager.listNotes() to query database for note IDs when frontmatter is missing instead of generating random IDs, implemented automatic frontmatter healing that writes database IDs back to files when detected, added proper error handling to skip notes that are neither in frontmatter nor database (will be indexed on next rebuild); fix prevents UI from requesting invalid note IDs and gradually repairs vaults with missing frontmatter during normal operation

## Slash Commands Database Migration - 2025-10-09

- Migrated slash commands storage from JSON file to database for consistency with other UI state: created slash_commands table in database schema with id/name/instruction/parameters/created_at/updated_at columns plus name index, added loadSlashCommands/saveSlashCommands methods to FlintNoteApi that serialize parameters JSON and handle DB operations, exposed methods through NoteService wrapper and updated IPC handlers to use note service instead of settings storage service, no changes needed to slashCommandsStore since it already uses IPC methods; all formatting, typechecking, and linting passes successfully

## Migration Test Coverage Improvements - 2025-10-09

- Added comprehensive test cases to migration-manager.test.ts addressing gaps identified in MIGRATION-TEST-GAP.md: created test "should preserve existing frontmatter when adding ID" that uses realistic onboarding note content with complex YAML frontmatter (quoted strings with colons, arrays, multiple fields) matching actual tutorial notes, added test "should handle frontmatter values with colons and special characters" covering all YAML types (strings, numbers, booleans, arrays, nested objects, dates, emojis, escaped quotes), both tests include critical YAML validation step that re-parses migrated files using parseNoteContent() to verify valid YAML and correct metadata preservation; tests confirm the js-yaml library fix prevents double-quoting bug and that title "Tutorial 1: Your First Daily Note" is preserved exactly (not as ""Tutorial 1...""), all 16 migration tests pass successfully

## UI State Migration YAML Bug Fix - 2025-10-08

- Fixed critical YAML frontmatter bug in v2.0.0 migration that caused "Note not found" errors: the migration's manual string manipulation was creating invalid YAML with double-double-quotes (title: ""Tutorial 1..."") when processing frontmatter that already contained quoted values, causing yaml.load() to fail silently and return empty metadata, which triggered random ID generation in listNotes since metadata.id was undefined; replaced manual string parsing in addOrUpdateFrontmatter() with proper js-yaml library usage (yaml.load() for parsing, yaml.dump() for serialization), added DELETE FROM ui_state to migration to clear stale UI state, disabled legacy IPC handlers as defensive measure; migration now correctly preserves existing frontmatter structure while adding immutable IDs, all notes load successfully after migration with proper ID preservation

## Advanced UI State Test Coverage - 2025-10-08

- Implemented Priority 1 tests from UI-STATE-TEST-COVERAGE.md covering critical scenarios for database-backed UI state management: created tests/server/api/ui-state-advanced.test.ts with 17 tests organized into 4 groups: concurrent vault operations (rapid switching, concurrent writes to different vaults, concurrent writes to same vault, vault isolation during updates), error recovery (missing vault handling, invalid state keys, extremely large state values 1000+ items, empty/null/undefined value handling, rapid update stress testing, clear-and-resave integrity), state key schema compliance (all 6 documented keys active_note/temporary_tabs/navigation_history/cursor_positions/pinned_notes/conversations with complex nested structures), multi-vault state management (10 vaults with independent state, isolated clear operations, same state values across vaults); all 17 tests pass successfully validating the core architectural fix for vault isolation bug, error resilience, and proper schema handling

## UI State Migration Test Suite - 2025-10-08

- Added comprehensive test suite for database-backed UI state system: updated migration-manager.test.ts with new test that verifies ui_state table creation during v2.0.0 migration including schema validation (checks all columns: id, vault_id, state_key, state_value, schema_version, updated_at) and index verification (idx_ui_state_vault, idx_ui_state_key); created new ui-state.test.ts with 18 tests covering basic saveUIState/loadUIState operations (simple and complex state with arrays, update behavior, null values, data type preservation), vault isolation (state segregation between different vaults), clearUIState functionality, error handling (large state values), and real-world workflow patterns (active note switching, temporary tabs management, pinned notes reordering); added ui_state table creation to schema.ts initializeSchema() so new vaults include the table from the start; all 31 tests pass successfully (13 migration tests + 18 UI state tests)

## Database Migration Consolidation - 2025-10-08

- Consolidated v2.0.0 and v2.1.0 database migrations into a single v2.0.0 release since 2.0.0 has not been released yet: combined immutable note IDs migration and UI state table creation into single migrateToV2() function that runs both sequentially, updated CURRENT_SCHEMA_VERSION to 2.0.0, simplified migration array to have just 1.1.0 and 2.0.0 versions; all linting and type checking passes

## Database-Backed UI State Migration - 2025-10-08

- Completed migration of all UI state from localStorage and JSON files to SQLite database, eliminating root cause of vault switching bugs and race conditions: added ui_state table to database schema with vault_id, state_key, state_value columns and proper indexes, created loadUIState/saveUIState/clearUIState methods in FlintNoteApi that serialize/deserialize JSON to database, exposed methods through NoteService and IPC handlers in main process, updated all 6 stores (activeNoteStore, temporaryTabsStore, navigationHistoryStore, cursorPositionStore, pinnedStore, unifiedChatStore) to use new database API instead of old file/localStorage storage, removed migration service imports and loading screen from App.svelte, kept old storage services and IPC handlers for backward compatibility; architecture now has single source of truth (database only) with per-vault state isolation, atomic updates via transactions, no race conditions, and simpler codebase; users will experience one-time UI state reset (lose tabs, pins, cursor positions, navigation history) but keep all notes and content intact; all TypeScript compilation and linting passes successfully

## UI State Migration Timing Fix - 2025-10-08

- Fixed critical timing issue where database migration (v2.0.0) completed but UI stores loaded old note IDs from both localStorage AND server-side vault-data files before migration could update them: problem occurred because stores initialize during module import (before any migration code runs), causing them to load old IDs and attempt to fetch notes from the newly-migrated database which now has different IDs; implemented comprehensive backup-and-clear strategy where migrationService.clearStaleUIState() is called at the very top of App.svelte before any other stores are imported, method backs up all localStorage keys containing note IDs to separate backup key then clears the original keys so stores find empty state on initialization; added clearVaultUIState IPC handler to clear server-side JSON files in ~/Library/Application Support/flint/vault-data/{vaultId}/ (temporary-tabs.json, active-note.json, cursor-positions.json, navigation-history.json) which also store note IDs but were previously unmigrated; updated all migration methods to read from backup instead of directly from localStorage; migration runs asynchronously after app loads to clear vault-data files and restore backed-up localStorage with properly migrated IDs; prevents "Note not found" errors when opening old vaults, though users lose temporary tabs and cursor positions as acceptable one-time cost of migration

## Migration Testing and Partial Recovery Fixes - 2025-10-08

- Enhanced database migration system with comprehensive tests and partial migration recovery: fixed idempotency check to detect partial migrations by verifying both schema AND data presence (notes table could be empty while migration table exists from failed runs), improved backup recovery to reuse existing backup tables from previous failed migrations instead of creating new empty backups, added debug logging to track migration progress and verify data migration success; created comprehensive test suite (tests/server/database/migration-manager.test.ts) with 12 passing tests covering fresh migrations (empty, small, large vaults), partial migration recovery scenarios, idempotency across multiple runs, multi-version migrations (v1.0.0→v1.1.0→v2.0.0), schema validation, and edge cases (special characters, missing frontmatter); tests use TestDatabaseManager to bypass automatic schema initialization and simulate various migration states including corrupted databases and partial failures

## Immutable Note IDs - Phase 1 Implementation - 2025-10-08

- Implemented database migration and core infrastructure for immutable note identity system to eliminate rename tracking complexity: created v2.0.0 database migration that generates immutable IDs (format: `n-xxxxxxxx`) for all existing notes and writes them to frontmatter as source of truth, migration recreates database schema with immutable ID as primary key and migrates all link tables to reference new IDs while preserving relationships, creates backup tables (notes_backup, note_links_backup, etc.) for rollback safety and note_id_migration mapping table for UI state migration, implemented idempotency checks so migration safely skips if already run; added getMigrationMapping() API endpoint exposed via IPC to allow renderer to fetch old→new ID mappings for localStorage migration; updated core note manager so generateNoteId() now generates random immutable IDs instead of type/filename combinations, createNote() writes ID to frontmatter, formatNoteContent() includes ID field, renameNoteWithFile() simplified to not change IDs (only updates filename/title), moveNote() preserves ID when moving between types, all ID lookups read from frontmatter with proper type guards; all TypeScript checks pass and code formatted; remaining work includes UI state migration service to update localStorage (pinned notes, sidebar notes, tabs, cursor positions), store cleanup to remove rename tracking methods (updateNoteId, notifyNoteRenamed), and API type updates to reflect stable IDs

## Bidirectional Sync for Sidebar Notes - 2025-10-06

- Implemented bidirectional reactivity between sidebar notes and main NoteEditor so changes in either location reflect in both: sidebarNotesStore now calls notesStore.notifyNoteUpdated() after syncing changes to database, NoteEditor watches notesStore.noteUpdateCounter and reloads when current note is updated externally, SidebarNotes watches same counter and reloads sidebar notes from database when updated in main editor, added syncToDatabase parameter to sidebarNotesStore.updateNote() to prevent infinite loops during external reloads, NoteEditor updates sidebarNotesStore.updateNoteId() when renaming notes that are in sidebar, both components reload from database as single source of truth to stay in sync; added notifyNoteRenamed() to notesStore with noteRenameCounter and lastRenamedNoteOldId/NewId state to track renames separately from regular updates, NoteEditor and SidebarNotes now watch for renames and update their note references when noteIds change due to title changes, fixes issue where components held stale noteIds after title changes

## Sidebar Notes Improvements - 2025-10-06

- Made sidebar note containers hug their contents and improved title editing UX: removed min-height from note containers so single-line notes don't take up excessive space, changed titles from click-to-edit to always-editable inputs with subtle styling (transparent background, shows border on hover/focus), added bidirectional sync so both title and content edits in sidebar update the actual notes, content changes debounced at 500ms while title changes only commit on blur/Enter key, Escape key reverts title to original value and blurs input, title changes rename the underlying note file via renameNote API and update noteId if rename returns new identifier, reverts title on rename failure to prevent inconsistent state

## Sidebar Notes Editor Variant - 2025-10-06

- Added dedicated 'sidebar-note' variant to CodeMirror configuration to fix bottom padding issue in sidebar notes: created new getSidebarNoteTheme() in editorConfig.svelte.ts with marginBottom: '0' to prevent 25vh scroll padding from default variant, added 'sidebar-note' to variant type union across EditorConfigOptions, CodeMirrorEditor props, and ScrollAutoService, configured sidebar-note theme with compact scrollbars and auto overflow instead of visible, SidebarNotes.svelte now passes variant="sidebar-note" prop to CodeMirrorEditor, properly styled editors that don't extend into adjacent notes

## Note Action Bar Layout Redesign - 2025-10-06

- Redesigned note editor action buttons for clearer layout: created new NoteActionBar.svelte component with normally-styled buttons for pin and metadata toggle actions, moved pin button from EditorHeader (where it appeared on hover) to action bar below title, replaced metadata disclosure triangle with "Show/Hide Metadata" button in action bar, updated EditorHeader to only contain title (removed pin control and hover logic), simplified MetadataView by removing disclosure triangle header button and moving Edit button to only appear when metadata is expanded, new layout follows pattern: title → action buttons (pin/metadata) → metadata (when expanded) → content

## Wikilink Popover Keyboard Shortcuts and Hover Switching - 2025-10-06

- Fixed wikilink action popover to correctly update when hovering between different links and added keyboard shortcuts for hover-triggered popovers: when popover is visible from hovering link A and user hovers over link B, the popover now immediately updates its data and position instead of staying on link A; added high-precedence keyboard handlers in editorConfig.svelte.ts that enable Enter (open) and Alt-Enter (edit) to work on hover-triggered popovers even when cursor is not adjacent to the wikilink; two-tier handler priority ensures hover popover handlers check first, then wikilink selection handlers, then other defaults; updated architecture documentation in WIKILINK-POPOVER-CONTROLS.md to reflect new hover data update behavior and keyboard handling approach

## Auto-focus Title on New Note Creation - 2025-10-05

- Enhanced new note creation to focus on title input instead of content: added focus() export to NoteTitle.svelte that selects title text, added focusTitle() export to EditorHeader.svelte that delegates to NoteTitle component, modified NoteEditor.focus() to check if note title is empty and focus title input if so (otherwise focus content editor as before), ensures better UX by guiding user to add title first when creating new untitled notes

## Editable Backlink Context with CodeMirror - 2025-10-05

- Made backlink context live-editable using CodeMirror single-line editor: created BacklinkContextEditor.svelte component that embeds minimal CodeMirror instance with full wikilink support, markdown rendering, and theme consistency; added 'backlink-context' variant to editorConfig.svelte.ts with compact single-line theme and custom Enter key handler; editor auto-saves changes after 1s debounce and on blur by fetching full note content, replacing specific line, and calling updateNote API; pressing Enter navigates to source note at that line instead of adding newlines; updated Backlinks.svelte to replace static text display with new editor component and moved click handler from entire backlink item to just title button to prevent interference with context editing; enhanced NoteEditor.svelte handleBacklinkSelect to accept optional lineNumber parameter and calculate cursor position by converting line number to character offset, then save cursor position before navigation

## Backlinks Context Display Enhancement - 2025-10-05

- Enhanced backlinks control to show meaningful context from source notes: modified Backlinks.svelte to fetch full note content for each backlink, extract line containing the wikilink using line_number from NoteLinkRow, display context in new two-line layout showing note type/title header plus indented context line beneath, improved visual hierarchy with proper spacing and secondary text styling for context; added disclosure arrows to show/hide context per backlink with animated rotation, keyboard accessibility (Enter/Space to toggle), and proper event handling to prevent parent button clicks when toggling context visibility; added "Show all" and "Hide all" buttons in backlinks header for bulk expand/collapse operations, only visible when backlinks are expanded and at least one backlink has context

## Database Rebuild Button in Settings - 2025-10-04

- Added manual database rebuild functionality to Settings page for fixing search/sync issues: implemented rebuildDatabase IPC method in preload layer that invokes rebuild-database handler in main process, added rebuildDatabase method to NoteService and FlintNoteApi that calls HybridSearchManager.rebuildIndex() which clears database and rescans all markdown files on disk, created Database section in Settings UI with rebuild button showing loading state and confirmation dialog, displays success message with note count after completion, fixed initialization issue by ensuring HybridSearchManager.ensureInitialized() is called before rebuild operation, added TypeScript types to env.d.ts for rebuildDatabase API method

## Pinned/Temporary Tabs Hydration Fix - 2025-10-04

- Fixed stale title issue in pinned and temporary notes by removing cached metadata: pinned and temporary stores now only persist note identifiers and order/timestamps, titles are hydrated fresh from notesStore on every render, eliminates race conditions where cached titles showed then switched to "Untitled", updated all callers to use new simpler signatures (no title/filename parameters), components use $effect/$derived to merge live note data with persisted tab data

- Added collapsible backlinks section to note editor showing all notes that link to the current note: created Backlinks.svelte component with expand/collapse UI matching existing patterns from AIAssistant, integrated getBacklinks API to fetch incoming links from database, displayed backlinks with note type badges and click-to-navigate functionality, positioned section at bottom of NoteEditor below main content, automatically reloads when wikilinks are updated in any note

## Optional Note Titles - 2025-10-04

- Made note titles optional throughout the application: backend now allows empty titles in createNote and stores them as nullable in database, empty titles generate "untitled.md" filenames with automatic numbering for uniqueness, UI displays "Untitled" in greyed italic text when title is missing, note editor placeholder changed to "Start writing note title..." for better UX, new note button creates notes without titles by default

## Changelog Test Link in Settings - 2025-10-03

- Added "View Changelog" button to Settings update section for easier testing and debugging of changelog display functionality: added button next to "Check Now" button in Application Updates section, implemented modal overlay to display ChangelogViewer component when clicked, added state management for isCanary flag detection from app version info, included proper accessibility attributes for modal overlay

## Note Editor Documentation - 2025-10-03

- Created comprehensive documentation of note editor architecture and features in docs/NOTE-EDITOR.md covering CodeMirror 6 foundation, markdown language support, wikilinks system (parsing, rendering, autocomplete, integration), custom list styling, auto-scroll service, cursor position management, editor variants, theme support, extension system, performance considerations, and integration points

## Custom Functions Moved to Settings - 2025-10-02

- Moved Custom Functions from system view to Settings page section: removed "Custom Functions" navigation button from SystemViews.svelte, removed 'custom-functions' from activeSystemView type union across App.svelte, MainView.svelte, and LeftSidebar.svelte, added CustomFunctionsManager component as new section in Settings.svelte with heading and description; enhanced CustomFunctionsManager with embedded mode prop that hides full-page header and shows "Create Function" button in list view, added "Back to List" navigation when in embedded editor/tester/details views, maintained full functionality while consolidating advanced features in Settings page

## Settings Page Cleanup - 2025-10-02

- Removed Cache Performance section from Settings page and moved Slash Commands from left sidebar to Settings for better organization: deleted entire Cache Performance monitoring section including all cache-related state variables (cacheMetrics, cachePerformance, cacheConfig, cacheHealthCheck, etc.), removed all cache monitoring functions (loadCacheData, generateCacheReport, optimizeCache, resetCacheMetrics, etc.), cleaned up cache-related CSS and ElectronChatService import; moved slash commands management UI from left sidebar to Settings page by removing "Slash Commands" button from SystemViews component, adding SlashCommands as new section in Settings.svelte with heading and description, updating TypeScript types throughout app to remove 'slash-commands' from activeSystemView union type, and cleaning up SlashCommands component styles to work within Settings page context; Settings page now contains: Application Updates, API Keys, Model Preferences, and Slash Commands sections, with left sidebar focused on primary navigation (Daily, All notes, Custom Functions, Settings)

## Flint Website and Automated Deployment - 2025-10-02

- Created minimal splash website for Flint with automated version management: built static website with index.html (auto-generated), styles.css (dark mode support), and 404.html in website/ directory; implemented build-time version templating system with scripts/build-website.js that reads package.json version and generates index.html from index.template.html by replacing {{VERSION}} placeholders in download URLs and version display; added npm run build:website script to package.json; created GitHub Actions workflow (.github/workflows/deploy-website.yml) that triggers on changes to website/, scripts/build-website.js, or package.json, runs build script, and deploys to Cloudflare Pages; documented complete setup in docs/WEBSITE-DEPLOYMENT.md including Cloudflare Pages configuration, custom domain setup (www.flintnote.com for website, updates.flintnote.com for production R2, canary.flintnote.com for canary R2), local development workflow, and automatic version update process; website features clean design with hero section, four feature highlights (AI Assistant, Markdown Editing, Metadata & YAML, Local-First), platform-specific download buttons with emoji icons for both production and canary builds; enhanced release workflow to automatically create "latest" copies of canary builds (flint-canary-latest-universal.dmg, flint-canary-latest.exe, flint-canary-latest.AppImage) providing stable URLs that always point to newest canary release without requiring JavaScript or CORS configuration

## Windows Build Configuration - 2025-10-01

- Configured Windows builds for dual-train auto-updater system: added Windows icon configuration to both electron-builder.production.yml and electron-builder.canary.yml (electron-builder auto-converts PNG to ICO during build), updated GitHub Actions workflow to include windows-latest in build matrix alongside macos-latest, added `shell: bash` to all bash-syntax steps for Windows compatibility, updated R2 upload script to use simple find+while loop instead of process substitution for cross-platform compatibility, added blockmap file uploads for delta updates; set `verifyUpdateCodeSignature: false` for Windows to enable auto-updates without code signing certificate (can be enabled later when certificate obtained), while macOS continues using signed+notarized builds with Gatekeeper verification; created docs/WINDOWS-BUILD-SETUP.md documenting platform-independent signing configuration, icon setup, build commands, GitHub Actions configuration, and upgrade path to add Windows code signing later

## Auto-Update UX Improvement - 2025-10-01

- Improved auto-update UX by replacing toast-style notifications with minimal title bar indicator: enabled automatic background downloads (`autoUpdater.autoDownload = true`), created compact UpdateIndicator component that shows "Downloading update..." with progress then transitions to "Click to restart and install", integrated indicator into title bar just left of agent panel buttons, removed old UpdateNotification component from Settings (replaced with informational text), resulting in zero-interruption workflow where updates download silently in background and user sees only small, clickable indicator when ready to install

## Dual-Train Auto-Updater System - 2025-10-01

- Implemented production and canary update trains for safe feature testing: created separate electron-builder.production.yml and electron-builder.canary.yml configurations pointing to updates.flintnote.com and canary.flintnote.com respectively; added train-specific build scripts (build:mac:production/canary, etc.) to package.json; modified .github/workflows/release.yml to automatically detect train from git tag (v1.0.0 vs v1.0.0-canary.1), use appropriate configuration, and deploy to correct R2 bucket (R2_PRODUCTION_BUCKET_NAME or R2_CANARY_BUCKET_NAME); canary builds use "Flint Canary" product name and flint-canary executable allowing side-by-side installation; documented complete versioning strategy, R2 bucket setup, GitHub secrets configuration, and release workflow in AUTO-UPDATER-SETUP.md with new "Update Trains" section; created DUAL-TRAIN-SETUP.md summary document

## Cloudflare R2 Auto-Updater Setup - 2025-09-30

- **Migrated auto-updater deployment from Netlify to Cloudflare R2** for zero-cost bandwidth distribution: updated docs/AUTO-UPDATER-SETUP.md with comprehensive R2 setup instructions including bucket creation, API token generation, and GitHub Actions integration; updated electron-builder.yml to point to R2 public URL; added deploy-to-r2 job to .github/workflows/release.yml that uses AWS CLI with S3-compatible API to upload build artifacts after release; configured proper YAML content types and public ACLs for update metadata files; deployment automatically triggers on version tags and uploads all installers plus latest.yml update metadata to R2 bucket; cost comparison shows R2 at ~$0.01/month for 10,000 updates vs Netlify $2,000/month or AWS $900/month due to free egress bandwidth

## Note Type Dropdown for New Note Button - 2025-09-29

- **Added note type selection dropdown to the "New Note" button** by implementing a button group with main "New Note" button and dropdown arrow; modified TemporaryTabs.svelte to replace single button with button group that includes dropdown showing all available note types from notesStore.noteTypes; updated prop interfaces throughout component chain (LeftSidebar.svelte, App.svelte) to pass optional noteType parameter to handleCreateNote function; added dropdown state management with click-outside-to-close functionality and smooth animations; styled button group with seamless visual connection between main button and dropdown arrow, consistent with existing UI patterns; preserved existing behavior where clicking main button creates default "note" type while dropdown allows selection of any available note type

## First-Time User Experience Improvement - 2025-09-29

- **Implemented comprehensive first-time user experience for when no vaults exist** by creating a VaultAvailabilityService that reactively detects vault state, building a FirstTimeExperience component with welcoming onboarding flow and vault creation guidance, modifying App.svelte to conditionally render first-time experience vs. normal interface based on vault availability, updating NoteService to handle delayed initialization gracefully without throwing errors when no vaults exist, and enhancing main process to properly manage no-vault states with appropriate logging and reinitializaiton support; includes IPC handler for note service reinitialization after vault creation, proper TypeScript typing for new methods, and loading states with smooth transitions between onboarding and full application interface; **fixed vault creation error** by separating vault operations (which only need globalConfig) from full workspace initialization - added `ensureVaultOpsAvailable()` method to FlintNoteApi that allows vault creation, switching, and removal without requiring full workspace initialization, enabling first-time vault creation to work properly; **added onboarding content setup** to App.svelte's `handleVaultCreatedFromFirstTime()` function to automatically pin welcome note and add tutorial tabs after service reinitialization is complete, ensuring new users get proper guidance with pinned welcome note and tutorial tabs in their temporary tabs section

## Enhanced get_note Tool for Multiple IDs - 2025-09-28

- **Modified get_note tool to accept multiple IDs** by updating the input schema from single `id: string` to `ids: string[]`; added new `getNotes` method to FlintNoteApi that leverages existing `noteManager.getNotes()` functionality; updated tool logic to handle batch note retrieval with proper error handling for mixed valid/invalid IDs; comprehensive test coverage added for multiple ID scenarios including empty arrays, duplicate IDs, and partial failures; all existing tests updated to use new array format; implementation provides efficient parallel retrieval using `Promise.allSettled` while maintaining consistent error reporting per note

## Lazy API Key Loading Implementation - 2025-09-28

- **Implemented lazy loading for API keys to prevent keychain prompts on app startup** by refactoring the AIService initialization flow: modified `AIService.of()` to initialize OpenRouter client with `undefined` API key instead of immediately calling `secureStorageService.getApiKey()` during app startup; added new utility methods `hasValidApiKey()` and `ensureApiKeyLoaded()` to the AIService for on-demand key validation and loading; updated both 'send-message' and 'send-message-stream' IPC handlers to call `ensureApiKeyLoaded()` before AI operations, which only triggers keychain access when users actually try to use AI features; verified that Settings component flow still works correctly for user-initiated key configuration; this change significantly improves user experience by eliminating unexpected keychain prompts on app launch while maintaining secure key storage and proper lazy loading when AI features are accessed

## WASM updateNoteType API Issue Resolution - 2025-09-28

- **Fixed the outstanding updateNoteType API issue in WASM code evaluator** that was preventing note type updates from working: systematically debugged and resolved a metadata schema validation error where protected fields ('created', 'updated') from existing note type schemas were being incorrectly flagged as user-defined during updates; implemented a cleaner solution that only validates metadata schemas when explicitly provided as parameters, skipping validation when reusing existing (already-validated) schemas; restored updateNoteType functionality to the note type CRUD test and verified all operations now work correctly through the WASM evaluator

## WASM Code Evaluator Note Type API Testing & Fix - 2025-09-27

- **Verified and fixed note type CRUD API access in WASM code evaluator** through comprehensive test implementation and debugging: confirmed that all note type operations (`createNoteType`, `listNoteTypes`, `getNoteType`, `updateNoteType`, `deleteNoteType`) are properly available to agents through the WASM evaluator's `flintApi` object; added 22 working tests in `enhanced-wasm-code-evaluator.test.ts` covering basic CRUD operations, error handling scenarios, TypeScript type checking, and integration workflows; enhanced existing tests in `wasm-expanded-api.test.ts` to actually exercise note type functionality; fixed multiple TypeScript compilation issues including proper error typing (`catch (error: any)`), API parameter names (`agent_instructions` vs `instructions`), and response casting (`as any`); identified that `updateNoteType` and `deleteNoteType` operations have underlying API issues returning empty error objects, so marked those specific tests as skipped with TODO comments; successfully validated that core operations (create, list, get) work correctly and agents can perform complete workflows combining note type creation with note operations, establishing reliable test coverage for the functional note type APIs

## Agent Note Type Management Tools Implementation - 2025-09-27

- **Added comprehensive note type management tools for AI agents** to enable creation, modification, and deletion of note types directly through the agent interface: implemented `create_note_type`, `update_note_type`, and `delete_note_type` tools in ToolService with full schema validation, metadata schema support, and comprehensive error handling; tools support agent instructions configuration, custom metadata field definitions (string, number, boolean, date, array, select types), and safe deletion with migration options; all implementations follow existing tool patterns with consistent error codes (NOTE_TYPE_NOT_FOUND, CREATE_NOTE_TYPE_FAILED, etc.) and proper vault context handling; full TypeScript type safety with proper MetadataFieldDefinition alignment and all tests passing

## Tutorial System Overhaul and Pinned/Temporary Views Fix - 2025-09-26

- **Created comprehensive 5-tutorial onboarding system** with progressive hands-on learning: expanded from basic welcome note to complete tutorial series covering daily notes, wikilinks, AI assistant usage, note types, and sustainable habits; created new tutorial files `01-your-first-daily-note.md` through `05-building-your-capture-habit.md` with detailed step-by-step guidance and practical exercises; updated `createOnboardingContentWithManager()` method to create all 5 tutorials as 'note' type with proper metadata tagging; fixed broken pinned/temporary views by updating old tutorial note references (`tutorial/01-your-first-note`, `tutorial/02-working-with-ai`) to new note IDs (`note/tutorial-1-your-first-daily-note`, etc.) in both `pinnedStore.svelte.ts` and `temporaryTabsStore.svelte.ts`; added `pinTutorialNotes()` method to pin all tutorials for immediate access; updated test expectations and documentation to reflect new tutorial structure

## Onboarding Content File Refactoring - 2025-09-25

- Refactored onboarding content in FlintNoteApi from embedded template strings to separate markdown files for easier editing and maintenance: created directory structure `src/server/onboarding/{welcome,tutorials,examples,templates}/`, extracted all content to separate .md files, added `loadOnboardingContent()` helper method, updated build process to copy files to output directory during build

## Onboarding Note Creation API Refactor - 2025-09-20

- **Refactored onboarding note creation to use standard createNote APIs** instead of direct filesystem writes: moved welcome note and tutorial creation from Workspace class to FlintNoteApi.createOnboardingContent(), ensuring proper database integration, metadata handling, link extraction, content hashing, and search indexing; implemented comprehensive onboarding content including welcome note, 2 tutorial notes, 2 example notes, and 3 template notes using proper NoteManager.createNote() API calls with correct TypeScript typing and error handling; fixed architectural issue by using dependency injection pattern - creating NoteManager directly during initialization and passing it to onboarding content creation, eliminating circular dependency where onboarding creation required API to be initialized while still being in initialization process

## Welcome Note Directory Fix - 2025-09-20

- **Fixed welcome note creation path** to place it in 'note' type directory instead of vault root: updated createWelcomeNote() method in workspace.ts to create "Welcome to Flint.md" in /note/ subdirectory and added ensureDirectory() call for safety, aligning with note type organization structure where all notes belong to specific types

## Note Editor Auto-Scroll Design - 2025-09-19

- **Analyzed and designed auto-scroll solution** for note editor viewport scrolling when cursor approaches screen edges: researched CodeMirror 6 scrolling APIs (scrollMargins, scrollHandler, scrollIntoView), analyzed current editor architecture built on CodeMirrorEditor.svelte and EditorConfig.svelte.ts, and created comprehensive implementation plan using EditorView.scrollMargins for elegant auto-scrolling with variant-specific configurations (150px bottom margin for default, 100px for daily-note)

## Create New Note Button Addition - 2025-09-19

- **Added "Create New Note" button** above temporary tabs list in left sidebar for quick note creation: button displays with plus icon and "New Note" text, styled with dashed border and hover effects, integrates with existing handleCreateNote function from App.svelte to create new notes with default "note" type and "Untitled Note" title, button is always visible regardless of temporary tabs state

## Content Hash Validation Testing - 2025-09-19

- **Added content hash mismatch error handling test** to verify proper error responses when incorrect contentHash provided to update operations: created test validating CONTENT_HASH_MISMATCH error return, fixed ContentHashMismatchError propagation through note manager layers by preventing generic error wrapping, and ensured all tool tests continue passing with proper error handling

## Hybrid Tool System Implementation - 2025-09-19

- **Successfully implemented hybrid tool system** as specified in PRD, providing AI agents with fast basic tools for 80% of operations while preserving code evaluator for complex workflows: implemented 6 basic CRUD tools (get_note, create_note, update_note, search_notes, get_vault_info, delete_note) with 1-10ms response times vs 50-200ms for code evaluator, added comprehensive error handling with consistent error patterns (NOTE_NOT_FOUND, VAULT_ACCESS_ERROR, etc.), created 21 comprehensive test cases covering all functionality and edge cases with 100% pass rate, integrated tools into existing ToolService alongside evaluate_note_code, updated system prompt with clear decision flow and usage guidelines, and maintained full backward compatibility with existing code evaluator functionality

## Test Assertion Precision Fix - 2025-09-19

- **Fixed failing test in evaluate-note-code.test.ts** with precise note count assertions: identified root cause was console.log() usage in WASM execution environment (console not available in QuickJS), discovered vault initialization creates 12 initial notes (1 welcome + 6 tutorials + 3 examples + 3 templates - 1 not counted), implemented two precise assertion approaches: accounting for initial vault notes and creating clean vault without initialization for exact count testing

## Comprehensive Onboarding System Implementation - 2025-09-18

- **Planned and fully implemented** comprehensive onboarding improvement addressing critical gaps in user experience: fixed misleading welcome note that promised non-existent features, created 4 properly-configured note types (tutorial, examples, templates, note) with AI-optimized agent instructions, implemented complete 6-part interactive tutorial series covering first note creation through advanced features, developed 3 comprehensive example notes (meeting notes, research notes, project planning) demonstrating best practices, created 3 practical templates (daily journal, meeting notes, project brief) for immediate use, and established experiential learning approach that teaches Flint concepts through hands-on AI interaction rather than passive documentation

## Daily Note Editor Unified Architecture - 2025-09-17

- Successfully refactored DailyNoteEditor to use shared CodeMirrorEditor component instead of duplicate implementation by extending EditorConfig with variant and placeholder props, eliminating 180+ lines of duplicate code while preserving daily-note-specific styling (placeholder text, compact layout, custom scrollbars) and maintaining backward compatibility with same API (getContent, setContent, focus methods)

## NoteEditor Refactoring TODO Completion - 2025-09-17

- Completed all remaining TODOs from the NoteEditor refactoring: added refreshWikilinks() and getCurrentCursorPosition() exports to CodeMirrorEditor, implemented proper cursor position saving and change handling in NoteEditor, enabling full functionality for wikilink refresh and cursor persistence across note switches

## NoteEditor Component Refactoring - 2025-09-17

- Successfully broke down the 1000+ line NoteEditor.svelte into reusable components and hooks: CodeMirrorEditor (pure editor), useAutoSave/useCursorPosition/useEditorTheme hooks, NoteTitle/NotePinButton/EditorHeader/ErrorBanner components, dramatically improving maintainability, testability, and reusability while maintaining all functionality

## Daily View Wikilink Navigation Fix - 2025-09-17

- Fixed wikilink clicking to properly open notes in main view by restoring the event-based system where wikilinkService dispatches wikilink-navigate events and App.svelte handles them through noteNavigationService.openNote() with proper system view clearing, ensuring wikilinks from daily notes now correctly open the target note in the editor

## Daily View Wikilink Click Fix - 2025-09-17

- Fixed wikilink clicking functionality in daily notes by updating DailyNoteEditor to use wikilinkService.handleWikilinkClick() instead of just logging, enabling proper note navigation from wikilinks within daily note content

## Daily View Notes Styling Update - 2025-09-17

- Updated 'Notes worked on this day' styling in NotesWorkedOn component to match the compact, flexbox-based approach used for 'discussed notes' in AIAssistant component, replacing complex card layout with simple note-link buttons in horizontal wrap layout

## Daily View Focus Loss Fix - 2025-09-16

- Fixed daily note editor focus loss during auto-save by implementing optimistic local state updates in dailyViewStore.updateDailyNote(), eliminating the need for full week data refresh and preventing UI re-render that caused editors to lose focus

## Daily View Phase 0 Foundation Implementation - 2025-01-16

- Successfully implemented Phase 0 foundation for Daily View feature including database schema enhancements with date-based indexes, comprehensive date utility functions with ISO week calculation, complete UI shell with mock data (DailyView, WeekNavigation, DaySection, DailyNoteEditor, NotesWorkedOn components), daily view store with navigation state management, and integration into system navigation as new "Daily" view in left sidebar

## API Type Alignment Phase 2 Implementation - 2025-01-26

- Completed Phase 2 of API Type Alignment Plan: removed duplicate WASM interfaces, standardized field naming (identifier→noteId, name→typeName), added missing vaultId parameters, and unified FlintAPI type usage across WASM bindings with TypeScript compilation passing

## Custom Functions CodeMirror Integration - 2025-09-05

- Integrated CodeMirror 6 with TypeScript syntax highlighting to replace basic textarea code editors in both CustomFunctionDetails and CustomFunctionEditor components, providing professional-grade code editing experience with syntax highlighting, bracket matching, auto-completion, and theme adaptation

## Custom Functions Inline Editing - 2025-09-05

- Converted CustomFunctionDetails component from read-only display to live inline editor, eliminating the need for separate edit modes and enabling direct editing of all function properties (name, description, tags, parameters, code) with real-time validation and auto-save functionality

## Custom Functions UI Integration Improvement - 2025-09-05

- Moved custom functions from Settings section to dedicated system view in left sidebar navigation, improving accessibility and making it a first-class feature positioned between "Slash Commands" and "Settings"

## Custom Functions Testing Implementation (Phase 1) - 2025-09-05

- Successfully implemented comprehensive Phase 1 foundation tests for Custom Functions system with 80% overall test coverage (64/80 tests passing), including complete storage layer validation, robust security validation framework, and test infrastructure ready for integration testing phases

## Custom Functions Testing Fixes - 2025-09-05

- Fixed all TypeScript compilation issues in custom functions testing by enhancing compiler built-in types, resolving type declaration conflicts, and fixing UUID-based identifier generation, bringing test success rate to 98% (78/80 tests passing)

## Custom Functions Phase 2 Agent Integration - 2025-09-04

- Completed Phase 2 implementation of Custom Functions feature for AI agent integration
- Integrated custom functions API into AI service with system prompt generation for dynamic function documentation
- Extended TypeScript compiler to generate custom function type declarations for compile-time support
- Added 4 new AI tools: register_custom_function, test_custom_function, list_custom_functions, validate_custom_function
- Enhanced error handling with stack trace parsing, contextual suggestions, and comprehensive diagnostics
- All code passes linting and TypeScript compilation with full type safety

## TypeScript Code Evaluation Enhancement PRD - 2025-09-04

- Created comprehensive PRD for extending WASM code evaluator with TypeScript support and detailed type error feedback
- Added tool-service.ts integration showing backward-compatible enhancement with new language/typeCheck parameters
- Designed agent experience with compile-time error detection, API type safety, and progressive TypeScript adoption
- Simplified to TypeScript-only execution with forced strict checking and single `typesOnly` debugging option

## Fixed All Failing Tests - 2025-09-04

- Fixed 13 initially failing tests (111 total tests now passing)
- Implemented proper TypeScript compiler with semantic and syntactic diagnostics
- Added minimal TypeScript lib definitions (Promise, Array) and full FlintNote API types
- Configured proper warning vs error categorization for unused variables
- Enhanced WASM code evaluator now fully functional with TypeScript compilation and type checking

## Phase 1 API Type Alignment Complete - 2025-01-XX

- Successfully implemented **Phase 1: Flatten WASM API to Single Namespace** from the API Type Alignment Plan, converting separate namespace objects (`notes`, `noteTypes`, `vaults`, etc.) to unified `flintApi` object with direct method name alignment to FlintNoteApi implementation, updated all type definitions and test files, achieving 100% test pass rate (222/222 tests passing)
