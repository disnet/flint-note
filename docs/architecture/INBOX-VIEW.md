# Inbox View Design Document

## Executive Summary

The Inbox View is a new system view in Flint GUI that provides users with a centralized location to quickly capture new notes and process recently created notes. It implements a Getting Things Done (GTD)-style inbox pattern, allowing users to review and "process" new notes by marking them as handled, removing them from the inbox list. The view features a quick-capture text input for rapid note creation and displays all unprocessed notes from the last 7 days in reverse chronological order.

## Motivation

### User Problems Addressed

1. **Note Capture Friction**: Users need a fast, low-friction way to create new notes without navigating through the UI or selecting note types
2. **New Note Awareness**: Users may lose track of recently created notes that haven't been organized or reviewed
3. **Processing Workflow**: Users need a way to review and acknowledge new notes, moving them from "captured" to "processed" status
4. **Cognitive Closure**: The inbox provides a visual indicator of unprocessed items, encouraging users to review and organize their notes

### Design Philosophy

The Inbox View follows the GTD (Getting Things Done) methodology where:

- Capture should be effortless and fast
- Processing (reviewing and deciding on action) is a separate step from capture
- The inbox serves as a temporary holding area, not a permanent storage location
- Visual feedback (empty inbox) provides satisfaction and cognitive closure

## Architecture

### Database Layer

**New Table: `processed_notes`**

```sql
CREATE TABLE IF NOT EXISTS processed_notes (
  id INTEGER PRIMARY KEY,
  note_id TEXT NOT NULL UNIQUE,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
)
```

**Design Decisions:**

- **Separate processing state**: Processing status is stored separately from note metadata, allowing processing to be independent of note properties
- **Timestamp tracking**: `processed_at` timestamp allows for future analytics and potential "recently processed" views
- **Cascade delete**: When a note is deleted, its processing record is automatically removed
- **Unique constraint**: Prevents duplicate processing records for the same note

**Index:**

```sql
CREATE INDEX IF NOT EXISTS idx_processed_notes_note_id ON processed_notes(note_id)
```

This index enables efficient lookups when filtering unprocessed notes.

### Backend API Layer

**Location**: `src/server/api/flint-note-api.ts`

#### Method: `getRecentUnprocessedNotes(vaultId, daysBack?)`

**Purpose**: Retrieve notes that haven't been marked as processed

**Algorithm**:

```typescript
1. Calculate date threshold (current date - daysBack)
2. Query notes table with LEFT JOIN to processed_notes
3. Filter WHERE:
   - note.created >= threshold
   - processed_notes.note_id IS NULL (not in processed table)
4. ORDER BY note.created DESC
5. Map to NoteListItem format
```

**Parameters**:

- `vaultId: string` - Vault to query
- `daysBack: number = 7` - How many days back to look (default: 7)

**Returns**: `NoteListItem[]` - List of unprocessed notes

**Key Design Choice**: Uses LEFT JOIN rather than NOT EXISTS for better query performance with proper indexing.

#### Method: `markNoteAsProcessed(noteId, vaultId)`

**Purpose**: Mark a note as processed, removing it from inbox

**Algorithm**:

```typescript
1. Get database connection for vault
2. INSERT OR IGNORE into processed_notes (note_id, processed_at)
3. Return success status
```

**Parameters**:

- `noteId: string` - Note to mark as processed
- `vaultId: string` - Vault containing the note

**Returns**: `{ success: boolean }`

**Key Design Choice**: Uses INSERT OR IGNORE to handle idempotent calls gracefully (marking an already-processed note is a no-op).

### IPC Layer

**Main Process Handlers** (`src/main/index.ts`):

```typescript
ipcMain.handle('get-recent-unprocessed-notes', async (_, params) => {
  await noteService.initialize();
  return await noteService.getRecentUnprocessedNotes(params.vaultId, params.daysBack);
});

ipcMain.handle('mark-note-as-processed', async (_, params) => {
  await noteService.initialize();
  return await noteService.markNoteAsProcessed(params.noteId, params.vaultId);
});
```

**Preload Exposure** (`src/preload/index.ts`):

```typescript
getRecentUnprocessedNotes: (params: { vaultId: string; daysBack?: number }) =>
  electronAPI.ipcRenderer.invoke('get-recent-unprocessed-notes', params),

markNoteAsProcessed: (params: { noteId: string; vaultId: string }) =>
  electronAPI.ipcRenderer.invoke('mark-note-as-processed', params)
```

