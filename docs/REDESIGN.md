# Flint GUI Design Document - Sidebar-Based Architecture

## Executive Summary

This document outlines a complete redesign of the Flint GUI, moving from a tab-based interface to a sidebar-based architecture inspired by modern note-taking applications. The new design features a left sidebar for navigation and note management, a clean main view focused on text editing, and a contextual right sidebar for AI assistance and metadata. This approach maintains Flint's agent-first philosophy while providing a more intuitive and scalable interface.

## Design Principles

### 1. **Sidebar-First Navigation**
- Left sidebar serves as the primary navigation hub
- System views (Inbox, All notes, Search, Settings) replace tab-based navigation
- Persistent access to pinned notes and temporary open tabs

### 2. **Clean, Minimal Main View**
- Main area dedicated to note content with minimal distractions
- Title displayed prominently but cleanly
- Focus on text editing with contextual controls

### 3. **Contextual Right Sidebar**
- AI assistant integration with conversation history
- Note metadata editing when needed
- Responsive behavior based on screen size

### 4. **Agent-First Interaction**
- AI assistant remains central to the workflow
- Natural language commands and note linking
- Contextual note inclusion in conversations

## Core Interface Layout

![main interface](./figma/main.png)

![interface with sidebar open](./figma/agent.png)

### Left Sidebar Structure

The left sidebar is divided into three main sections:

#### **System Views Section**
- **Inbox**: Captures new notes and quick thoughts
- **All notes**: Hierarchical view of the entire note collection
- **Search**: Global search across all notes and content
- **Settings**: Application configuration and preferences

#### **Pinned Notes Section**
- User-curated list of frequently accessed notes
- Pin/unpin functionality from note editor
- Persistent across sessions
- Visual pin indicators

#### **Temporary Open Tabs Section**
- Dynamic list of recently opened notes (similar to Arc browser tabs)
- Automatically populated when notes are opened via:
  - Search results
  - Note links ([[wikilinks]])
  - Direct navigation
- Individual close buttons (appear on hover)
- "Close all" button to clear all temporary tabs
- Automatic cleanup (future: 24-hour expiration)

### Main View Design

The main view focuses entirely on note content with minimal UI chrome:

#### **Header Controls**
- **Left side**: Note type selector dropdown (general, meeting, project, etc.)
- **Right side**:
  - AI assistant toggle button
  - Metadata view toggle button

#### **Content Area**
- Clean note title display
- Full-width text editor (CodeMirror)
- Minimal distractions to focus on writing
- Auto-save functionality (500ms debounce)

### Right Sidebar (Contextual)

The right sidebar serves dual purposes based on user action:

#### **AI Assistant Mode**
- Chat interface for conversing with AI
- Current note automatically included as context
- Support for [[wikilink]] syntax to include additional notes
- "Notes discussed" section showing AI-referenced/modified notes
- Thread management:
  - "New thread" button for fresh conversations
  - "Old threads" button to access conversation history
  - Global thread scope (not per-note)

#### **Metadata Editor Mode**
- Note metadata editing interface
- YAML frontmatter fields
- Tags, aliases, creation/modification dates
- Custom key-value pairs

## Responsive Behavior

### Large Screens (>1200px)
```
┌─────────────┬─────────────────────┬─────────────┐
│             │                     │             │
│ Left        │ Main Note View      │ Right       │
│ Sidebar     │                     │ Sidebar     │
│             │                     │ (AI/Meta)   │
│             │                     │             │
└─────────────┴─────────────────────┴─────────────┘
```

### Medium Screens (768-1200px)
```
┌─────────────┬─────────────────────┐
│             │                     │
│ Left        │ Main Note View      │
│ Sidebar     │                     │
│             │ (Right sidebar      │
│             │  overlays when      │
│             │  activated)         │
└─────────────┴─────────────────────┘
```

### Small Screens (<768px)
```
┌─────────────────────────────────────┐
│                                     │
│ Main Note View                      │
│ (Full screen)                       │
│                                     │
│ (Sidebars slide in from edges      │
│  when activated)                    │
└─────────────────────────────────────┘
```

## Key Features & Interactions

### Note Opening & Tab Management

