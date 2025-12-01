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

#### Phase 4.5: Empty State & Immediate Feedback

- [x] Dropdown shows immediately on focus (no typing required)
- [x] Unified visual design - input and dropdown appear as one connected element
- [x] Mode switcher entries in empty state:
  - "Search Actions & Commands" (switches to `/` mode)
  - "Chat with Agent" (switches to `@` mode)
- [x] Recent Notes section shows most recently opened notes (from navigation history)
- [x] Keyboard navigation includes mode switchers (up/down arrows, Ctrl+N/P)
- [x] Selection starts on first recent note, up arrow moves to mode switchers
- [x] Enter on mode switcher activates that mode
- [x] Input blurs on selection (closes dropdown)
- [x] Selection resets correctly when re-opening action bar

### Files Modified/Created

| File                                                       | Status   | Description                               |
| ---------------------------------------------------------- | -------- | ----------------------------------------- |
| `src/renderer/src/components/ActionBar.svelte`             | Created  | Main action bar component                 |
| `src/renderer/src/components/SearchBar.svelte`             | Deleted  | Replaced by ActionBar                     |
| `src/renderer/src/services/actionRegistry.svelte.ts`       | Created  | Action registry service                   |
| `src/renderer/src/stores/navigationHistoryStore.svelte.ts` | Modified | Added `getRecentNotes()` for recent notes |
| `src/renderer/src/App.svelte`                              | Modified | Imports ActionBar, initializes registry   |
| `src/shared/menu-definitions.ts`                           | Modified | Changed Find shortcut to Cmd+K            |
| `src/main/menu.ts`                                         | Modified | Changed Find accelerator to Cmd+K         |

#### Phase 5: Agent Mode Integration (Complete)

| File                                           | Status   | Description                                                               |
| ---------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `src/renderer/src/components/ActionBar.svelte` | Modified | Inline streaming, thread reuse for follow-ups, Open in Agent panel button |
| `src/renderer/src/App.svelte`                  | Modified | Added `handleOpenAgentPanel` to open sidebar with active thread           |

**How it works:**

1. User types `@` in ActionBar to enter agent mode
2. User types their question and presses Enter
3. User message is added to local conversation state (not synced to Agent panel yet)
4. Message is sent via streaming API with a local conversation ID
5. Response streams inline in the ActionBar dropdown (full scrollable history)
6. User can type follow-up messages that continue in the same conversation
7. When user presses `Cmd+Enter`, conversation is pushed to `unifiedChatStore` and Agent panel opens
8. Conversation stays completely local until explicitly opened in Agent panel

**Keyboard shortcuts in agent mode:**

- `Enter` - Send message to agent (shows response inline, allows follow-ups)
- `Cmd/Ctrl+Enter` - Push conversation to Agent panel and open it (closes action bar)
- `Tab` - Same as Cmd+Enter
- `Escape` - Close and reset conversation (discards local conversation)

## Next Steps

### Phase 5: Agent Mode Implementation (Completed)

Agent mode has been fully implemented with inline streaming responses and thread management.

#### 5.1 Basic Agent Integration (Completed)

- [x] Connect to existing AI service (`src/main/ai-service.ts`)
- [x] Create agent conversation state management (uses `unifiedChatStore`)
- [x] Handle Enter key to submit agent queries
- [x] Create and persist threads for each conversation

#### 5.2 Agent UI (Completed)

- [x] Inline streaming response display in ActionBar dropdown
- [x] User message display with "You" label
- [x] Agent response display with streaming text
- [x] Loading indicator with animated dots
- [x] Error state display
- [x] Follow-up messages in same thread (reuses existing thread)
- [x] "Open in Agent panel" button with keyboard shortcuts (Cmd+Enter, Tab)

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
  category:
    | 'file'
    | 'edit'
    | 'view'
    | 'note'
    | 'workspace'
    | 'help'
    | 'navigation'
    | 'custom';
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

### Empty State Behavior

When the action bar is focused with no input:

1. **Mode Switchers** - Two selectable entries at the top:
   - "Search Actions & Commands" → sets input to `/`
   - "Chat with Agent" → sets input to `@`
2. **Recent Notes** - Up to 5 most recently opened notes from `navigationHistoryStore`
3. **Keyboard Navigation** - All items are navigable; selection starts on first recent note

The `allSelectableItems` derived combines mode switchers and recent notes into a unified list for keyboard navigation.

### Integration Points

1. **Menu System**: Actions are created from `menu-definitions.ts`
2. **Note Store**: Search accesses `notesStore.notes` for quick results
3. **API Layer**: FTS search via `window.api.searchNotes()`
4. **Navigation History**: Recent notes from `navigationHistoryStore.getRecentNotes()`
5. **Event System**: Custom events for action execution (`execute-action`)

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
