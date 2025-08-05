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

![all notes view](./figma/all-notes.png)

![inbox view](./figma/inbox.png)

### Actual Design Analysis

Based on the Figma mockups, the design features:

#### **Left Sidebar Structure**

The left sidebar contains:

1. **Header Section**
   - hamburger menu to show/hide left sidebar
   - vault switcher dropdown control

2. **System Navigation Section**
   - **Inbox**: opens in the main view a quick way to capture notes for later saving
   - **All notes**: opens in the main view a hierarchical browser showing organized note collections with collapsible sections ("Projects (1)", "Daily (3)")
   - **Search**: Global search functionality
   - **Settings**: Application configuration

3. **Pinned Notes Section**
   - Shows "Pinned" header with collapse indicator
   - Contains user-curated notes like "June 23rd, 2025" and "Flint UI"
   - Visual indicators for note types (daily note has calendar icon, project note has folder icon)

4. **Temporary Tabs Section**
   - Shows recently opened notes below a dotted separator line
   - "close all" link to clear temporary tabs
   - Individual notes listed with appropriate icons
   - Notes shown: Arc, JavaScript, 2025-W25, Year in review, "Terseness is not a replacemen..."

### Main View Design

The main view shows a clean, focused note editing interface:

#### **Header Controls**
- **Left side**: Note type selector dropdown (shows "daily" in mockup)
- **Right side**:
  - Information icon button
  - Trash/delete button
  - Additional action button (+ icon)

#### **Content Area**
- Large, prominent note title ("June 23rd, 2025")
- Full-width text editor with rich content
- Clean typography and generous spacing
- The mockup shows a daily journal entry with multiple paragraphs
- Auto-save functionality (not visible in UI but implied)
- Content includes inline links (like "GraphQL" which appears as a blue link)

### Right Sidebar (Contextual)

The right sidebar serves dual purposes based on user action:

#### **AI Assistant Mode**
The agent mockup shows a comprehensive AI assistant interface:

- **Header**: Shows current context with expand/collapse controls
- **Task Management Section**:
  - Expandable "create_notes" task with completion indicator
  - Shows completed tasks with checkmarks
  - Task details: "I've made the notes", followed by linked note references
- **AI Chat Interface**:
  - Clean conversation thread
  - User messages and AI responses
  - Support for [[wikilink]] syntax (shown in use)
  - Message input field at bottom: "Ask Flint anything, use [[ to link notes..."
- **Notes Discussed Section**:
  - Shows referenced notes with blue link styling
  - Examples: "Cache optimization", "June 23rd, 2025", "File systems can be used as external memory for agents"
- **Context Indicators**:
  - Shows which notes are currently being discussed
  - Visual connection between AI responses and note references

#### **Metadata Editor Mode**
- Toggle between AI and metadata modes via header controls
- Note metadata editing interface
- YAML frontmatter fields editing
- Tags, aliases, creation/modification dates
- Custom key-value pairs
- Real-time validation and error handling

## Responsive Behavior

Based on the mockups, the interface shows a three-column layout:

### Desktop Layout (as shown in mockups)
```
┌─────────────┬─────────────────────┬─────────────┐
│             │                     │             │
│ Left        │ Main Note View      │ Right       │
│ Sidebar     │                     │ Sidebar     │
│ (Navigation │ (Note Content)      │ (AI Agent)  │
│ & Tabs)     │                     │             │
│             │                     │             │
└─────────────┴─────────────────────┴─────────────┘
```

### Key Responsive Considerations
- The mockups show a fixed three-panel layout optimized for larger screens
- Left sidebar remains consistently sized across mockups
- Right sidebar toggles between hidden (main.png) and visible (agent.png)
- Content area adjusts width based on right sidebar visibility
- Clean separation between navigation, content, and AI assistance
- Mobile responsiveness would likely collapse sidebars or use overlay patterns

## Key Features & Interactions

### Navigation & Note Access

#### **System Views**
- **Inbox**: Shows as a clean interface with placeholder text for quick note capture
- **All notes**: Displays hierarchical organization with collapsible sections ("Projects (1)", "Daily (3)")
- **Search**: Integrated search functionality
- **Settings**: Configuration access

#### **Note Organization**
- **Pinned Notes**: Persistent favorites with appropriate icons (calendar for daily, folder for projects)
- **Temporary Tabs**: Recently accessed notes below dotted separator
- **Close All**: Link to clear temporary tab section
- **Visual Hierarchy**: Clear separation between permanent (pinned) and temporary notes

#### **Note Types & Icons**
- Daily notes: Calendar icon
- Project notes: Folder icon
- Regular notes: Document icon
- Consistent iconography throughout the interface

### AI Assistant Integration

#### **Task-Oriented Interface**
- **Task Management**: Expandable task sections with completion status
- **Progress Tracking**: Visual indicators for completed tasks (checkmarks)
- **Task Details**: Shows specific actions taken ("I've made the notes")
- **Linked References**: Tasks connect to specific notes via blue links