**TypeScript Definitions** (`src/renderer/src/env.d.ts`):

```typescript
getRecentUnprocessedNotes: (params: { vaultId: string; daysBack?: number }) =>
  Promise<Array<{ id: string; title: string; type: string; created: string }>>;

markNoteAsProcessed: (params: { noteId: string; vaultId: string }) =>
  Promise<{ success: boolean }>;
```

### Frontend State Management

**Inbox Store** (`src/renderer/src/stores/inboxStore.svelte.ts`):

```typescript
interface InboxNote {
  id: string;
  title: string;
  type: string;
  created: string;
}

class InboxStore {
  private state = $state<{
    notes: InboxNote[];
    isLoading: boolean;
    error: string | null;
  }>();

  async loadInboxNotes(vaultId: string, daysBack?: number): Promise<void>;
  async markAsProcessed(noteId: string, vaultId: string): Promise<boolean>;
  async refresh(vaultId: string): Promise<void>;
  clear(): void;
}
```

**Key Design Decisions**:

1. **Svelte 5 Runes**: Uses modern `$state` for reactivity
2. **Local State Update**: When marking as processed, immediately removes note from local state for instant UI feedback
3. **Error Handling**: Captures and stores error messages for user display
4. **Vault Awareness**: All operations require vaultId to support multi-vault workflows

### UI Components

#### InboxView Component

**Location**: `src/renderer/src/components/InboxView.svelte`

**Layout Structure**:

```
┌─────────────────────────────────┐
│ 📥 Inbox                   [⋯]  │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ enter title to create...    │ │ ← Quick capture input
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ ┌───────────────────────────┬─┐ │
│ │ Note Title                │✓│ │ ← Note item
│ │ Jan 5, 2025 • note        │ │ │
│ └───────────────────────────┴─┘ │
│ ┌───────────────────────────┬─┐ │
│ │ Another Note              │✓│ │
│ │ Jan 4, 2025 • daily       │ │ │
│ └───────────────────────────┴─┘ │
└─────────────────────────────────┘
```

**Component Props**:

```typescript
interface Props {
  onNoteSelect?: (note: NoteMetadata) => void;
}
```

**Key Features**:

1. **Quick Capture Input**:
   - Text input with placeholder: "enter title to create new note..."
   - Enter key creates note and opens it in editor
   - Automatically refreshes inbox after creation
   - Disabled during note creation to prevent duplicate submissions

2. **Note List**:
   - Each note displays: title, creation date, note type
   - Clicking note title opens note in editor
   - Checkmark button marks note as processed
   - Notes sorted by creation date (newest first)
   - Empty state with helpful messaging

3. **Loading States**:
   - Loading indicator during data fetch
   - Disabled input during note creation
   - Graceful error display

**Component Lifecycle**:

```typescript
$effect(() => {
  // Load inbox data when component mounts
  loadInboxData();
});

async function loadInboxData() {
  1. Get current vault from chat service
  2. Load unprocessed notes from inbox store
  3. Handle errors gracefully
}
```

**User Interactions**:

1. **Create Note**:

   ```
   User types title → Presses Enter → Note created →
   Notes store refreshed → Inbox refreshed → Note opened in editor → Input cleared
   ```

2. **Process Note**:

   ```
   User clicks ✓ → Mark as processed API call →
   Success → Note removed from local state → UI updates instantly
   ```

3. **Open Note**:
   ```
   User clicks note title → Find note in notes store →
   Call onNoteSelect callback → Note opens in main view
   ```

#### SystemViews Integration

**Updated Type Definitions**:

```typescript
type SystemView = 'inbox' | 'daily' | 'notes' | 'settings' | null;
```

**Inbox Button** (added to SystemViews.svelte):

```svelte
<button class="nav-item" class:active={activeSystemView === 'inbox'}>
  <svg><!-- Inbox icon --></svg>
  Inbox
</button>
```

**Icon Design**: Uses an inbox/tray icon (two paths forming a tray with a notch) to visually represent the inbox concept.

**Positioning**: Placed first in the system views list, before Daily, All Notes, and Settings, emphasizing its role as the primary entry point for new notes.

#### MainView Integration

**Conditional Rendering**:

```svelte
{#if activeSystemView === 'inbox'}
  <div class="system-view-container">
    <div class="system-view-content">
      <InboxView {onNoteSelect} />
    </div>
  </div>
{:else if activeSystemView === 'daily'}
  <!-- ... -->
{/if}
```

## User Workflows

### Workflow 1: Quick Note Capture

**User Story**: As a user, I want to quickly capture a thought without interrupting my workflow.

**Steps**:

1. User clicks "Inbox" in left sidebar (or it's already active)
2. User types note title in quick-capture input
3. User presses Enter
4. Note is created and automatically opened in editor
5. User can immediately start writing content
6. Note appears in inbox list for later processing

**Design Decisions**:

- Enter key submission (no button needed) reduces friction
- Auto-open after creation maintains user context
- Default note type ('note') chosen for simplicity
- Input cleared after creation, ready for next capture

### Workflow 2: Processing Inbox

**User Story**: As a user, I want to review my recently created notes and mark them as processed.

**Steps**:

1. User opens Inbox view
2. User sees list of unprocessed notes (last 7 days)
3. User clicks note title to review content
4. After reviewing/organizing, user clicks ✓ checkmark
5. Note is removed from inbox list
6. User continues to next note

**Design Decisions**:

- 7-day window balances recency with practicality
- Checkmark icon (✓) universally understood for completion
- Immediate UI update provides instant feedback
- No undo mechanism (keeps implementation simple; note isn't deleted, just hidden from inbox)

### Workflow 3: Inbox Maintenance

**User Story**: As a user, I want my inbox to automatically clean itself up over time.

**Steps**:

1. Notes older than 7 days automatically stop appearing in inbox
2. Deleted notes are automatically removed from processed_notes table (CASCADE)
3. User doesn't need to manually manage the inbox

**Design Decisions**:

- Time-based automatic removal (7 days) prevents inbox bloat
- Database CASCADE ensures no orphaned processing records
- No manual "clear all" needed (reduces UI complexity)

## Design Decisions & Trade-offs

### 1. Separate Processing State vs. Note Metadata

**Decision**: Store processing state in separate `processed_notes` table rather than as note metadata.

**Rationale**:

- **Separation of concerns**: Processing is a UI/workflow concern, not intrinsic to the note
- **Performance**: Indexed table enables fast LEFT JOIN queries
- **Simplicity**: No frontmatter parsing or metadata updates needed
- **Flexibility**: Easy to add processing-related features later (undo, analytics)

**Trade-off**: Adds another table to the database schema.

### 2. 7-Day Window

**Decision**: Only show notes from last 7 days in inbox.

**Rationale**:

- Balances recency with practical review timeframe
- Prevents inbox from becoming overwhelming
- Older notes likely already organized/reviewed
- Configurable parameter allows future customization

**Trade-off**: Notes older than 7 days don't appear even if unprocessed. Users must use "All Notes" view to find them.

### 3. Quick-Capture Creates 'note' Type

**Decision**: Quick-capture input always creates notes of type 'note'.

**Rationale**:

- Simplifies UI (no type selector in quick-capture)
- 'note' is the most generic, versatile type
- Users can change type later if needed
- Aligns with "capture first, organize later" philosophy

**Trade-off**: Users creating specialized note types must use the full "New Note" flow.

### 4. No Undo for Processing

**Decision**: Marking a note as processed is immediate and irreversible (from inbox UI).

**Rationale**:

- Simplifies implementation
- Processing isn't destructive (note still exists)
- Can be "un-processed" by deleting record from database if needed
- Encourages intentional processing

**Trade-off**: Accidental clicks require manual database modification to reverse.

### 5. Instant Local Update on Processing

**Decision**: Remove note from UI immediately after marking as processed, before confirming with backend.

**Rationale**:

- Provides instant user feedback
- Reduces perceived latency
- Processing API is idempotent (safe to retry)
- Failure is rare and can be handled by error message + manual refresh

**Trade-off**: In rare failure cases, note disappears from UI but remains unprocessed in database. User must refresh to see it again.

### 6. No "Unprocess" Button in UI

**Decision**: No UI mechanism to move a processed note back to inbox.

**Rationale**:

- Keeps UI simple and focused
- Processing should be intentional, not frequently reversed
- Database design supports un-processing (delete from processed_notes)
- Edge case not worth UI complexity

**Trade-off**: Users who accidentally process a note need developer tools or database access to un-process.

## Integration Points

### Integration with Existing Note Navigation

The Inbox View integrates with Flint's existing note navigation system:

```typescript
// When note is clicked in inbox
function handleNoteClick(noteId: string): void {
  const note = notesStore.notes.find((n) => n.id === noteId);
  if (note && onNoteSelect) {
    onNoteSelect(note); // Triggers standard note opening flow
  }
}
```

**Effects**:

- Note opens in main editor view
- System view is cleared (inbox closes)
- Navigation history updated
- Temporary tabs updated (if applicable)

### Integration with Note Creation

Quick-capture note creation uses the same API as other note creation methods:

```typescript
const noteInfo = await chatService.createNote({
  type: 'note',
  identifier: newNoteTitle.trim(),
  content: '',
  vaultId: currentVaultId
});
```

**Effects**:

- Note created in database
- Note appears in "All Notes" view
- Note appears in inbox (as unprocessed)
- Notes store automatically refreshed

### Integration with Vault Switching

The Inbox View respects vault boundaries:

```typescript
// Load inbox notes when component mounts
$effect(() => {
  loadInboxData(); // Gets current vault automatically
});
```

**Behavior**:

- Inbox shows only notes from current vault
- Switching vaults automatically refreshes inbox
- Processing state is vault-specific (via foreign key to notes table)

## Visual Design

### Color & Typography

**Following Flint Design System** (`src/renderer/src/assets/base.css`):

- Background: `var(--bg-primary)` and `var(--bg-secondary)`
- Text: `var(--text-primary)` and `var(--text-secondary)`
- Borders: `var(--border-light)` and `var(--border-medium)`
- Accent: `var(--accent-primary)` for active states and hover
- Error: `var(--error-bg)`, `var(--error-text)`, `var(--error-border)`

### Layout

**Spacing**:

- Padding: 0.5rem (component), 0.75rem (inputs), 0.5rem (list items)
- Gaps: 0.5rem (notes list)
- Margins: 0.75rem (header bottom), 1rem (quick-capture bottom)

**Borders**:

- Header: 1px solid `var(--border-light)` bottom border
- Input: 1px solid `var(--border-medium)`, focus → `var(--accent-primary)`
- Note items: 1px solid `var(--border-light)`, hover → `var(--accent-primary)`

**Border Radius**: 0.5rem for all rounded elements (input, note items, error messages)

### Interactions

**Quick-Capture Input**:

- Default: Gray border, secondary background
- Focus: Accent border, primary background, no outline
- Disabled: 50% opacity

**Note Items**:

- Default: Secondary background, light border
- Hover: Accent border, subtle shadow (`var(--shadow-light)`)
- Note content hover: Tertiary background

**Process Button**:

- Default: Transparent background, secondary text color
- Hover: Light accent background, accent text color
- Size: 1.25rem font, 3rem min-width

**Empty State**:

- Centered flex layout
- Secondary text color
- Hint text: 0.875rem font, 70% opacity

### Responsive Behavior

The Inbox View follows the same responsive patterns as other system views:

**Desktop (>1400px)**:

- Full layout with all features visible
- Optimal spacing and sizing

**Mobile (<768px)**:

- Maintains full functionality
- Touch-optimized button sizes (checkmark button remains easily clickable)
- Vertical scrolling for long note lists

## Performance Considerations

### Database Query Optimization

**Query**: `SELECT n.* FROM notes n LEFT JOIN processed_notes pn ...`

**Optimizations**:

1. Index on `processed_notes.note_id` enables fast LEFT JOIN
2. Index on `notes.created` enables fast date filtering and sorting
3. LEFT JOIN + IS NULL pattern more efficient than NOT EXISTS for this use case
4. LIMIT could be added for very large inboxes (currently unbounded)

**Estimated Performance**: Sub-millisecond query time for typical inbox sizes (<100 notes).

### Frontend Rendering

**Optimizations**:

1. Svelte's reactive system ensures minimal re-renders
2. Key-based iteration (`{#each notes as note (note.id)}`) enables efficient list updates
3. Local state update on processing provides instant UI feedback without backend round-trip
4. Component lazy-loads (only fetches data when inbox is active)

**Estimated Load Time**: <100ms for typical inbox sizes.

### Memory Footprint

- Inbox store: ~1KB per 10 notes (minimal overhead)
- Component: ~2KB compiled JavaScript
- Database table: ~40 bytes per processed note record

**Impact**: Negligible memory impact even with thousands of processed notes.

## Testing Considerations

### Unit Tests (Future)

**Backend**:

- `getRecentUnprocessedNotes` returns correct notes
- `getRecentUnprocessedNotes` filters by date correctly
- `getRecentUnprocessedNotes` excludes processed notes
- `markNoteAsProcessed` inserts record correctly
- `markNoteAsProcessed` is idempotent (duplicate calls don't fail)

**Frontend**:

- Inbox store loads notes correctly
- Inbox store marks notes as processed and updates local state
- InboxView creates notes via quick-capture
- InboxView displays notes in correct order
- InboxView handles empty state correctly

### Integration Tests (Future)

- End-to-end: Create note → appears in inbox → mark as processed → disappears from inbox
- End-to-end: Create note → wait 7 days → doesn't appear in inbox
- End-to-end: Quick-capture → note created → note opened in editor
- Vault switching: Inbox updates when switching vaults

### Manual Testing Checklist

- [ ] Quick-capture creates note with correct title
- [ ] Created note appears in inbox immediately
- [ ] Clicking note title opens note in editor
- [ ] Marking note as processed removes it from list
- [ ] Notes sorted by creation date (newest first)
- [ ] Empty state displays when no notes
- [ ] Error state displays on API failure
- [ ] Loading indicator shows during data fetch
- [ ] Inbox button in sidebar highlights when active
- [ ] Switching to inbox view loads correct data
- [ ] Switching vaults updates inbox content

## Future Enhancements

### Potential Features

1. **Configurable Time Window**:
   - Allow users to customize the 7-day window (e.g., 3 days, 14 days, 30 days)
   - UI: Settings page option

2. **Batch Processing**:
   - "Process All" button to mark all visible notes as processed
   - Useful for users with many notes to clear

3. **Processing with Tags**:
   - Add tags while processing notes (e.g., "review-later", "important")
   - Combines capture review with lightweight organization

4. **Undo Processing**:
   - "Undo" button or notification after processing
   - Time-limited (e.g., 10 seconds to undo)

5. **Inbox Statistics**:
   - Badge showing unprocessed note count on inbox button
   - Trend graph of inbox processing over time

6. **Smart Filtering**:
   - Filter inbox by note type
   - Filter by specific date ranges
   - Search within inbox notes

7. **Keyboard Shortcuts**:
   - Hotkey to focus quick-capture input (e.g., Ctrl+Shift+I)
   - Arrow keys to navigate note list
   - Space or X to mark note as processed

8. **Note Preview**:
   - Hover tooltip showing note content preview
   - Inline expansion to show first few lines of content

9. **Processing Workflow Integration**:
   - Mark as processed + add to specific project/area
   - Mark as processed + schedule for review

10. **Recently Processed View**:
    - Companion view showing recently processed notes
    - Allows quick recovery from accidental processing

### Technical Improvements

1. **Pagination**:
   - For users with very large inboxes (>100 notes)
   - Infinite scroll or page-based navigation

2. **Background Refresh**:
   - Automatically refresh inbox every N minutes
   - Show notification when new notes appear

3. **Offline Support**:
   - Queue processing operations when offline
   - Sync when connection restored

4. **Analytics**:
   - Track inbox processing patterns
   - Suggest optimal review frequency based on user behavior

## Conclusion

The Inbox View successfully implements a GTD-style workflow for note capture and processing in Flint GUI. By separating the concerns of note creation from note organization, it reduces friction in the user's workflow while encouraging regular review and organization of new content. The implementation leverages Flint's existing architecture patterns and integrates seamlessly with other system views, providing a cohesive user experience.

Key achievements:

- **Low-friction capture**: Quick-capture input requires minimal interaction
- **Clear processing workflow**: Visual feedback and immediate results
- **Clean architecture**: Separation of processing state from note data
- **Performance**: Optimized queries and reactive UI updates
- **Extensibility**: Foundation for future enhancements

The design balances simplicity with functionality, providing essential inbox features while avoiding over-engineering for edge cases. Future enhancements can build on this foundation to add more sophisticated processing workflows as user needs evolve.
