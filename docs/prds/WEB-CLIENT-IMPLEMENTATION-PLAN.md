# Flint Web Client Implementation Plan

## Executive Summary

This document outlines the plan to add a web-based client for Flint that works alongside the existing Electron desktop application. The web client will share the same sync infrastructure (Automerge + R2) while providing browser-based access to notes.

**Key Goals:**

- Reuse existing Automerge + R2 sync architecture
- Enable access from any browser without installation
- Maintain compatibility with desktop client
- Provide offline-capable Progressive Web App (PWA)

**Timeline:** 8-10 weeks (starts after [Phase 3 of Automerge Sync](./AUTOMERGE-SYNC-IMPLEMENTATION-PLAN.md#phase-3-multi-device-sync-4-5-weeks))

**Scope:** Read/write notes in browser, sync with desktop clients, basic search and navigation

---

## Design Principles

### 1. **Desktop-First, Web-Complementary**

- Electron app is the primary, full-featured client
- Web client provides convenient access (work, travel, other devices)
- Web users can always export markdown and migrate to desktop

### 2. **Shared Sync Infrastructure**

- Same Automerge documents, same R2 storage, same encryption
- No separate backend or API server needed
- Desktop and web clients are peers in the sync network

### 3. **Progressive Web App**

- Works offline after initial load
- Installable on mobile/desktop as PWA
- Service worker for caching and background sync

### 4. **Clear Trade-offs**

- Web: No filesystem, no external editors, no git integration
- Desktop: Full local-first experience with markdown files
- Both: Automatic sync, conflict-free merging, encrypted storage

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Desktop Client (Electron)                  │
│                                                               │
│  Markdown Files ←→ Automerge Docs ←→ IndexedDB              │
│                         ↓                                     │
│                    SQLite Search                              │
└───────────────────────────┬───────────────────────────────────┘
                            │
                   ┌────────┼────────┐
                   │   Encryption    │
                   │  (AES-256-GCM)  │
                   └────────┼────────┘
                            │
                            ↓
                   ┌─────────────────┐
                   │ Cloudflare R2   │
                   │ (Encrypted      │
                   │  Automerge      │
                   │  Documents)     │
                   └─────────────────┘
                            ↑
                   ┌────────┼────────┐
                   │   Encryption    │
                   │  (AES-256-GCM)  │
                   └────────┼────────┘
                            │
┌───────────────────────────┴───────────────────────────────────┐
│                      Web Client (Browser)                      │
│                                                               │
│  Automerge Docs ←→ IndexedDB                                 │
│       ↓                                                       │
│  Lunr.js Search Index                                        │
│                                                               │
│  Service Worker (PWA) - Offline support                      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│         Identity Layer (AT Protocol - Shared)                │
│                                                              │
│  DID Authentication → R2 Storage Key → Encryption Key       │
└──────────────────────────────────────────────────────────────┘
```

### Key Differences from Desktop

| Feature              | Desktop (Electron)     | Web (Browser)               |
| -------------------- | ---------------------- | --------------------------- |
| **Source of Truth**  | Markdown files         | Automerge docs in IndexedDB |
| **Storage**          | Filesystem + IndexedDB | IndexedDB only              |
| **Search**           | SQLite FTS5            | Lunr.js or MiniSearch       |
| **External Editors** | Yes (VSCode, etc.)     | No                          |
| **Git Integration**  | Yes                    | No                          |
| **Offline**          | Always works           | PWA with service worker     |
| **File Export**      | Native filesystem      | Download ZIP                |
| **Installation**     | Required               | Optional (PWA)              |

---

## Architecture Components

### Shared Core (`@flint/sync-core`)

Extract platform-agnostic sync logic:

```typescript
// packages/sync-core/src/index.ts
import { Repo } from '@automerge/automerge-repo';
import { next as Automerge } from '@automerge/automerge';

export interface FlintNote {
  id: string;
  metadata: {
    title: string;
    filename: string;
    type: string;
    created: string;
    updated: string;
    tags: string[];
    [key: string]: any;
  };
  content: Automerge.Text;
  deleted: boolean;
}

export interface StorageAdapter {
  save(docId: string, binary: Uint8Array): Promise<void>;
  load(docId: string): Promise<Uint8Array | undefined>;
  remove(docId: string): Promise<void>;
  loadRange(prefix: string[]): Promise<Uint8Array[]>;
}

export interface SearchIndex {
  indexNote(note: FlintNote): Promise<void>;
  search(query: string): Promise<SearchResult[]>;
  remove(noteId: string): Promise<void>;
  rebuild(notes: FlintNote[]): Promise<void>;
}

export class FlintSyncCore {
  protected repo: Repo;
  protected searchIndex: SearchIndex;

  constructor(
    storage: StorageAdapter,
    searchIndex: SearchIndex,
    encryptionKey: CryptoKey
  ) {
    this.repo = new Repo({
      storage: new IndexedDBStorageAdapter(),
      network: [new EncryptedR2StorageAdapter(storage, encryptionKey)]
    });

    this.searchIndex = searchIndex;
  }

  async createNote(type: string, title: string, content: string): Promise<FlintNote> {
    const noteId = this.generateNoteId();
    const handle = this.repo.create<FlintNote>();

    handle.change((doc) => {
      doc.id = noteId;
      doc.metadata = {
        title,
        filename: this.generateFilename(title),
        type,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: []
      };
      doc.content = new Automerge.Text(content);
      doc.deleted = false;
    });

    await handle.whenReady();
    await this.searchIndex.indexNote(handle.doc);

    return handle.doc;
  }

  async updateNote(noteId: string, newContent: string): Promise<void> {
    const handle = this.repo.find<FlintNote>(noteId);
    await handle.whenReady();

    handle.change((doc) => {
      doc.content = new Automerge.Text(newContent);
      doc.metadata.updated = new Date().toISOString();
    });

    await this.searchIndex.indexNote(handle.doc);
  }

  async getNote(noteId: string): Promise<FlintNote> {
    const handle = this.repo.find<FlintNote>(noteId);
    await handle.whenReady();
    return handle.doc;
  }

  async deleteNote(noteId: string): Promise<void> {
    const handle = this.repo.find<FlintNote>(noteId);
    await handle.whenReady();

    handle.change((doc) => {
      doc.deleted = true;
      doc.metadata.updated = new Date().toISOString();
    });

    await this.searchIndex.remove(noteId);
  }

  async search(query: string): Promise<SearchResult[]> {
    return this.searchIndex.search(query);
  }

  // Platform-specific implementations override these
  protected generateNoteId(): string {
    return `n-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected generateFilename(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
}
```

---

## Web Client Implementation

### 1. Framework: SvelteKit

Use SvelteKit for the web client (same UI framework as desktop):

```bash
npm create svelte@latest packages/web-client
cd packages/web-client
npm install @flint/sync-core @automerge/automerge @automerge/automerge-repo
npm install lunr @aws-sdk/client-s3 @atproto/oauth-client
```

**Why SvelteKit?**

- Share Svelte components with desktop renderer
- Built-in SSR for initial load (optional)
- Adapter for static site generation (deploy to Cloudflare Pages)
- Service worker integration for PWA

### 2. Search: Lunr.js

Browser-based full-text search:

```typescript
// packages/web-client/src/lib/search/lunr-search-index.ts
import lunr from 'lunr';
import type { SearchIndex, FlintNote, SearchResult } from '@flint/sync-core';

export class LunrSearchIndex implements SearchIndex {
  private index: lunr.Index | null = null;
  private documents: Map<string, FlintNote> = new Map();

  async indexNote(note: FlintNote): Promise<void> {
    this.documents.set(note.id, note);
    await this.rebuild(Array.from(this.documents.values()));
  }

  async rebuild(notes: FlintNote[]): Promise<void> {
    this.documents.clear();
    notes.forEach((note) => this.documents.set(note.id, note));

    this.index = lunr(function () {
      this.ref('id');
      this.field('title', { boost: 10 });
      this.field('content', { boost: 5 });
      this.field('tags', { boost: 3 });

      notes.forEach((note) => {
        if (!note.deleted) {
          this.add({
            id: note.id,
            title: note.metadata.title,
            content: note.content.toString(),
            tags: note.metadata.tags.join(' ')
          });
        }
      });
    });
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.index) return [];

    const results = this.index.search(query);

    return results
      .map((result) => {
        const note = this.documents.get(result.ref);
        if (!note) return null;

        return {
          id: note.id,
          title: note.metadata.title,
          snippet: this.extractSnippet(note.content.toString(), query),
          score: result.score,
          metadata: note.metadata
        };
      })
      .filter(Boolean) as SearchResult[];
  }

  async remove(noteId: string): Promise<void> {
    this.documents.delete(noteId);
    await this.rebuild(Array.from(this.documents.values()));
  }

  private extractSnippet(content: string, query: string, length = 150): string {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);

    if (index === -1) {
      return content.substring(0, length) + '...';
    }

    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + length);

    return (
      (start > 0 ? '...' : '') +
      content.substring(start, end) +
      (end < content.length ? '...' : '')
    );
  }
}
```

### 3. Web-Specific Client

```typescript
// packages/web-client/src/lib/flint-web-client.ts
import { FlintSyncCore } from '@flint/sync-core';
import { LunrSearchIndex } from './search/lunr-search-index';
import { WebStorageAdapter } from './storage/web-storage-adapter';

export class FlintWebClient extends FlintSyncCore {
  constructor(encryptionKey: CryptoKey, userIdentifier: string) {
    super(new WebStorageAdapter(userIdentifier), new LunrSearchIndex(), encryptionKey);
  }

  // Web-specific: Export vault as ZIP
  async exportVault(): Promise<Blob> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    const handles = Array.from(this.repo.handles.values());

    for (const handle of handles) {
      await handle.whenReady();
      const note = handle.doc as FlintNote;

      if (note.deleted) continue;

      // Generate markdown file
      const markdown = this.noteToMarkdown(note);
      const filename = `${note.metadata.filename}.md`;
      zip.file(filename, markdown);
    }

    return await zip.generateAsync({ type: 'blob' });
  }

  // Web-specific: Import from markdown files
  async importMarkdownFiles(files: File[]): Promise<void> {
    for (const file of files) {
      const content = await file.text();
      const parsed = this.parseMarkdown(content);

      await this.createNote(
        parsed.metadata.type || 'note',
        parsed.metadata.title || file.name.replace('.md', ''),
        parsed.content
      );
    }
  }

  private noteToMarkdown(note: FlintNote): string {
    const frontmatter = Object.entries(note.metadata)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}: [${value.join(', ')}]`;
        }
        return `${key}: ${value}`;
      })
      .join('\n');

    return `---\n${frontmatter}\n---\n\n${note.content.toString()}`;
  }

  private parseMarkdown(content: string): { metadata: any; content: string } {
    // Simple frontmatter parser
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { metadata: {}, content };
    }

    const metadata: any = {};
    match[1].split('\n').forEach((line) => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        metadata[key.trim()] = valueParts.join(':').trim();
      }
    });

    return { metadata, content: match[2] };
  }
}
```

### 4. PWA Configuration

```typescript
// packages/web-client/src/service-worker.ts
/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `flint-cache-${version}`;
const ASSETS = [...build, ...files];