#### **Context Management**
- **Current Note Context**: Automatically included in conversations
- **Wikilink Support**: [[Note Title]] syntax for referencing additional notes
- **Notes Discussed**: Section showing all referenced notes in conversation
- **Visual Connection**: Clear relationship between AI responses and note references

#### **Chat Interface**
- **Message Input**: "Ask Flint anything, use [[ to link notes..." prompt
- **Conversation Flow**: Clean message threading
- **Note Linking**: Integrated [[wikilink]] syntax in conversations
- **Context Awareness**: AI responses reference and utilize note content

### Note Type & Interface Controls

#### **Header Controls**
- **Note Type Dropdown**: Shows "daily" in mockup, located in left sidebar header
- **Action Buttons**: Information, delete, and additional action controls in main view header
- **Sidebar Toggle**: Controls to switch between AI assistant and metadata editor modes
- **Visual Consistency**: Icons and controls follow consistent design language

#### **Content Management**
- **Rich Text Editing**: Support for formatted content with inline links
- **Auto-linking**: URLs like "GraphQL" automatically become clickable links
- **Clean Typography**: Clear hierarchy between title and content
- **Metadata Integration**: YAML frontmatter editing accessible via right sidebar toggle

## Implementation Phases

### Phase 1: Core Layout Architecture
**Goal**: Build the three-panel sidebar-based layout

**Key Components**:
- Replace existing tab navigation with left sidebar structure
- Implement main view with updated header controls
- Create right sidebar container with toggle functionality
- Build responsive three-column layout system
- Remove old TabNavigation.svelte and update App.svelte

### Phase 2: Left Sidebar Navigation
**Goal**: Implement complete left sidebar with system views and note organization

**Key Components**:
- System Views section (Inbox, All notes, Search, Settings)
- Inbox interface with quick capture placeholder
- All notes hierarchical browser with collapsible sections
- Pinned notes section with visual icons
- Temporary tabs section with "close all" functionality
- Proper note type iconography (calendar, folder, document icons)

### Phase 3: AI Assistant Integration
**Goal**: Build task-oriented AI assistant in right sidebar

**Key Components**:
- Task management interface with expandable sections
- Progress tracking with completion indicators
- Chat interface with [[wikilink]] support
- "Notes discussed" section with linked references
- Message input with context-aware prompting
- Thread management and conversation persistence

### Phase 4: Metadata Editor & Sidebar Modes
**Goal**: Add metadata editing mode and sidebar switching

**Key Components**:
- Toggle functionality between AI and metadata modes
- YAML frontmatter editing interface
- Real-time validation and error handling
- Custom field support (tags, aliases, dates)
- Seamless mode switching with state preservation

### Phase 5: Enhanced Note Management
**Goal**: Complete the temporary tab system and note organization

**Key Components**:
- Arc-style temporary tab behavior
- Auto-population from search results and wikilinks
- Individual tab close buttons and bulk actions
- Active note indication and visual hierarchy
- Note opening workflow integration

### Phase 6: Polish & Performance
**Goal**: Refinement and production readiness

**Key Components**:
- Keyboard shortcuts for major actions
- Smooth animations and transitions
- Performance optimizations for large note collections
- Advanced search filters and functionality
- Accessibility improvements and testing

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
- `RightSidebar.svelte` - Container for AI/Metadata modes with toggle functionality
- `ThreadManager.svelte` - Thread creation and switching
- `MetadataEditor.svelte` - YAML frontmatter editing interface

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

### Direct Implementation Approach

Since we're moving to a fundamentally different layout paradigm, the implementation will directly replace the existing tab-based system with the new sidebar architecture.

### Data Migration Plan

#### Automatic Compatibility
- **Pinned Notes**: Existing `pinnedNotesStore` (localStorage) requires no changes
- **Model Settings**: `modelStore` preserved without modification
- **Application Settings**: `settingsStore` enhanced with new sidebar preferences
- **Note Data**: `notesStore` unchanged - full compatibility maintained

#### Required Migrations

**Chat History to Threads**:
```typescript
// Convert existing messages array to thread-based structure
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

**Component Transition Plan**:
1. Create new stores (`temporaryTabsStore.svelte.ts`, `aiThreadsStore.svelte.ts`, `sidebarState.svelte.ts`)
2. Build new components alongside existing ones
3. Update `App.svelte` to use new three-panel layout
4. Remove `TabNavigation.svelte` and update all references
5. Enhance `ChatView.svelte` with task management and threading
6. Integrate new sidebar components with existing note management

## Conclusion

This sidebar-based redesign transforms Flint into a more intuitive and scalable note-taking application while preserving its agent-first philosophy. The clear separation of navigation (left sidebar), content (main view), and context (right sidebar) creates a more organized and efficient workflow. The temporary tab system provides Arc-like navigation efficiency, while the enhanced AI integration maintains Flint's core strength as an intelligent note-taking assistant.

The responsive design ensures the interface works seamlessly across all device sizes, and the phased implementation approach allows for careful testing and user feedback throughout the development process.
