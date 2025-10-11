# Store Architecture Improvements

## Current Problems

### 1. Manual Refresh Pattern
Currently, any code that modifies notes must manually call `notesStore.refresh()`:

```typescript
// dailyViewStore.svelte.ts
const dailyNote = await this.getOrCreateDailyNote(date, true);
const { notesStore } = await import('../services/noteStore.svelte');
await notesStore.refresh(); // Manual refresh - error prone!
```

**Issues:**
- Easy to forget the refresh call
- Tight coupling between stores
- Loads ALL notes even when only one changed
- No way to know what changed (full refresh)

### 2. Counter-Based Invalidation
Some stores use counters to signal updates:

```typescript
// notesStore
wikilinksUpdateCounter: number;
notifyWikilinksUpdated(): void {
  state.wikilinksUpdateCounter++;
}
```

**Issues:**
- Indirect communication pattern
- Components must watch counter and react
- No information about what changed
- Still requires manual notification calls

### 3. Event-Based Updates
Some stores emit custom DOM events:

```typescript
const event = new CustomEvent('notes-unpinned', {
  detail: { noteIds: unpinnedIds }
});
document.dispatchEvent(event);
```

**Issues:**
- Type-unsafe
- Hard to track dependencies
- Easy to miss event handlers
- Global event bus is anti-pattern in component frameworks

## Better Architecture Patterns

### Option 1: Event Sourcing with Message Bus (Recommended)

Create a centralized message bus that all stores subscribe to:

```typescript
// services/messageBus.svelte.ts
type NoteEvent =
  | { type: 'note.created'; noteId: string; noteType: string }
  | { type: 'note.updated'; noteId: string; fields: string[] }
  | { type: 'note.deleted'; noteId: string }
  | { type: 'note.renamed'; oldId: string; newId: string };

class MessageBus {
  private subscribers = $state<Map<string, Set<(event: NoteEvent) => void>>>(new Map());

  subscribe(eventType: string, handler: (event: NoteEvent) => void) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => this.subscribers.get(eventType)?.delete(handler);
  }

  publish(event: NoteEvent) {
    // Notify specific event subscribers
    this.subscribers.get(event.type)?.forEach(handler => handler(event));
    // Also notify wildcard subscribers
    this.subscribers.get('*')?.forEach(handler => handler(event));
  }
}

export const messageBus = new MessageBus();
```

**Usage:**

```typescript
// dailyViewStore.svelte.ts
const dailyNote = await this.getOrCreateDailyNote(date, true);
messageBus.publish({
  type: 'note.created',
  noteId: dailyNote.id,
  noteType: 'daily'
});
```

```typescript
// noteStore.svelte.ts
$effect(() => {
  const unsubscribe = messageBus.subscribe('note.created', (event) => {
    // Add note to store without full refresh
    this.addNoteToCache(event.noteId);
  });

  return unsubscribe;
});
```

