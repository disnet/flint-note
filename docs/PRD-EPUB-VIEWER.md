# PRD: EPUB Viewer Integration

## Overview

Integrate an EPUB reader into Flint Note using the custom view system, allowing users to read ebooks alongside their notes. This creates a unique value proposition: a reading environment where notes and source material live together.

## Goals

1. **Seamless reading experience** - Read EPUBs without leaving Flint Note
2. **Note integration** - Take markdown notes alongside the book content
3. **Progress persistence** - Remember reading position across sessions
4. **Portable library** - EPUB files stored in vault, sync with vault

## Non-Goals (MVP)

- Highlighting/annotation within EPUB content
- Full-text search within books
- Multiple bookmarks per book
- Spaced repetition integration
- EPUB editing/creation
- DRM support

## User Stories

### Import & Setup

1. **As a user**, I want to import an EPUB file via drag-and-drop so I can quickly add books to my library
2. **As a user**, I want to import an EPUB via File menu so I have a discoverable import option
3. **As a user**, I want the EPUB file copied to my vault so my library is portable and backed up

### Reading

4. **As a user**, I want to navigate chapters via table of contents so I can jump to specific sections
5. **As a user**, I want my reading position saved automatically so I can pick up where I left off
6. **As a user**, I want to see my progress (% complete) so I know how much is remaining
7. **As a user**, I want the reader theme to match my app theme (light/dark) for visual consistency
8. **As a user**, I want to select and copy text from the EPUB so I can quote passages in my notes

### Note-Taking

9. **As a user**, I want to write markdown notes alongside the EPUB reader so I can capture thoughts while reading
10. **As a user**, I want my notes saved as part of the EPUB note so everything stays together
11. **As a user**, I want to use wikilinks in my notes so I can connect reading notes to other notes

## Technical Architecture

### Library Choice

**foliate-js** - Modern, actively maintained EPUB rendering library

- GitHub: <https://github.com/johnfactotum/foliate-js>
- Lightweight, clean API
- Good rendering quality
- Supports CFI (Canonical Fragment Identifiers) for position tracking

### Custom View Registration

```typescript
// src/renderer/src/lib/views/index.ts
ViewRegistry.registerView('epub', {
  component: EpubNoteView,
  modes: ['hybrid'],
  supportedTypes: ['epub'],
  priority: 1
});
```

### Component Structure

```
src/renderer/src/lib/views/
├── EpubNoteView.svelte      # Main view component (registered with ViewRegistry)
├── epub/
│   ├── EpubReader.svelte    # foliate-js wrapper component
│   ├── EpubToc.svelte       # Table of contents panel
│   ├── EpubProgress.svelte  # Progress indicator
│   └── epubService.ts       # EPUB loading and state management
```

### File Storage

EPUB files stored in vault:

```
vault/
├── attachments/
│   └── epubs/
│       ├── the-great-gatsby.epub
│       └── deep-work.epub
├── My Reading Notes.md
└── ...
```

### IPC Handlers (Main Process)

```typescript
// New handlers needed in src/main/index.ts

// Open file picker for EPUB import
ipcMain.handle('import-epub', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'EPUB', extensions: ['epub'] }],
    properties: ['openFile']
  });
  if (result.canceled) return null;

  // Copy to vault attachments/epubs/
  const sourcePath = result.filePaths[0];
  const filename = path.basename(sourcePath);
  const destPath = path.join(vaultPath, 'attachments', 'epubs', filename);
  await fs.copyFile(sourcePath, destPath);

  return { filename, path: destPath };
});

// Read EPUB file as ArrayBuffer for foliate-js
ipcMain.handle('read-epub-file', async (_event, relativePath: string) => {
  const fullPath = path.join(vaultPath, relativePath);
  const buffer = await fs.readFile(fullPath);
  return buffer;
});
```

## Data Model

### Note Type: `epub`

```typescript
interface EpubNote {
  id: string;
  type: 'epub';
  title: string; // Book title (from EPUB metadata or user override)
  filename: string; // e.g., "the-great-gatsby.md"
  content: string; // User's markdown notes about the book
  metadata: {
    epubPath: string; // Relative path: "attachments/epubs/book.epub"
    epubTitle: string; // Title from EPUB metadata
    epubAuthor: string; // Author from EPUB metadata
    epubCover?: string; // Base64 cover image or path
    currentCfi: string; // CFI position for reading progress
    progress: number; // 0-100 percentage
    totalLocations: number; // Total locations in book (for progress calc)
    lastRead: string; // ISO timestamp
  };
}
```

### Frontmatter Example

```yaml
---
type: epub
epubPath: attachments/epubs/deep-work.epub
epubTitle: 'Deep Work'
epubAuthor: 'Cal Newport'
currentCfi: 'epubcfi(/6/4[chapter1]!/4/2/1:0)'
progress: 34
lastRead: 2025-01-15T10:30:00Z
---
# My Notes on Deep Work

## Chapter 1 Thoughts

The distinction between deep and shallow work resonates with [[productivity]] ideas...
```

