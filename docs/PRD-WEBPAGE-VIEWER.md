# PRD: Webpage Viewer Integration

## Overview

Integrate a webpage reader into Flint Note using the custom view system, allowing users to save and read web articles in a clean, distraction-free format alongside their notes. Uses Defuddle library to extract article content, providing cleaned HTML optimized for reading.

## Goals

1. **Distraction-free reading** - Clean article view without ads, navigation, or clutter
2. **Offline access** - Saved webpages available without internet connection
3. **Note integration** - Take markdown notes alongside the article content
4. **Highlight support** - Highlight important passages for later reference
5. **Portable library** - Webpage files stored in vault, sync with vault

## Non-Goals (MVP)

- Full page archiving (images, CSS, scripts)
- Web scraping automation
- RSS feed integration
- Browser extension for one-click save
- PDF export

## User Stories

### Import & Setup

1. **As a user**, I want to import a webpage via URL input so I can save articles for later reading
2. **As a user**, I want to import a webpage via File menu so I have a discoverable import option
3. **As a user**, I want both the cleaned and original HTML saved so I have a backup of the source

### Reading

4. **As a user**, I want to see a clean, readable version of the article without ads or clutter
5. **As a user**, I want the reader theme to match my app theme (light/dark) for visual consistency
6. **As a user**, I want to see article metadata (title, author, site name) so I know the source
7. **As a user**, I want to click the source URL to open the original page in my browser

### Highlighting

8. **As a user**, I want to select text and create highlights so I can mark important passages
9. **As a user**, I want to see a list of my highlights so I can review key points
10. **As a user**, I want to click a highlight to navigate to that passage in the article
11. **As a user**, I want to delete highlights I no longer need

### Note-Taking

12. **As a user**, I want to write markdown notes alongside the article so I can capture thoughts while reading
13. **As a user**, I want my notes and highlights saved as part of the webpage note so everything stays together
14. **As a user**, I want to use wikilinks in my notes so I can connect reading notes to other notes

## Technical Architecture

### Library Choices

**jsdom** - Full DOM implementation for Node.js

- Required by Defuddle for server-side parsing
- Provides complete DOM API compatibility

**defuddle** - Article extraction library

- TypeScript library for extracting and cleaning web page content
- Removes clutter like comments, sidebars, headers, footers
- Provides consistent HTML output optimized for Markdown conversion
- Returns rich metadata: title, author, site, description, published date, word count

**DOMPurify** - HTML sanitization

- Prevents XSS attacks from malicious webpage content
- Allows safe rendering in Shadow DOM

### Custom View Registration

```typescript
// src/renderer/src/lib/views/index.ts
ViewRegistry.registerView('webpage', {
  component: WebpageNoteView,
  modes: ['hybrid', 'view'],
  supportedKinds: ['webpage'],
  priority: 1
});
```

### Component Structure

```
src/renderer/src/lib/views/
├── WebpageNoteView.svelte       # Main view component (registered with ViewRegistry)
├── webpage/
│   ├── WebpageReader.svelte     # Shadow DOM reader component
│   ├── WebpageHighlights.svelte # Highlights sidebar panel
│   └── types.ts                 # Type definitions and highlight serialization
```

### File Storage

Webpage files stored in vault:

```
vault/
├── attachments/
│   └── webpages/
│       ├── example-com-article-title.html          # Cleaned/reader version
│       ├── example-com-article-title.original.html # Original HTML
│       └── example-com-article-title.meta.json     # Metadata (URL, title, etc.)
├── Article Title.md
└── ...
```

### IPC Handlers (Main Process)

```typescript
// Import webpage - fetches URL, processes with Defuddle, saves files
ipcMain.handle('import-webpage', async (_event, params: { url: string }) => {
  const { url } = params;

  // Fetch the webpage
  const response = await fetch(url);
  const originalHtml = await response.text();

  // Parse with Defuddle for article extraction
  const { JSDOM } = await import('jsdom');
  const { Defuddle } = await import('defuddle/node');

  const dom = new JSDOM(originalHtml, { url });
  const article = await Defuddle(dom, url);

  // Save cleaned HTML, original HTML, and metadata
  // Returns { slug, path, originalPath, title, siteName, author, excerpt }
});

// Read webpage file
ipcMain.handle('read-webpage-file', async (_event, params: { relativePath: string }) => {
  const fullPath = path.join(vaultPath, params.relativePath);
  return await fs.readFile(fullPath, 'utf-8');
});
```

## Data Model

### Note Kind: `webpage`

```typescript
interface WebpageNote {
  id: string;
  type: string; // User's organizational type (e.g., 'note', 'article')
  kind: 'webpage'; // Content rendering type
  title: string; // Article title
  filename: string;
  content: string; // User's markdown notes + serialized highlights
  metadata: {
    flint_webpagePath: string; // Relative path to cleaned HTML
    flint_webpageOriginalPath: string; // Relative path to original HTML
    flint_webpageUrl: string; // Source URL
    flint_webpageTitle: string; // Title from extraction
    flint_webpageSiteName: string; // Site name from metadata
    flint_webpageAuthor: string; // Author if available
    flint_progress: number; // Scroll position (0-100)
    flint_lastRead: string; // ISO timestamp
  };
}
```

### Highlight Storage

Highlights are stored in the note's markdown content using a special format:

```markdown
# My Notes

Some user notes here...

<!-- webpage-highlights-start -->

## Highlights

> "highlighted text here" [prefix...suffix](id|timestamp|startOffset-endOffset)

> "another highlight" [prefix...suffix](id|timestamp|startOffset-endOffset)

<!-- webpage-highlights-end -->
```

