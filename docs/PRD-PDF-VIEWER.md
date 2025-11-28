# PDF Viewer Design Document

## Overview

PDF support in Flint follows the same architectural patterns established by EPUB support, using the ViewRegistry pattern for content-kind routing and a dedicated viewer component built on Mozilla's pdf.js library.

## Architecture

### Content Kind System

PDFs are represented as notes with `flint_kind: 'pdf'`. The ViewRegistry routes these notes to `PdfNoteView`, which orchestrates the PDF viewing experience.

```
NoteKind: 'markdown' | 'epub' | 'pdf'
```

### Component Hierarchy

```
PdfNoteView.svelte
├── EditorHeader (title editing)
├── NoteActionBar (pin, shelf, metadata, archive)
├── MetadataView (expandable metadata panel)
├── PDF Actions Bar (zoom controls, TOC toggle, highlights toggle, document info)
├── PdfToc.svelte (table of contents overlay)
├── PdfHighlights.svelte (highlights panel overlay)
├── PdfReader.svelte (core PDF renderer with text layer)
├── Selection Popup (highlight creation UI)
└── PdfProgress.svelte (progress bar + navigation)
```

## Key Components

### PdfReader.svelte

The core PDF rendering component using pdf.js v5.

**Features:**

- Continuous scroll viewing mode
- Lazy page rendering via IntersectionObserver
- Virtual scrolling for large documents
- Configurable zoom/scale (50% - 300%)
- Dark mode support (CSS filter inversion)
- Outline/TOC extraction
- Metadata extraction (title, author, subject, etc.)
- Text selection via pdf.js TextLayer
- Highlight rendering overlay

**Rendering Strategy:**

1. On load, create placeholder divs for all pages with correct dimensions
2. IntersectionObserver watches which placeholders are visible
3. When a placeholder enters viewport, render actual page content to canvas
4. Render text layer on top of canvas for text selection (using pdf.js TextLayer)
5. Render highlight layer between canvas and text layer
6. Track most visible page for progress reporting

**Public Methods:**

- `goToPage(pageNumber)` - Navigate to specific page
- `prevPage()` / `nextPage()` - Sequential navigation
- `navigateToOutlineItem(dest)` - Jump to TOC destination
- `clearSelection()` - Clear current text selection

**Props:**

- `scale` - Zoom scale factor (default: 1.5)
- `highlights` - Array of PdfHighlight objects to render
- `onTextSelected` - Callback when text is selected (provides selection info for highlight creation)

### PdfToc.svelte

Table of contents panel supporting nested outline structures.

**Features:**