## UI/UX Design

### Layout: Hybrid View

```
┌─────────────────────────────────────────────────────────────────┐
│  [← Back]  Deep Work - Cal Newport                    [TOC] [⚙] │
├───────────────────────────────────┬─────────────────────────────┤
│                                   │                             │
│                                   │  # My Notes                 │
│        EPUB READER                │                             │
│                                   │  ## Chapter 1               │
│   (foliate-js rendered content)   │                             │
│                                   │  Key insight about          │
│                                   │  [[deep work]] vs shallow   │
│                                   │                             │
│                                   │  - Point one                │
│                                   │  - Point two                │
│                                   │                             │
├───────────────────────────────────┴─────────────────────────────┤
│  ◀ Prev     Chapter 3 of 12     ━━━━━━━━○━━━━━━  34%     Next ▶ │
└─────────────────────────────────────────────────────────────────┘
```

### Components

1. **Header Bar**
   - Back navigation
   - Book title + author
   - TOC toggle button
   - Settings (font size, theme override)

2. **Reader Panel** (left, ~60% width)
   - foliate-js rendered content
   - Scrollable or paginated (user preference, future)
   - Text selectable

3. **Notes Panel** (right, ~40% width)
   - Standard CodeMirror markdown editor
   - Full wikilink support
   - Syncs with note content

4. **Footer Bar**
   - Previous/Next chapter navigation
   - Chapter indicator
   - Progress bar with percentage
   - Click progress bar to jump to location (future)

### TOC Overlay

```
┌─────────────────────────┐
│  Table of Contents      │
├─────────────────────────┤
│  ▸ Part I: The Idea     │
│    • Chapter 1          │  ← current (highlighted)
│    • Chapter 2          │
│  ▸ Part II: The Rules   │
│    • Chapter 3          │
│    • Chapter 4          │
│  ...                    │
└─────────────────────────┘
```

### Import Flow

1. User drags EPUB onto app window (or File → Import EPUB)
2. File copied to `vault/attachments/epubs/`
3. EPUB metadata extracted (title, author, cover)
4. New note created with `type: epub`
5. Note opens in EpubNoteView
6. User can rename note title if desired

### Empty State

When note has no content yet:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Notes Panel                             │
│                                                                 │
│              Start taking notes about this book...              │
│                                                                 │
│                    [Start Writing]                              │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Foundation

1. Add foliate-js dependency
2. Create IPC handlers for EPUB file operations
3. Update preload script with new API methods
4. Create basic `EpubReader.svelte` component that renders an EPUB

### Phase 2: Custom View

5. Create `EpubNoteView.svelte` with hybrid layout
6. Register with ViewRegistry
7. Implement note content editing in side panel
8. Wire up metadata persistence (currentCfi, progress)

### Phase 3: Navigation & Polish

9. Implement TOC panel (`EpubToc.svelte`)
10. Add progress bar and chapter navigation
11. Implement theme sync (light/dark)
12. Add progress indicator component

### Phase 4: Import Flow

13. Implement drag-drop import handler
14. Add File menu import option
15. EPUB metadata extraction on import
16. Auto-create note with extracted metadata

### Phase 5: Testing & Edge Cases

17. Test with various EPUB files (different publishers, sizes)
18. Handle malformed EPUBs gracefully
19. Handle missing EPUB files (deleted externally)
20. Performance testing with large EPUBs

## Migration & Compatibility

- **New note type**: `epub` type is additive, no migration needed
- **Backwards compatibility**: Older versions will see epub notes as regular notes (markdown content visible, reader won't render)
- **File references**: Use relative paths so vaults remain portable

## Future Considerations

Features to consider post-MVP:

1. **Annotations** - Highlight text, store highlights in metadata
2. **Search** - Full-text search within current book
3. **Bookmarks** - Multiple saved positions per book
4. **Flashcard extraction** - Create spaced repetition cards from highlights
5. **Library view** - Grid/list view of all EPUB notes with covers
6. **Reading stats** - Time spent reading, pages per session
7. **Export annotations** - Export all highlights/notes as markdown
8. **Pagination mode** - Page-flip vs scroll reading modes
9. **Font customization** - Font family, size, line height controls
10. **Offline cover caching** - Store cover images for faster loading

## Open Questions

1. **Panel resize** - Should users be able to resize reader/notes split?
   [yes, should be able to resize the split]
2. **Mobile/responsive** - Stack panels vertically on narrow screens?
   [don't bother for now]
3. **Multiple EPUBs open** - Tabs? Or one at a time?
   [just like normal notes, only one at a time]
4. **Cover display** - Show cover in note list/search results?
   [not for now]

## Success Metrics

- Users can import and read EPUBs without friction
- Reading position persists correctly across sessions
- Notes sync reliably with vault
- Performance acceptable for EPUBs up to 50MB