### Highlight Anchoring Strategy

Uses text-based anchoring with fuzzy matching:

1. **Primary**: prefix + text + suffix context matching
2. **Fallback**: Exact text match anywhere in document
3. **Last resort**: Character offsets (if text unchanged)

```typescript
interface WebpageHighlight {
  id: string;
  textContent: string; // The highlighted text
  prefix: string; // ~30 chars before highlight
  suffix: string; // ~30 chars after highlight
  startOffset: number; // Character offset fallback
  endOffset: number;
  createdAt: string;
}
```

## UI/UX Design

### Layout: Hybrid View

```
┌─────────────────────────────────────────────────────────────────┐
│  [← Back]  Article Title                     [Source ↗] [H] [⚙] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      WEBPAGE READER                             │
│                                                                 │
│   (Shadow DOM with sanitized article content)                   │
│                                                                 │
│   Clean, readable text with proper typography                   │
│   Highlighted passages shown in yellow                          │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [Selection popup: Highlight button appears on text selection]  │
└─────────────────────────────────────────────────────────────────┘
```

### Highlights Panel (toggleable sidebar)

```
┌─────────────────────┐
│  Highlights (3)  [×]│
├─────────────────────┤
│  "Key quote from    │
│  the article..."    │
│  Jan 15, 2025  [🗑] │
├─────────────────────┤
│  "Another important │
│  passage here..."   │
│  Jan 15, 2025  [🗑] │
└─────────────────────┘
```

### Import Flow

1. User selects File → Import Webpage (or keyboard shortcut)
2. Modal appears with URL input field
3. User pastes URL and clicks Import
4. Loading state shown while fetching and processing
5. On success: New note created, opens in WebpageNoteView
6. On error: Error message displayed in modal

### Selection & Highlight Flow

1. User selects text in the reader
2. Highlight button appears near selection
3. User clicks Highlight
4. Text is marked with yellow background
5. Highlight saved to note content
6. Highlight appears in sidebar (if open)

## Implementation Details

### Shadow DOM Rendering

The webpage content is rendered inside a Shadow DOM to:

- Isolate article styles from app styles
- Prevent CSS conflicts
- Enable proper text selection within the content
- Apply consistent reader typography

```typescript
// Create shadow root
shadowRoot = container.attachShadow({ mode: 'open' });

// Sanitize content with DOMPurify
const cleanHtml = DOMPurify.sanitize(bodyContent, {
  ADD_TAGS: ['article', 'section', 'header', 'footer', 'aside', 'figure', 'figcaption'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form']
});

// Inject styles and content
shadowRoot.appendChild(styleElement);
shadowRoot.appendChild(contentContainer);
```

### Text Selection in Shadow DOM

Required explicit CSS for text selection to work:

```css
:host {
  -webkit-user-select: text;
  user-select: text;
  cursor: text;
}

* {
  -webkit-user-select: text;
  user-select: text;
}
```

Selection detection uses `shadowRoot.getSelection()` (Chromium) with `document.getSelection()` fallback.

### Theme Support

Reader styles adapt to light/dark mode:

- Background: white/dark gray
- Text: dark/light
- Links: blue shades appropriate for each theme
- Highlights: yellow with adjusted opacity

## Files Created/Modified

### New Files

- `src/renderer/src/lib/views/webpage/types.ts` - Type definitions, serialization
- `src/renderer/src/lib/views/webpage/WebpageReader.svelte` - Reader component
- `src/renderer/src/lib/views/webpage/WebpageHighlights.svelte` - Highlights panel
- `src/renderer/src/lib/views/WebpageNoteView.svelte` - Main view container
- `src/renderer/src/components/ImportWebpageModal.svelte` - URL import dialog

### Modified Files

- `src/main/index.ts` - IPC handlers for import and file reading
- `src/preload/index.ts` - API exposure to renderer
- `src/renderer/src/env.d.ts` - TypeScript types for API
- `src/server/types/index.ts` - Added 'webpage' to flint_kind
- `src/server/core/system-fields.ts` - Added webpage system fields
- `src/server/core/notes.ts` - Added webpage paths to write-once fields
- `src/renderer/src/lib/views/index.ts` - View registration
- `src/renderer/src/App.svelte` - Modal integration
- `src/main/menu.ts` - Menu item
- `src/renderer/src/components/MetadataView.svelte` - Hide webpage system fields
- `electron.vite.config.ts` - External canvas module

### Dependencies

- `jsdom` - Added (DOM parser for Node.js, required by Defuddle)
- `defuddle` - Added (article extraction)
- `linkedom` - Kept (used elsewhere in the codebase)

## Migration & Compatibility

- **New note kind**: `webpage` kind is additive, no migration needed
- **Backwards compatibility**: Older versions will see webpage notes as regular notes (markdown content visible, reader won't render)
- **File references**: Use relative paths so vaults remain portable

## Future Considerations

Features to consider post-MVP:

1. **Browser extension** - One-click save from browser
2. **Image archiving** - Download and store article images locally
3. **Full-text search** - Search within saved articles
4. **Reading list** - Queue of articles to read
5. **Auto-tagging** - Extract keywords/topics from content
6. **Export** - Export article + notes as PDF/markdown
7. **Annotation types** - Comments, not just highlights
8. **Share highlights** - Export highlighted passages

## Success Metrics

- Users can import and read webpages without friction
- Article extraction works for major news/blog sites
- Highlights persist correctly across sessions
- Performance acceptable for typical article lengths
- Theme switching works seamlessly