- Collapsible nested items
- Click-to-navigate
- Overlay positioning (doesn't push content)

### PdfProgress.svelte

Footer progress bar with navigation controls.

**Features:**

- Visual progress bar
- "Page X of Y" display
- Previous/Next page buttons

### PdfHighlights.svelte

Sidebar panel displaying all highlights in the document.

**Features:**

- Lists all highlights sorted by page number
- Shows highlighted text snippet and creation date
- Click to navigate to highlight's page
- Delete button for each highlight
- Overlay positioning (doesn't push content)

### PdfNoteView.svelte

Main orchestrator component that:

- Manages reading position persistence
- Handles metadata synchronization
- Integrates with standard note features (pin, shelf, review, archive)
- Responds to menu navigation commands
- Manages highlight state and persistence
- Shows selection popup for creating highlights
- Toggles highlights panel visibility
- Manages zoom level state and controls

## Data Model

### System Fields

PDF notes use these system fields for state persistence:

| Field               | Type   | Description                         |
| ------------------- | ------ | ----------------------------------- |
| `flint_pdfPath`     | string | Relative path to PDF file in vault  |
| `flint_pdfTitle`    | string | Title extracted from PDF metadata   |
| `flint_pdfAuthor`   | string | Author extracted from PDF metadata  |
| `flint_currentPage` | number | Last viewed page number             |
| `flint_totalPages`  | number | Total pages in document             |
| `flint_progress`    | number | Reading progress percentage (0-100) |
| `flint_lastRead`    | string | ISO timestamp of last read          |

### File Storage

PDFs are stored in the vault's attachments directory:

```
vault/
└── attachments/
    └── pdfs/
        └── document.pdf
```

### Highlights Storage

Highlights are stored directly in the note's markdown content using special comment markers, following the same pattern as EPUB highlights:

```markdown
<!-- pdf-highlights-start -->

## Highlights

> "highlighted text here" [1:0-50](h-abc123|2024-11-28T10:30:00Z|encodedRects)

> "another highlight" [3:100-200](h-def456|2024-11-28T11:00:00Z|encodedRects)

<!-- pdf-highlights-end -->
```

**Format:** `> "text" [pageNumber:startOffset-endOffset](id|timestamp|encodedRects)`

- `pageNumber` - Page number where highlight exists
- `startOffset` / `endOffset` - Character offsets within the page's text content
- `id` - Unique identifier (format: `h-{timestamp in base36}`)
- `timestamp` - ISO creation timestamp
- `encodedRects` - URL-encoded JSON array of bounding rectangles for rendering

**Highlight Data Model:**

```typescript
interface PdfHighlight {
  id: string;
  pageNumber: number;
  text: string;
  startOffset: number;
  endOffset: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  createdAt: string;
}
```

## IPC Communication

### Main Process Handlers

| Handler         | Description                                          |
| --------------- | ---------------------------------------------------- |
| `import-pdf`    | Opens file picker, copies PDF to vault, returns path |
| `read-pdf-file` | Reads PDF file as Uint8Array for pdf.js              |

### Menu Integration

| IPC Channel                | Description                                   |
| -------------------------- | --------------------------------------------- |
| `menu-set-active-pdf`      | Enables/disables reader navigation menu items |
| `menu-action: import-pdf`  | Triggers PDF import flow                      |
| `menu-action: reader-prev` | Navigate to previous page                     |
| `menu-action: reader-next` | Navigate to next page                         |

## Import Flow

1. User selects File > Import PDF...
2. Main process shows file picker dialog
3. Selected PDF is copied to `vault/attachments/pdfs/`
4. Filename conflicts are resolved with numeric suffixes
5. New note is created with `flint_kind: 'pdf'` and `flint_pdfPath` set
6. ViewRegistry routes to PdfNoteView
7. PdfReader loads and renders the PDF

## Reading Position Persistence

Position is saved:

- **Debounced** - 1 second after navigation (to avoid excessive saves)
- **On unmount** - When navigating away from the note
- **Threshold** - Only saves if progress changed by ≥1%

Position is restored:

- `initialPage` prop is derived from `metadata.flint_currentPage`
- PdfReader navigates to this page after loading

## Dark Mode Support

PDFs are rendered to canvas elements. Dark mode is achieved via CSS filter:

```css
.pdf-reader.dark-mode :global(.pdf-canvas) {
  filter: invert(0.9) hue-rotate(180deg);
}
```

This inverts colors while preserving hue, making white backgrounds dark and black text light.

## Dependencies

- **pdfjs-dist** v5.0.375 - Mozilla's PDF rendering library
- Web Worker for off-main-thread PDF parsing (`pdf.worker.min.mjs`)

## Differences from EPUB Implementation

| Aspect            | EPUB                              | PDF                            |
| ----------------- | --------------------------------- | ------------------------------ |
| Rendering library | foliate-js                        | pdf.js                         |
| View mode         | Continuous scroll                 | Continuous scroll              |
| Position tracking | CFI (content fragment identifier) | Page number + character offset |
| Highlights        | Supported                         | Supported                      |
| Annotations       | Supported                         | Not implemented                |
| Text selection    | Native                            | pdf.js TextLayer               |
| Highlight storage | Note content (markdown)           | Note content (markdown)        |

## Highlight Flow

1. User selects text in the PDF using the text layer
2. Selection popup appears below the selection
3. User clicks "Highlight" button
4. Highlight is created with:
   - Unique ID
   - Page number
   - Character offsets
   - Bounding rectangles (for rendering)
   - Selected text
   - Timestamp
5. Highlight is rendered as yellow overlay on the page
6. Note content is updated with serialized highlight data
7. Highlights persist across sessions via note content

## Zoom Controls

The PDF viewer supports adjustable zoom levels via the PDF Actions Bar.

**Zoom Levels:** 50%, 75%, 100%, 125%, 150% (default), 175%, 200%, 250%, 300%

**UI Controls:**

- **Zoom out (-)** - Decrease zoom to previous level
- **Zoom level display** - Shows current percentage, click to reset to 150%
- **Zoom in (+)** - Increase zoom to next level

**Implementation:**

- Zoom state managed in `PdfNoteView.svelte` via `zoomIndex` and `zoomScale`
- Scale passed to `PdfReader.svelte` as prop
- On scale change, pages are re-rendered with new dimensions
- Current page position is preserved during zoom changes
- Uses direct container scroll (`scrollTo`) to avoid affecting parent layout

## Future Enhancements

Potential features not included in current implementation:

1. **Search within PDF** - pdf.js find controller
2. **Page thumbnails** - Sidebar with page previews
3. **Two-page spread** - Side-by-side page viewing
4. **Bookmarks** - User-defined position markers
5. **Multiple highlight colors** - Color picker for highlights
6. **Highlight notes** - Add notes/comments to highlights