// Install service worker
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

// Activate and clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      for (const key of keys) {
        if (key !== CACHE) await caches.delete(key);
      }
    })
  );
});

// Fetch strategy: Network first, fall back to cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        // Update cache with fresh response
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone());
        return response;
      })
      .catch(async () => {
        // Network failed, try cache
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // Return offline page
        return new Response('Offline', { status: 503 });
      })
  );
});
```

### 5. Web Manifest

```json
// packages/web-client/static/manifest.json
{
  "name": "Flint Notes",
  "short_name": "Flint",
  "description": "Your networked note-taking tool",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "orientation": "any",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## Phase Breakdown

### Phase 1: Extract Shared Core (2 weeks)

**Goal:** Create platform-agnostic sync package

#### Tasks

1. **Create `@flint/sync-core` package**
   - Extract Automerge types and interfaces
   - Create abstract `FlintSyncCore` class
   - Define `StorageAdapter` and `SearchIndex` interfaces

2. **Refactor Desktop Client**
   - Migrate to use `@flint/sync-core`
   - Implement `ElectronStorageAdapter` and `SQLiteSearchIndex`
   - Keep filesystem sync layer in desktop-specific code

3. **Testing**
   - Ensure desktop client works with refactored core
   - No functional changes for users
   - Performance benchmarks remain same

**Deliverable:** Desktop client using shared core package

---

### Phase 2: Web Client Foundation (2-3 weeks)

**Goal:** Basic web app with Automerge integration

#### Tasks

1. **Setup SvelteKit Project**
   - Initialize `packages/web-client`
   - Configure TypeScript and Vite
   - Install dependencies

2. **Implement Web Storage**
   - `WebStorageAdapter` for R2 (same as desktop)
   - IndexedDB for local Automerge persistence
   - Encryption service (Web Crypto API)

3. **Implement Lunr Search**
   - `LunrSearchIndex` implementation
   - Index building from Automerge docs
   - Query parsing and ranking

4. **Basic UI**
   - Note list view
   - Note editor (reuse Svelte components from desktop)
   - Create/edit/delete operations

**Deliverable:** Functional web app with local notes (no sync yet)

---

### Phase 3: Sync Integration (2 weeks)

**Goal:** Enable sync between web and desktop clients

#### Tasks

1. **R2 Network Adapter**
   - Add R2 network adapter to web client
   - Implement background sync
   - Handle offline/online transitions

2. **AT Protocol OAuth**
   - Web-based OAuth flow
   - DID authentication
   - Token storage in localStorage/sessionStorage

3. **Encryption Setup**
   - Password prompt on first use
   - Key derivation (same as desktop)
   - Secure key storage (sessionStorage for now)

4. **Testing**
   - Create note on desktop, see on web
   - Edit on web, sync to desktop
   - Concurrent edits merge correctly

**Deliverable:** Bidirectional sync working

---

### Phase 4: PWA and Offline (1-2 weeks)

**Goal:** Make web client work offline

#### Tasks

1. **Service Worker**
   - Cache static assets
   - Offline page
   - Background sync API

2. **PWA Manifest**
   - App icons and metadata
   - Install prompts
   - Splash screens

3. **Offline UX**
   - Sync status indicators
   - Offline mode badge
   - Queue pending changes

**Deliverable:** Installable PWA with offline support

---

### Phase 5: Polish and Deploy (1-2 weeks)

**Goal:** Production-ready web client

#### Tasks

1. **Responsive Design**
   - Mobile layouts
   - Touch interactions
   - Keyboard shortcuts

2. **Performance**
   - Code splitting
   - Lazy loading
   - IndexedDB optimizations

3. **Security Audit**
   - Content Security Policy
   - XSS prevention
   - Secure token handling

4. **Deployment**
   - Build static site
   - Deploy to Cloudflare Pages
   - Setup custom domain (e.g., app.flintapp.com)

**Deliverable:** Web client live at public URL

---

## Deployment Architecture

### Option 1: Static Site on Cloudflare Pages

```
User Browser → Cloudflare Pages (Static HTML/JS/CSS)
             ↓
          IndexedDB (Local Storage)
             ↓
       Automerge Repo (Local CRDT)
             ↓
      Web Crypto API (Encryption)
             ↓
     Cloudflare R2 (Sync Backend)
```

**Advantages:**

- No server needed
- Free hosting on Cloudflare
- CDN for fast global access
- Automatic HTTPS

**Disadvantages:**

- All code runs client-side
- Can't use Node.js APIs
- Harder to debug in production

### Option 2: Vercel/Netlify

Similar to Cloudflare Pages but different hosting providers.

---

## Security Considerations

### 1. **Encryption Key Management**

**Challenge:** Web apps can't use OS keychain like Electron

**Solutions:**

- **Session-only storage:** Key in memory, lost on page refresh (most secure)
- **localStorage with password:** Re-derive key on each session
- **sessionStorage:** Key persists within tab, cleared on close
- **Future:** WebAuthn for biometric unlock

```typescript
class WebEncryptionManager {
  private key: CryptoKey | null = null;

  async initializeFromPassword(password: string, did: string): Promise<void> {
    const salt = await this.hashString(did);
    const keyMaterial = await this.deriveKey(password, salt);

    this.key = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );

    // Store encrypted flag in localStorage (not the key itself)
    localStorage.setItem('flint-encryption-enabled', 'true');
  }

  isInitialized(): boolean {
    return this.key !== null;
  }

  // Force re-authentication on page load
  requirePasswordOnStartup(): boolean {
    return localStorage.getItem('flint-encryption-enabled') === 'true';
  }
}
```

### 2. **Content Security Policy**

```html
<!-- packages/web-client/src/app.html -->
<meta
  http-equiv="Content-Security-Policy"
  content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://*.r2.cloudflarestorage.com https://*.bsky.network;
  worker-src 'self';
"
/>
```

### 3. **XSS Prevention**

- Sanitize user-generated content
- Use Svelte's automatic escaping
- No `{@html}` with user input
- Markdown renderer with XSS protection

---

## User Experience

### First-Time Setup

1. User visits `app.flintapp.com`
2. Prompted to sign in with AT Protocol (or create account)
3. Set encryption password
4. Choose: "Start Fresh" or "Sync Existing Vault"
5. If syncing: Download encrypted docs from R2
6. Decrypt and populate IndexedDB
7. Rebuild search index
8. Ready to use

### Daily Usage

1. Open `app.flintapp.com` (or installed PWA)
2. Enter password (if session expired)
3. App syncs in background
4. Edit notes
5. Changes auto-sync to R2
6. Other devices receive updates

### Export Workflow

1. User wants local markdown files
2. Click "Export Vault"
3. Download ZIP with all notes as `.md` files
4. Can import into desktop client or use with git

---

## Testing Strategy

### Unit Tests

- Core sync logic (shared package)
- Lunr search implementation
- Encryption/decryption
- Markdown import/export

### Integration Tests

- Automerge document operations
- R2 sync adapter
- IndexedDB persistence
- Service worker caching

### End-to-End Tests

- Create note on web, verify on desktop
- Edit on desktop, verify on web
- Concurrent edits from multiple tabs
- Offline mode and sync recovery

### Browser Compatibility

- Chrome/Edge (Chromium)
- Firefox
- Safari (desktop and iOS)
- Mobile browsers

---

## Cost Estimates

### Cloudflare Costs

**Pages (Hosting):**

- Free tier: Unlimited requests, 500 builds/month
- Custom domains included

**R2 (Storage):**

- Same as desktop (see [Automerge plan](./AUTOMERGE-SYNC-IMPLEMENTATION-PLAN.md#cost-estimates))
- No per-user cost difference

**Workers (Optional):**

- Not needed for static site
- Could add for WebSocket sync in future

**Total:** $0-3/month for small user base (same as desktop-only)

---

## Success Metrics

- ✅ 95%+ feature parity with desktop (excluding filesystem features)
- ✅ < 3 second initial load time
- ✅ Works offline after first visit
- ✅ Sync latency < 10 seconds
- ✅ Mobile responsive on phones/tablets
- ✅ Installable as PWA on all major platforms

---

## Future Enhancements

### Mobile Apps (Phase 6)

- React Native with same `@flint/sync-core`
- Native mobile UI
- Share extension for capturing notes
- Biometric unlock

### Real-Time Collaboration (Phase 7)

- WebSocket sync for instant updates
- Live cursors and presence
- Shared notes (multi-user editing)

### Advanced Features (Phase 8)

- Rich media (images, PDFs)
- Drawing/sketching
- Voice notes
- Web clipper browser extension

---

## Migration from Desktop

Users can seamlessly migrate:

1. **Desktop user enables sync** → Notes encrypted and uploaded to R2
2. **Open web client** → Sign in with same AT Protocol DID
3. **Enter same password** → Derives same encryption key
4. **Notes auto-download** → Automerge docs sync from R2
5. **Both clients now synced** → Edit on either, changes propagate

No data migration required - sync handles everything!

---

## Risks and Mitigations

### Risk 1: Browser Storage Limits

**Mitigation:** IndexedDB quotas are generous (50GB+ on desktop browsers). Monitor usage and prompt users to export/archive old notes.

### Risk 2: Password Recovery

**Mitigation:** No password recovery possible (zero-knowledge encryption). Clearly warn users. Consider optional encrypted backup of key material.

### Risk 3: Performance with Large Vaults

**Mitigation:** Lunr.js has good performance up to ~10k documents. For larger vaults, consider server-side search or suggest desktop client.

### Risk 4: Cross-Browser Compatibility

**Mitigation:** Test thoroughly on all major browsers. Use polyfills for older browsers. Provide clear browser requirements.

---

## Summary

The web client leverages the existing Automerge + R2 architecture with minimal additional infrastructure:

- **Shared Core:** 70% code reuse from desktop client
- **No Backend:** Pure static site with client-side sync
- **PWA:** Offline-capable, installable
- **Timeline:** 8-10 weeks after Automerge sync is stable
- **Cost:** $0 additional hosting, same R2 costs

This provides users with flexible access to their notes while maintaining the local-first philosophy of the desktop application.