#### **Opening Notes**
- **From Search**: Search results open notes in main view and add to temporary tabs
- **From Wikilinks**: Clicking [[Note Title]] opens note and adds to temporary tabs
- **From Pinned**: Clicking pinned notes opens in main view (doesn't add to temporary tabs)
- **From System Views**: Browsing and selecting notes adds them to temporary tabs

#### **Tab Behavior**
- Temporary tabs appear in chronological order (most recent at top)
- Hover to reveal individual close button (×)
- "Close all" button clears entire temporary tab section
- Future: Automatic 24-hour cleanup of unused tabs
- Visual indication of currently active note

### AI Assistant Integration

#### **Context Management**
- Current note automatically included in AI conversations
- Use [[Note Title]] syntax to reference additional notes
- AI responses can reference and modify notes
- "Notes discussed" section tracks AI-touched notes

#### **Thread Management**
- Global conversation threads (not tied to specific notes)
- "New thread" creates fresh conversation context
- "Old threads" provides access to conversation history
- Thread persistence across sessions

#### **Responsive AI Sidebar**
- **Large screens**: Fixed right sidebar
- **Medium screens**: Overlay on main content
- **Small screens**: Full-screen takeover

### Note Type & Metadata

#### **Note Type Selection**
- Dropdown in main view header (left side)
- Dynamic list from Flint Note API
- Affects note templates and organization
- Visual indicators for different note types

#### **Metadata Editing**
- Toggle button in main view header (right side)
- Replaces AI sidebar when activated
- YAML frontmatter editing
- Real-time validation and error handling

## Implementation Phases

### Phase 1: Sidebar Architecture Foundation
**Goal**: Implement the basic three-panel layout with responsive behavior

**Key Components**:
- Left sidebar with collapsible sections
- Main view container with header controls
- Right sidebar with toggle functionality
- Responsive breakpoint handling
- Basic navigation between system views

### Phase 2: System Views Implementation
**Goal**: Replace tab-based navigation with sidebar system views

**Key Components**:
- Inbox view for quick note capture
- All notes hierarchical browser
- Global search interface
- Settings panel integration
- Remove existing tab navigation

### Phase 3: Temporary Tab System
**Goal**: Implement Arc-style temporary note tabs

**Key Components**:
- Dynamic tab list in left sidebar
- Auto-population when notes are opened
- Individual and bulk close functionality
- Visual active note indication
- Tab ordering and management

### Phase 4: Enhanced AI Assistant
**Goal**: Integrate AI assistant into right sidebar with context management

**Key Components**:
- Chat interface in right sidebar
- Automatic current note context inclusion
- [[wikilink]] syntax for additional context
- "Notes discussed" tracking
- Thread management system

### Phase 5: Metadata Editor Integration
**Goal**: Implement metadata editing in right sidebar

**Key Components**:
- Toggle between AI and metadata modes
- YAML frontmatter editing interface
- Real-time validation
- Custom field support

### Phase 6: Polish & Advanced Features
**Goal**: Refinement and advanced functionality

**Key Components**:
- Keyboard shortcuts for all major actions
- Drag-and-drop note organization
- Advanced search filters
- Performance optimizations
- Accessibility improvements

## Technical Architecture

### State Management
- **Svelte 5 Runes**: Reactive state for all UI components
- **Global Stores**:
  - `sidebarState`: Left/right sidebar visibility and content
  - `temporaryTabs`: Dynamic list of open notes
  - `pinnedNotes`: User-curated pinned notes (existing - localStorage)
  - `aiThreads`: Conversation history and context
  - `currentNote`: Active note and metadata
  - `notesStore`: Existing note management (already using runes)
  - `modelStore`: AI model selection (existing)
  - `settingsStore`: Application settings (existing)

### New Store Implementations Required

#### Temporary Tabs Store (`temporaryTabsStore.svelte.ts`)
```typescript
interface TemporaryTab {
  id: string;
  noteId: string;
  title: string;
  openedAt: Date;
  lastAccessed: Date;
  source: 'search' | 'wikilink' | 'navigation';
}

interface TemporaryTabsState {
  tabs: TemporaryTab[];
  activeTabId: string | null;
  maxTabs: number; // Default: 10
  autoCleanupHours: number; // Default: 24
}
```

**Key Features:**
- Chronological ordering (most recent first)
- Automatic cleanup of unused tabs after 24 hours
- Source tracking for analytics and behavior
- Persistence across sessions (localStorage)
- Integration with wikilink navigation and search results

#### AI Threads Store (`aiThreadsStore.svelte.ts`)
```typescript
interface AIThread {
  id: string;
  title: string;
  messages: Message[];
  notesDiscussed: string[]; // Note IDs referenced in conversation
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

interface AIThreadsState {
  threads: AIThread[];
  activeThreadId: string | null;
  maxThreads: number; // Default: 50
}
```

**Key Features:**
- Global thread scope (not per-note)
- Automatic note context tracking via [[wikilink]] syntax
- Thread persistence across sessions
- "Notes discussed" tracking and visualization
- Thread archiving and cleanup

#### Sidebar State Store (`sidebarState.svelte.ts`)
```typescript
interface SidebarState {
  leftSidebar: {
    visible: boolean;
    width: number;
    activeSection: 'system' | 'pinned' | 'tabs';
  };
  rightSidebar: {
    visible: boolean;
    width: number;
    mode: 'ai' | 'metadata';
  };
  layout: 'single-column' | 'three-column';
  breakpoint: number;
}
```

**Key Features:**
- Responsive behavior consolidation
- Sidebar visibility and sizing management
- Layout mode switching logic
- Persistence of user preferences

### Component Structure
```
App.svelte
├── LeftSidebar.svelte
│   ├── SystemViews.svelte
│   ├── PinnedNotes.svelte
│   └── TemporaryTabs.svelte
├── MainView.svelte
│   ├── NoteHeader.svelte
│   └── NoteEditor.svelte
└── RightSidebar.svelte
    ├── AIAssistant.svelte
    └── MetadataEditor.svelte
```

### Search Integration Architecture

#### Enhanced Search Workflow
The existing `SearchBar` component needs integration with the new sidebar architecture:

**Current State:**
- `SearchBar.svelte` exists with `onNoteSelect` callback
- Basic search functionality implemented

**Required Enhancements:**
1. **Search Results → Temporary Tabs**: Search results automatically add notes to temporary tabs
2. **Search State Management**: Global search state for recent searches, filters, and results
3. **Search Context Integration**: Search within AI conversations and note content
4. **Advanced Filtering**: By note type, tags, creation date, modification date

**Implementation Requirements:**
```typescript
interface SearchState {
  query: string;
  results: NoteMetadata[];
  filters: {
    noteTypes: string[];
    tags: string[];
    dateRange: { start?: Date; end?: Date };
  };
  recentSearches: string[];
  isSearching: boolean;
}
```

### Component Refactoring Requirements

#### Current Components to Modify

**App.svelte (Major Refactor)**
- Remove existing responsive layout logic (lines 112-143)
- Replace tab-based navigation with sidebar architecture
- Integrate new store dependencies
- Update event handling for sidebar interactions

**TabNavigation.svelte → LeftSidebar.svelte**
- Convert from horizontal tabs to vertical sidebar sections
- Add system views (Inbox, All notes, Search, Settings)
- Integrate pinned notes and temporary tabs sections
- Add collapsible section headers

**ChatView.svelte → Enhanced with Thread Management**
- Add thread switching interface
- Implement "Notes discussed" visualization
- Add thread history navigation
- Update message handling for multi-thread context

**New Components Required:**
- `SystemViews.svelte` - Inbox, All notes, Search interfaces
- `TemporaryTabs.svelte` - Dynamic tab list with close buttons
- `RightSidebar.svelte` - Container for AI/Metadata modes
- `ThreadManager.svelte` - Thread creation and switching
- `MetadataEditor.svelte` - YAML frontmatter editing

#### Existing Components to Preserve
- `NoteEditor.svelte` - Works in new right sidebar context
- `PinnedView.svelte` - Integrates into left sidebar
- `NotesView.svelte` - Becomes part of "All notes" system view
- `Settings.svelte` - Moves to system views section

### Data Flow
1. **Note Opening**: Search/Navigation → Add to temporary tabs → Update main view → Track in temporary tabs store
2. **AI Interaction**: User message → Include current note context → Process [[links]] → Update "Notes discussed" → Track in AI threads store
3. **Metadata Editing**: Toggle metadata mode → Load note frontmatter → Real-time sync → Update notes store
4. **Temporary Tab Management**: Auto-cleanup → Source tracking → Persistence → Integration with wikilinks
5. **Thread Management**: Thread switching → Context preservation → Note reference tracking → Persistence

## Success Metrics

### User Experience
- Reduced clicks to access frequently used notes
- Faster note navigation and discovery
- Improved AI conversation context management
- Seamless responsive behavior across devices

### Performance
- Sub-200ms note switching
- Smooth sidebar animations (60fps)
- Efficient memory usage for temporary tabs
- Fast search and filtering

## Migration Strategy

### Technical Migration Plan

#### Phase 1: Infrastructure Setup
**Goal**: Prepare foundation without breaking existing functionality

**Technical Tasks:**
1. Create new store files (`temporaryTabsStore.svelte.ts`, `aiThreadsStore.svelte.ts`, `sidebarState.svelte.ts`)
2. Implement feature flag in `settingsStore.svelte.ts`:
   ```typescript
   interface SettingsState {
     // ... existing settings
     enableSidebarLayout: boolean; // Default: false
   }
   ```
3. Add conditional rendering in `App.svelte` to switch between layouts
4. Create new component files without removing existing ones

#### Phase 2: Parallel Implementation
**Goal**: Build new sidebar system alongside existing tab system

**Technical Tasks:**
1. Implement `LeftSidebar.svelte` with system views
2. Create `RightSidebar.svelte` container
3. Build new components (`TemporaryTabs.svelte`, `ThreadManager.svelte`, etc.)
4. Update responsive layout logic in new sidebar context
5. Feature flag allows users to opt-in to new layout

#### Phase 3: Data Migration & Integration
**Goal**: Ensure seamless data transition

**Technical Tasks:**
1. **Pinned Notes Migration**: Existing `pinnedNotesStore` already uses localStorage - no migration needed
2. **Chat History Migration**: 
   ```typescript
   // Migrate existing messages array to thread format
   function migrateMessagesToThreads(messages: Message[]): AIThread {
     return {
       id: 'migrated-thread-' + Date.now(),
       title: 'Imported Conversation',
       messages,
       notesDiscussed: extractNotesFromMessages(messages),
       createdAt: new Date(messages[0]?.timestamp || Date.now()),
       lastActivity: new Date(),
       isActive: true
     };
   }
   ```
3. **Settings Preservation**: All existing settings in `settingsStore` preserved
4. **Search History**: Extract from existing search implementations

#### Phase 4: Component Refactoring
**Goal**: Update existing components to work with new architecture

**Technical Tasks:**
1. Refactor `App.svelte`:
   - Remove lines 112-143 (existing responsive logic)
   - Replace `layoutMode` state with `sidebarState` store
   - Update event handlers for sidebar interactions
2. Convert `TabNavigation.svelte` to `LeftSidebar.svelte`
3. Enhance `ChatView.svelte` with thread management
4. Update `SearchBar.svelte` integration with temporary tabs

#### Phase 5: Legacy Cleanup
**Goal**: Remove old tab-based system

**Technical Tasks:**
1. Remove feature flag and old layout code
2. Delete `TabNavigation.svelte`
3. Clean up unused responsive layout logic
4. Update component imports and references
5. Remove old state management code

### Data Preservation Strategy

#### Automatic Migrations
- **Pinned Notes**: Already stored in localStorage with key `flint-pinned-notes` - direct compatibility
- **Model Settings**: Existing `modelStore` preserved without changes
- **Application Settings**: Existing `settingsStore` enhanced with new sidebar preferences
- **Note Data**: Existing `notesStore` unchanged - full compatibility

#### Manual Migration Required
- **Chat Messages**: Convert single message array to thread-based structure
- **Search Preferences**: Extract and migrate to new search state management
- **Layout Preferences**: Convert existing responsive preferences to sidebar state

#### Rollback Strategy
- Feature flag allows instant rollback to tab-based layout
- All migrated data preserved in new format
- Original data structures maintained during transition period
- Database/storage changes are additive, not destructive

### Feature Flag Implementation
```typescript
// In App.svelte
let useSidebarLayout = $derived(settingsStore.enableSidebarLayout);

// Conditional layout rendering
{#if useSidebarLayout}
  <!-- New sidebar layout -->
  <LeftSidebar />
  <MainView />
  <RightSidebar />
{:else}
  <!-- Existing tab layout -->
  <TabNavigation />
  <!-- ... existing layout -->
{/if}
```

## Conclusion

This sidebar-based redesign transforms Flint into a more intuitive and scalable note-taking application while preserving its agent-first philosophy. The clear separation of navigation (left sidebar), content (main view), and context (right sidebar) creates a more organized and efficient workflow. The temporary tab system provides Arc-like navigation efficiency, while the enhanced AI integration maintains Flint's core strength as an intelligent note-taking assistant.

The responsive design ensures the interface works seamlessly across all device sizes, and the phased implementation approach allows for careful testing and user feedback throughout the development process.
