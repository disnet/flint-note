# Action Bar Implementation Plan

## Overview

The Action Bar is a unified command interface that replaces the previous search bar. It provides three modes of interaction:

1. **Search Mode** (default) - Full-text search over notes
2. **Actions Mode** (`/` prefix) - VS Code-like command palette
3. **Agent Mode** (`@` prefix) - AI-powered conversations

## Current Status

### Completed

#### Phase 1-2: Search Mode
- [x] Created `ActionBar.svelte` component (replaced `SearchBar.svelte`)
- [x] Centered the bar in the toolbar with proper drag region handling
- [x] Integrated FTS5 full-text search backend
- [x] Client-side title filtering for immediate results
- [x] Merged results with title matches prioritized over content-only matches
- [x] Debounced API calls (200ms)
- [x] Loading state handling without UI flashing
- [x] Keyboard navigation (Arrow keys, Ctrl+N/P, Enter, Escape)
- [x] Changed shortcut from Cmd+O to Cmd+K (both menu-definitions.ts and menu.ts)

#### Phase 3: Actions Mode
- [x] Created `actionRegistry.svelte.ts` service
- [x] Registered all menu actions (File, Edit, View, Note, Help menus)
- [x] Added navigation actions with descriptions (Inbox, Daily, Review, Settings)
- [x] `/` prefix detection switches to actions mode
- [x] Fuzzy search over action labels, descriptions, and categories
- [x] Display keyboard shortcuts for each action
- [x] Execute actions on selection
- [x] Initialized registry in App.svelte with menu action handler

#### Phase 4: Agent Mode (Placeholder)
- [x] `@` prefix detection switches to agent mode
- [x] Placeholder UI ("Agent mode coming soon...")
- [x] Mode icon changes based on current mode

#### UI Polish
- [x] Mode toggle buttons in dropdown footer (Search, /, @)
- [x] Active mode highlighting
- [x] Consistent styling across all modes

### Files Modified/Created

| File | Status | Description |
|------|--------|-------------|
| `src/renderer/src/components/ActionBar.svelte` | Created | Main action bar component |
| `src/renderer/src/components/SearchBar.svelte` | Deleted | Replaced by ActionBar |
| `src/renderer/src/services/actionRegistry.svelte.ts` | Created | Action registry service |
| `src/renderer/src/App.svelte` | Modified | Imports ActionBar, initializes registry |
| `src/shared/menu-definitions.ts` | Modified | Changed Find shortcut to Cmd+K |
| `src/main/menu.ts` | Modified | Changed Find accelerator to Cmd+K |

## Next Steps

### Phase 5: Agent Mode Implementation

The agent mode currently shows a placeholder. Full implementation requires:

#### 5.1 Basic Agent Integration
- [ ] Connect to existing AI service (`src/main/ai-service.ts`)
- [ ] Create agent conversation state management
- [ ] Handle Enter key to submit agent queries
- [ ] Display agent responses in the dropdown

#### 5.2 Agent UI
- [ ] Streaming response display
- [ ] Message history within session
- [ ] Loading/thinking indicator
- [ ] Error handling and display

#### 5.3 Agent Capabilities
- [ ] Context awareness (current note, selected text)
- [ ] Action suggestions from agent responses
- [ ] Quick actions (e.g., "create note about X")

### Phase 6: Enhanced Actions

#### 6.1 Dynamic Actions
- [ ] Context-aware actions (based on current view/selection)
- [ ] Recently used actions section
- [ ] Action favorites/pinning

#### 6.2 Custom Actions
- [ ] User-defined actions
- [ ] Plugin/extension action registration
- [ ] Workspace-specific actions

### Phase 7: Advanced Search

#### 7.1 Search Enhancements
- [ ] Search filters (type:, tag:, date:, etc.)
- [ ] Search history
- [ ] Saved searches

#### 7.2 Search Results
- [ ] Preview panel for search results
- [ ] Batch operations on search results
- [ ] Export search results

### Phase 8: Keyboard Shortcuts

- [ ] Show all shortcuts mode (like VS Code's Cmd+K Cmd+S)
- [ ] Shortcut customization
- [ ] Conflict detection

## Architecture Notes

### Action Registry

The action registry (`actionRegistry.svelte.ts`) provides:

```typescript
interface Action {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  category: 'file' | 'edit' | 'view' | 'note' | 'workspace' | 'help' | 'navigation' | 'custom';
  execute: () => void | Promise<void>;
  isEnabled?: () => boolean;
  isVisible?: () => boolean;
}
```

Key functions:
- `registerAction(action)` - Register a new action
- `unregisterAction(id)` - Remove an action
- `searchActions(query)` - Fuzzy search actions
- `initializeRegistry(handler)` - Initialize with menu action handler

### Mode Detection

Mode is derived from input value prefix:
- No prefix → Search mode
- `/` prefix → Actions mode
- `@` prefix → Agent mode

The actual query (for search/filter) strips the prefix.

### Integration Points

1. **Menu System**: Actions are created from `menu-definitions.ts`
2. **Note Store**: Search accesses `notesStore.notes` for quick results
3. **API Layer**: FTS search via `window.api.searchNotes()`
4. **Event System**: Custom events for action execution (`execute-action`)

## Design Decisions

### Why unified bar instead of separate interfaces?

- Reduces cognitive load - one place for all commands
- Consistent keyboard-first experience
- Familiar pattern (VS Code, Spotlight, Alfred)
- Easier to discover features through search

### Why prefix-based mode switching?

- No mode switching UI needed in default state
- Natural typing flow (just add prefix)
- Easy to remember (/ for commands is common)
- Can still use toggle buttons for discoverability

### Why keep sidebar agent separate?

- Different use cases: quick queries vs. extended conversations
- Action bar agent for quick, contextual help
- Sidebar agent for longer research/writing sessions
- Users may want both visible simultaneously
