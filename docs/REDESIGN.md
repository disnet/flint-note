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
  - `pinnedNotes`: User-curated pinned notes
  - `aiThreads`: Conversation history and context
  - `currentNote`: Active note and metadata

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

### Data Flow
1. **Note Opening**: Search/Navigation → Add to temporary tabs → Update main view
2. **AI Interaction**: User message → Include current note context → Process [[links]] → Update "Notes discussed"
3. **Metadata Editing**: Toggle metadata mode → Load note frontmatter → Real-time sync

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

### From Current Design
1. **Phase 1**: Implement new layout alongside existing tabs
2. **Phase 2**: Feature flag to toggle between old/new interfaces
3. **Phase 3**: Migrate user preferences and pinned notes
4. **Phase 4**: Remove legacy tab-based navigation
5. **Phase 5**: Full deployment of new sidebar architecture

### Data Preservation
- Existing pinned notes migrate to new pinned section
- Chat history preserved in new thread system
- Note editor preferences and settings maintained
- Search history and preferences carried forward

## Conclusion

This sidebar-based redesign transforms Flint into a more intuitive and scalable note-taking application while preserving its agent-first philosophy. The clear separation of navigation (left sidebar), content (main view), and context (right sidebar) creates a more organized and efficient workflow. The temporary tab system provides Arc-like navigation efficiency, while the enhanced AI integration maintains Flint's core strength as an intelligent note-taking assistant.

The responsive design ensures the interface works seamlessly across all device sizes, and the phased implementation approach allows for careful testing and user feedback throughout the development process.
