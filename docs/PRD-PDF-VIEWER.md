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
├── PDF Actions Bar (TOC toggle, document info)
├── PdfToc.svelte (table of contents overlay)
├── PdfReader.svelte (core PDF renderer)
└── PdfProgress.svelte (progress bar + navigation)
```

## Key Components

### PdfReader.svelte

The core PDF rendering component using pdf.js v5.

**Features:**

- Continuous scroll viewing mode
- Lazy page rendering via IntersectionObserver
- Virtual scrolling for large documents
- Dark mode support (CSS filter inversion)
- Outline/TOC extraction
- Metadata extraction (title, author, subject, etc.)

**Rendering Strategy:**

1. On load, create placeholder divs for all pages with correct dimensions
2. IntersectionObserver watches which placeholders are visible
3. When a placeholder enters viewport, render actual page content to canvas
4. Track most visible page for progress reporting

**Public Methods:**

- `goToPage(pageNumber)` - Navigate to specific page
- `prevPage()` / `nextPage()` - Sequential navigation
- `navigateToOutlineItem(dest)` - Jump to TOC destination

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

### PdfNoteView.svelte

Main orchestrator component that:

- Manages reading position persistence
- Handles metadata synchronization
- Integrates with standard note features (pin, shelf, review, archive)
- Responds to menu navigation commands

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

| Aspect            | EPUB                              | PDF               |
| ----------------- | --------------------------------- | ----------------- |
| Rendering library | foliate-js                        | pdf.js            |
| View mode         | Continuous scroll                 | Continuous scroll |
| Position tracking | CFI (content fragment identifier) | Page number       |
| Highlights        | Supported                         | Not implemented   |
| Annotations       | Supported                         | Not implemented   |
| Text selection    | Native                            | Not implemented   |

## Future Enhancements

Potential features not included in initial implementation:

1. **Text selection and copying** - pdf.js text layer
2. **Annotations/highlights** - pdf.js annotation layer
3. **Search within PDF** - pdf.js find controller
4. **Zoom controls** - Adjustable scale factor
5. **Page thumbnails** - Sidebar with page previews
6. **Two-page spread** - Side-by-side page viewing
7. **Bookmarks** - User-defined position markers