**Benefits:**
- Type-safe event definitions
- Decoupled stores (don't import each other)
- Granular updates (no full refresh)
- Easy to debug (all events flow through one place)
- Can log all events for debugging

### Option 2: Query Invalidation (TanStack Query Pattern)

Adopt a query-based pattern where stores are caches that invalidate:

```typescript
// services/queryCache.svelte.ts
class QueryCache {
  private queries = $state<Map<string, { data: any; stale: boolean }>>(new Map());

  getQuery(key: string) {
    return this.queries.get(key);
  }

  setQuery(key: string, data: any) {
    this.queries.set(key, { data, stale: false });
  }

  invalidateQuery(pattern: string | RegExp) {
    for (const [key, query] of this.queries.entries()) {
      if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
        query.stale = true;
      }
    }
  }
}
```

**Usage:**

```typescript
// noteStore.svelte.ts
const notes = $derived.by(() => {
  const query = queryCache.getQuery('notes:all');
  if (!query || query.stale) {
    loadAllNotes(); // Triggers async load
    return query?.data || [];
  }
  return query.data;
});

async function loadAllNotes() {
  const data = await noteService.listNotes();
  queryCache.setQuery('notes:all', data);
}
```

```typescript
// dailyViewStore.svelte.ts
await this.getOrCreateDailyNote(date, true);
queryCache.invalidateQuery('notes:all'); // Marks stale, auto-refetches
```

**Benefits:**
- Automatic refetching when stale
- Clear cache boundaries
- Can batch invalidations
- Familiar pattern if you know TanStack Query

### Option 3: Reactive Database Queries

Make stores directly reactive to database changes:

```typescript
// services/liveQuery.svelte.ts
class LiveQueryService {
  private watchers = new Map<string, Set<() => void>>();

  // Watch for changes to specific notes
  watchNotes(noteIds: string[], callback: () => void) {
    noteIds.forEach(id => {
      if (!this.watchers.has(id)) {
        this.watchers.set(id, new Set());
      }
      this.watchers.get(id)!.add(callback);
    });

    return () => {
      noteIds.forEach(id => this.watchers.get(id)?.delete(callback));
    };
  }

  // Notify when database changes
  notifyChange(noteId: string) {
    this.watchers.get(noteId)?.forEach(cb => cb());
  }
}
```

**Usage:**

```typescript
// noteStore.svelte.ts
$effect(() => {
  const unwatch = liveQuery.watchNotes(['all'], () => {
    loadAllNotes(); // Refetch when any note changes
  });
  return unwatch;
});
```

**Benefits:**
- Database is source of truth
- No manual synchronization
- Changes propagate automatically

### Option 4: Shared State with Optimistic Updates

Keep a single source of truth and update optimistically:

```typescript
// services/noteCache.svelte.ts
class NoteCache {
  private cache = $state<Map<string, NoteMetadata>>(new Map());

  // Optimistically add note
  addNote(note: NoteMetadata) {
    this.cache.set(note.id, note);
  }

  // Update note
  updateNote(noteId: string, updates: Partial<NoteMetadata>) {
    const existing = this.cache.get(noteId);
    if (existing) {
      this.cache.set(noteId, { ...existing, ...updates });
    }
  }

  // Get all notes
  getAllNotes() {
    return Array.from(this.cache.values());
  }
}

export const noteCache = new NoteCache();
```

**Usage:**

```typescript
// dailyViewStore.svelte.ts
const dailyNote = await this.getOrCreateDailyNote(date, true);
noteCache.addNote(dailyNote); // Immediately available everywhere
```

**Benefits:**
- Single source of truth
- Immediate UI updates
- No refresh needed
- Simple mental model

## Recommended Approach

I recommend a **hybrid of Options 1 and 4**:

1. **Message Bus for Events** - Use for signaling when things happen
2. **Shared Note Cache** - Single reactive Map of all notes
3. **No Manual Refreshes** - Stores subscribe to events and update cache

### Implementation Plan

#### Phase 1: Create Infrastructure
1. Create `messageBus.svelte.ts` with typed events
2. Create `noteCache.svelte.ts` with reactive Map
3. Add event publishing to all IPC handlers in main process

#### Phase 2: Migrate noteStore
1. Change `notesStore` to read from `noteCache`
2. Subscribe to message bus events
3. Update cache on events (no full refresh)
4. Remove `refresh()` method

#### Phase 3: Migrate Other Stores
1. Update `dailyViewStore` to publish events
2. Update `temporaryTabsStore` to read from cache
3. Update `pinnedStore` to read from cache
4. Remove all `notesStore.refresh()` calls

#### Phase 4: Add Backend Events
1. Make IPC handlers publish events
2. Consider WebSocket for real-time updates
3. Handle offline/sync scenarios

### Example Migration

**Before:**
```typescript
// dailyViewStore.svelte.ts
const dailyNote = await this.getOrCreateDailyNote(date, true);
const { notesStore } = await import('../services/noteStore.svelte');
await notesStore.refresh(); // 😞 Manual, slow, couples stores
```

**After:**
```typescript
// dailyViewStore.svelte.ts
const dailyNote = await this.getOrCreateDailyNote(date, true);
noteCache.addNote(dailyNote); // ✅ Immediate, automatic, decoupled
messageBus.publish({ type: 'note.created', noteId: dailyNote.id });
```

```typescript
// temporaryTabsStore.svelte.ts
let hydratedTabs = $derived(
  this.tabs.map(tab => ({
    ...tab,
    title: noteCache.getNote(tab.noteId)?.title || '' // ✅ Always up-to-date
  }))
);
```

## Benefits Summary

- ✅ No manual refresh calls
- ✅ Automatic UI updates
- ✅ Type-safe events
- ✅ Decoupled stores
- ✅ Granular updates (no full reload)
- ✅ Easy to debug (event log)
- ✅ Better performance (targeted updates)
- ✅ Clearer data flow

## Migration Effort

- **Phase 1**: ~2 hours (create infrastructure)
- **Phase 2**: ~4 hours (migrate noteStore)
- **Phase 3**: ~4 hours (migrate other stores)
- **Phase 4**: ~2 hours (backend events)
- **Total**: ~12 hours

## Alternative: Quick Fix

If full migration is too much right now, a simpler fix:

```typescript
// services/noteStore.svelte.ts
function addNote(note: NoteMetadata) {
  state.notes = [...state.notes, note];
}

function updateNote(noteId: string, updates: Partial<NoteMetadata>) {
  state.notes = state.notes.map(n =>
    n.id === noteId ? { ...n, ...updates } : n
  );
}
```

```typescript
// dailyViewStore.svelte.ts
const dailyNote = await this.getOrCreateDailyNote(date, true);
const { notesStore } = await import('../services/noteStore.svelte');
notesStore.addNote(dailyNote); // ✅ Targeted update instead of full refresh
```

This is better than `refresh()` but still has coupling issues.
