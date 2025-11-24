# Flint GUI Design Document

## Executive Summary

This document describes the current architecture and design of the Flint GUI, a comprehensive note-taking and knowledge management system built with Svelte 5 and Electron. The application features a three-column layout with multi-workspace navigation, intelligent note editing with AI assistance, and a unique spaced repetition review system. The design maintains Flint's agent-first philosophy while providing powerful organizational features including workspaces, daily journals, workflow automation, and a flexible notes shelf for quick reference. The interface adapts seamlessly across different screen sizes and provides enterprise-grade features for professional knowledge workers.

## Current Architecture

### Core Layout System

The application uses a responsive three-column grid layout with a custom title bar and integrated workspace management:

```
Desktop Layout (>1400px) with Custom Title Bar:
┌─────────────────────────────────────────────────────────┐
│ Custom Title Bar (Window Controls + Vault + AI Toggle) │
├─────────────────────────────────────────────────────────┤
│ Left Sidebar    │ Main View        │ Right Sidebar      │
│ (200-600px)     │ (Flexible)       │ (300-800px)        │
│                 │                  │                    │
│ System Views:   │ System Views:    │ AI Mode:           │
│ • Inbox (badge) │ • InboxView      │ • Thread-based AI  │
│ • Daily         │ • DailyView      │ • Tool calls       │
│ • Review (badge)│ • ReviewView     │ • Context widget   │
│ • Routines      │ • WorkflowView   │ • Todo monitor     │
│ • Note Types    │ • NotesView      │ • Model selector   │
│ • Settings      │ • Settings       │                    │
│                 │                  │ Notes Shelf Mode:  │
│ Workspace:      │ Note Editor:     │ • Multi-note panel │
│ • Pinned Notes  │ • Editor header  │ • Quick reference  │
│ • Temp Tabs     │ • CodeMirror     │ • Preview/Edit     │
│                 │ • Metadata       │                    │
│ Workspace Bar   │ • Backlinks      │                    │
└─────────────────────────────────────────────────────────┘

Mobile Layout (<768px):
┌─────────────────────────┐
│ Custom Title Bar        │
├─────────────────────────┤
│ Main View (Full Width)  │
│ Sidebars as overlays    │
└─────────────────────────┘
```

## Component Architecture

### Primary Components

**App.svelte** (1,558 lines) - Root application component with comprehensive state management

- Custom title bar with platform-specific window controls and vault switcher
- Three-column responsive grid layout with resizable sidebars (200-600px left, 300-800px right)
- Global keyboard shortcuts (Ctrl+Shift+N for new note, Ctrl+O for search, browser-style back/forward navigation)
- Event forwarding from main process (note open, workflow execute, review trigger)
- Vault initialization and switching with multi-vault support
- Navigation history management (back/forward with Cmd+[ and Cmd+])
- Menu integration for macOS/Windows with context-aware actions
- Message bus for cross-component communication

**LeftSidebar.svelte** (245 lines) - Multi-workspace navigation hub

- **System Views** (6 permanent navigation items):
  - Inbox with unprocessed count badge
  - Daily journal with calendar icon
  - Review with due items count badge
  - Routines (workflow automation)
  - Note Types (schema browser)
  - Settings (API keys, themes, models)

- **Workspace Content** (with slide animation on workspace switch):
  - `PinnedNotes` component (928 lines) with drag & drop reordering, context menus, multi-workspace support
  - `TemporaryTabs` component (971 lines) with session-based auto-close, source tracking, drag & drop

- **WorkspaceBar** (bottom) - Workspace switcher with create/edit/delete functionality
- Resizable (200-600px), collapsible sections, auto-scroll to active item

**MainView.svelte** (396 lines) - Dynamic view container with six system views and note editor

- **System Views**:
  - `InboxView` - Quick capture system with process/unprocess functionality
  - `DailyView` - Week-based journal with daily note creation and timeline
  - `ReviewView` - Spaced repetition system with AI prompts, ratings, stats, and history
  - `WorkflowManagementView` - Automation with workflow creation, execution, and backlog management
  - `NotesView` - Note type browser with grid layout and type management
  - `Settings` - Configuration for API keys, themes, models, and custom functions

- **NoteEditor** - Rich markdown editor with:
  - `EditorHeader` - Emoji picker, title editing, type selection, pin/metadata/preview toggles
  - `CodeMirrorEditor` - Wikilink autocomplete, live preview, cursor persistence
  - `MetadataView` - Frontmatter editing with validation
  - `Backlinks` - Reverse link panel
  - Action bar - Archive, review toggle, pin, add to shelf buttons

**RightSidebar.svelte** (147 lines) - Dual-mode contextual panel

- **AI Mode** - `Agent` component with:
  - Thread-based conversations with conversation history
  - Streaming responses with real-time updates
  - Tool call visualization grouped by step
  - Context usage widget with token tracking
  - Todo plan monitoring from AI tasks
  - Model selector and thread management
  - Draft persistence per thread
  - Message cancellation support

- **Notes Shelf Mode** - `NotesShelf` component with:
  - Multiple notes open simultaneously for quick reference
  - Markdown preview and edit modes
  - Individual note close or clear all functionality
  - Shift+click from anywhere to add notes to shelf

- Resizable (300-800px), mode toggle persistence, visibility toggle

### Component Catalog

The application includes 82 components totaling over 32,000 lines of code, organized by functionality:

**Core Layout (4 components):**

- App.svelte (1,558 lines) - Main application shell
- LeftSidebar.svelte (245 lines) - Navigation hub
- RightSidebar.svelte (147 lines) - Contextual panel
- MainView.svelte (396 lines) - Dynamic view container

**Note Components (9 components):**

- NoteEditor.svelte - Main editor wrapper
- EditorHeader.svelte - Title, icon, type, actions
- CodeMirrorEditor.svelte - CodeMirror 6 integration
- MarkdownRenderer.svelte - Preview mode rendering
- MetadataView.svelte - YAML frontmatter editor
- Backlinks.svelte - Reverse link panel
- WikilinkAutocomplete.svelte - Link completion UI
- NoteSuggestions.svelte - AI-generated related notes
- InlineCommentPopover.svelte - Comment annotations

**Navigation Components (6 components):**

- PinnedNotes.svelte (928 lines) - Workspace pins with drag & drop
- TemporaryTabs.svelte (971 lines) - Session tabs management
- WorkspaceBar.svelte - Workspace switcher
- SearchBar.svelte - Global search overlay
- VaultSwitcher.svelte - Multi-vault selection
- NotesShelf.svelte - Quick reference panel

**System View Components (5 components):**

- InboxView.svelte - Quick capture interface
- DailyView.svelte - Week-based journal
- NotesView.svelte - Note type browser
- Settings.svelte - Configuration panel
- WorkflowManagementView.svelte - Automation management

**Review System Components (7 components):**

- ReviewView.svelte - Main review interface
- ReviewDashboard.svelte - Stats and session start
- ReviewSession.svelte - Active review flow
- ReviewHistory.svelte - Past sessions browser
- ReviewPrompt.svelte - AI-generated question display
- ReviewResponse.svelte - User answer input
- ReviewFeedback.svelte - AI feedback display

**Workflow Components (3 components):**

- WorkflowList.svelte - Workflow browser
- WorkflowDetail.svelte - Individual workflow view
- WorkflowForm.svelte - Create/edit workflow

**AI Components (7 components):**

- Agent.svelte - Main AI assistant interface
- ConversationContainer.svelte - Chat layout
- MessageInput.svelte - Input with attachment support
- ToolCallGroup.svelte - Tool call visualization
- ContextUsageWidget.svelte - Token tracking
- TodoPlanMonitor.svelte - AI task tracking
- ThreadSelector.svelte - Conversation history

**Custom Functions Components (5 components):**

- CustomFunctionsManager.svelte - Function management UI
- FunctionList.svelte - Available functions browser
- FunctionEditor.svelte - Function creation/editing
- FunctionTester.svelte - Test function execution
- FunctionDocumentation.svelte - Usage guide

**UI Primitives (20+ components):**

- Modal.svelte - Dialog container
- ConfirmationModal.svelte - Confirm actions
- ToastNotification.svelte - Toast messages
- DropdownMenu.svelte - Context menus
- Button.svelte - Styled button
- Input.svelte - Form input
- Textarea.svelte - Multiline input
- Select.svelte - Dropdown selector
- Checkbox.svelte - Checkbox input
- EmojiPicker.svelte - Emoji selection
- DatePicker.svelte - Date selection
- ColorPicker.svelte - Color selection
- Tooltip.svelte - Hover tooltips
- Badge.svelte - Count indicators
- Spinner.svelte - Loading states
- ProgressBar.svelte - Progress indicators
- Tabs.svelte - Tab navigation
- Accordion.svelte - Collapsible sections
- ResizeHandle.svelte - Sidebar resizing
- DragHandle.svelte - Drag & drop handles

**Utility Components (10+ components):**

- FirstTimeExperience.svelte - Onboarding flow
- UpdateNotification.svelte - Update alerts
- UpdateIndicator.svelte - Update badge
- ChangelogViewer.svelte - Release notes
- ErrorBoundary.svelte - Error handling
- LoadingState.svelte - Loading UI
- EmptyState.svelte - No content states
- RelativeTime.svelte - Time formatting
- MarkdownPreview.svelte - Markdown rendering
- CodeBlock.svelte - Syntax highlighting

### State Management

The application uses modern Svelte 5 runes for reactive state management with 20 specialized stores:

**Navigation & View Stores:**

- `activeNoteStore.svelte.ts` - Current note or system view tracking
- `sidebarState.svelte.ts` - Left/right sidebar visibility, modes, and sizes
- `navigationHistoryStore.svelte.ts` - Browser-style back/forward navigation stack
- `workspacesStore.svelte.ts` - Multi-workspace management with pins and tabs

**Note Organization Stores:**

- `temporaryTabsStore.svelte.ts` - Session-based tabs with auto-close and source tracking
- `notesShelfStore.svelte.ts` - Quick reference shelf for multiple notes
- `inboxStore.svelte.ts` - Unprocessed notes for quick capture
- `dailyViewStore.svelte.ts` - Week navigation and daily note management

**AI & Communication Stores:**

- `unifiedChatStore.svelte.ts` - Thread-based AI conversations with history
- `modelStore.svelte.ts` - AI model selection and configuration
- `todoPlanStore.svelte.ts` - Todo tracking from AI tool calls
- `customFunctionsStore.svelte.ts` - User-defined functions for AI

**Feature Stores:**

- `reviewStore.svelte.ts` - Spaced repetition state, stats, and scheduling
- `workflowStore.svelte.ts` - Workflow automation and backlog management
- `settingsStore.svelte.ts` - User preferences (API keys, themes, etc.)

**Editor & Document Stores:**

- `noteDocumentRegistry.svelte.ts` - Shared CodeMirror document model for collaborative editing
- `cursorPositionManager.svelte.ts` - Cursor position persistence per note
- `editorConfig.svelte.ts` - Editor preferences and configuration

**Core Data Store:**

- `noteStore.svelte.ts` - Note metadata cache with vault-scoped data

**UI State Stores:**

- `dragState.svelte.ts` - Drag & drop state management
- `autoSave.svelte.ts` - Auto-save coordination and status

## Key Features

### 1. Multi-Workspace Organization

**Workspace System:**

- Multiple workspaces for different contexts (work, personal, projects)
- Per-workspace pinned notes with drag & drop reordering
- Shared temporary tabs across workspaces for session continuity
- WorkspaceBar for quick switching with create/edit/delete functionality
- Smooth slide animations on workspace transitions
- Persistent workspace state across application restarts

**Pinned Notes (928 lines):**

- Permanent pins per workspace for curated organization
- Drag & drop reordering within workspace
- Context menu: unpin, move to different workspace, toggle review, archive, open in shelf
- Smart icons (emoji or SVG) based on note type
- Shift+click to quickly add to notes shelf
- Visual active state highlighting

**Temporary Tabs (971 lines):**

- Arc-style session tabs that auto-close when switching workspaces
- Source tracking (search, wikilink, navigation, history)
- Drag & drop reordering
- Context menu: pin to workspace, move to workspace, toggle review, archive, open in shelf
- "Clear all" functionality for quick cleanup
- Shift+click to add to notes shelf

### 2. Spaced Repetition Review System

**Review Dashboard:**

- Daily stats (due items, completed today, current streak)
- Visual progress tracking with animated counters
- Quick access to start review session
- Review history panel with past sessions

**Review Sessions:**

- AI-generated prompts based on note content
- User response input with markdown support
- AI feedback with explanations and insights
- 5-star rating system for interval adjustment
- Session summary with completion stats
- Note content drawer for reference
- Tab navigation between dashboard and history

**Review Scheduling:**

- Spaced repetition algorithm (SM-2 based)
- Automatic interval adjustment based on ratings
- Due date tracking with badge indicators
- Review toggle on any note via context menu or action bar

### 3. Daily Journal System

**Week View:**

- Week navigation with previous/next/today shortcuts
- Seven-day grid layout with current day highlighting
- Daily note auto-creation on first access
- Inline editing per day with full markdown support

**Daily Note Features:**

- Automatic note creation with daily note type
- Timeline of notes created or modified that day
- Click any note in timeline to open in editor
- Shift+click timeline notes to add to shelf
- Persistent week position across sessions

### 4. Workflow Automation

**Workflow Management:**

- Create workflows with custom prompts and instructions
- Active/completed/archived workflow states
- Workflow execution via AI assistant
- Backlog management for queued workflows
- Tab navigation: workflows vs backlog
- Filter by state (all/active/completed/archived)

**Workflow Features:**

- Rich text descriptions with markdown
- AI execution context with full note access
- Workflow detail view with edit capability
- Quick actions: execute, edit, archive, delete
- Integration with AI assistant for natural language execution

### 5. Advanced AI Integration

**Thread-Based Conversations:**

- Multiple conversation threads with history
- Thread switching preserves conversation state
- Draft persistence per thread (never lose a message)
- Conversation history browser with thread management
- Message cancellation during streaming

**AI Assistant Features:**

- Streaming responses with real-time updates
- Tool call visualization grouped by step
- Context usage widget with token tracking
- Todo plan monitoring from AI tasks
- Tool call limit warnings to prevent runaway operations
- Model selector with multiple provider support
- Custom functions for extended AI capabilities

**Contextual Note Integration:**

- [[Wikilink]] support in AI conversations
- Automatic note inclusion in AI prompts
- Click wikilinks in AI responses to navigate
- Notes shelf for multi-note AI context

### 6. Notes Shelf - Quick Reference Panel

**Multi-Note Panel:**

- Open multiple notes simultaneously for quick reference
- Shift+click from anywhere (pins, tabs, timeline, backlinks) to add to shelf
- Markdown preview and edit modes per note
- Individual note close or "clear all" functionality
- Integrated with AI for multi-note context
- Persistent across sessions

**Use Cases:**

- Research with multiple source notes
- Writing with reference materials
- AI conversations with multiple note context
- Quick comparison between notes

### 7. Inbox System

**Quick Capture:**

- Dedicated inbox system view in left sidebar
- Unprocessed notes badge count
- Create new inbox notes with one click
- Mark notes as processed/unprocessed
- Filter toggle to show/hide processed items
- Context menus: pin, shelf, move to workspace, review, archive

**Inbox Workflow:**

- Capture ideas quickly without organization overhead
- Process inbox items into proper workspaces
- Visual separation of processed vs unprocessed
- Relative time display ("2 hours ago", "yesterday")

### 8. Professional Note Editing

**CodeMirror 6 Editor:**

- Full markdown editing with syntax highlighting
- Wikilink autocomplete with fuzzy matching
- Live preview mode toggle
- Cursor position persistence per note
- External edit conflict detection
- Auto-save with visual indicators
- Shared document model for performance

**Editor Header:**

- Emoji picker for note icon
- Inline title editing with auto-save
- Note type selection dropdown
- Pin/unpin button
- Metadata panel toggle
- Preview mode toggle
- Note info (word count, character count)

**Metadata & Backlinks:**

- YAML frontmatter editing with validation
- Automatic frontmatter generation
- Backlinks panel showing reverse references
- Click backlinks to navigate
- Metadata sync with note properties

**Note Actions:**

- Archive with confirmation dialog
- Toggle review for spaced repetition
- Pin to current workspace
- Add to notes shelf
- Note suggestions (AI-generated related notes)

### 9. Note Type System

**Type Management:**

- Custom note types with schemas
- Type browser grid view with counts
- Visual type indicators (icons) throughout UI
- Type-specific metadata fields
- Create new types via Settings
- Type selection in note editor header

**System Types:**

- Daily notes (journal entries)
- Inbox notes (quick capture)
- Standard notes (general)
- Custom types defined by user

### 10. Navigation & Discovery

**Browser-Style Navigation:**

- Back/forward navigation (Cmd+[ and Cmd+])
- Navigation history stack
- Active note highlighting in sidebar
- Auto-scroll to active item

**Search:**

- Global search overlay (Ctrl+O)
- Full-text search with fuzzy matching
- Search results open in temporary tabs
- Search integration with note navigation

**Wikilink System:**

- [[Note Title]] syntax for linking
- Click to navigate with history tracking
- Autocomplete while typing wikilinks
- Backlinks panel for reverse links
- Wikilink support in AI conversations

### 11. Settings & Configuration

**API Configuration:**

- Anthropic API key management
- OpenRouter API key for alternative models
- Secure storage with encryption

**Theme System:**

- Light/dark/auto theme selection
- System preference detection
- CSS custom properties for theming
- Smooth theme transitions

**Model Configuration:**

- Multiple AI model support
- Provider selection (Anthropic, OpenRouter)
- Model-specific settings
- Custom functions management (5-component system)

**Update Management:**

- Automatic update checking
- Update notifications with changelog
- Version display in settings
- Manual check for updates option

## Technical Implementation

### Modern Svelte 5 Architecture

**Reactive State with Runes:**

```typescript
let activeNote = $state<NoteMetadata | null>(null);
let messages = $state<Message[]>([]);
let isLoadingResponse = $state(false);
```

**Props and Component Communication:**

```typescript
let { activeNote, onNoteSelect, onSystemViewSelect }: Props = $props();
```

**Effects for Event Handling:**

```typescript
$effect(() => {
  function handleKeyDown(event: KeyboardEvent) {
    // Global keyboard shortcuts
  }
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
});
```

### CSS Grid Layout System

**Responsive Grid:**

```css
.app.three-column .app-layout {
  grid-template-columns: min-content 1fr min-content;
}

.app:not(.three-column) .app-layout {
  grid-template-columns: 1fr;
}
```

### Service Layer Architecture

**Core Services:**

- `noteStore.svelte.ts` - Note metadata cache with reactive updates and vault isolation
- `chatService.ts` - AI communication with streaming, tool calls, and error handling
- `electronChatService.ts` - Electron IPC wrapper for main process AI integration
- `noteNavigationService.ts` - History stack management for back/forward navigation
- `wikilinkService.ts` - Wikilink resolution and autocomplete with fuzzy matching
- `messageBus.ts` - Event pub/sub for cross-component communication
- `cursorPositionStore.ts` - Cursor position persistence across sessions
- `vaultAvailabilityService.ts` - Vault detection and initialization
- `noteCache.ts` - Performance optimization for note loading
- `migrationService.ts` - Database schema migrations with version tracking
- `secureStorageService.ts` - Encrypted storage for API keys

**Service Integration:**

- Message bus for decoupled component communication
- Shared document model for collaborative CodeMirror editing
- Vault-scoped data isolation across all services
- IPC communication with Electron main process
- Auto-save coordination with debouncing
- External edit conflict detection and resolution

## User Experience Features

### Responsive Design

**Desktop (>1400px):**

- Full three-column layout with all features visible
- Sidebar toggle capabilities for focus modes
- Optimal spacing for note editing and AI interaction

**Mobile (<768px):**

- Single-column layout with overlay sidebars
- Touch-optimized interactions
- Preserved functionality across device types

### Keyboard Shortcuts

**Global Shortcuts:**

- `Ctrl+Shift+N` / `Cmd+Shift+N` - Create new note
- `Ctrl+O` / `Cmd+O` - Open global search overlay
- `Ctrl+,` / `Cmd+,` - Open settings
- `Cmd+[` - Navigate back in history (macOS)
- `Cmd+]` - Navigate forward in history (macOS)

**Navigation:**

- Wikilink navigation with [[Note Title]] syntax
- Click-to-navigate for all note references and backlinks
- Shift+click anywhere to add note to shelf
- Browser-style back/forward with history stack
- Auto-scroll to active note in sidebar

### Visual Design

**Design System:**

- CSS custom properties for theming support
- Consistent spacing using logical units
- Smooth animations and transitions (60fps)
- Semantic color palette for different note types

**Typography:**

- System font stack for optimal readability
- Clear hierarchy between title and content
- Monospace font for code and YAML editing

**CSS Variables:**
The application uses CSS custom properties defined in `src/renderer/src/assets/base.css` for consistent theming:

_Color System:_

- `--bg-primary`: Primary background color
- `--bg-secondary`: Secondary background for panels and cards
- `--bg-tertiary`: Tertiary background for subtle elements
- `--text-primary`: Primary text color for headings and main content
- `--text-secondary`: Secondary text color for descriptions
- `--text-muted`: Muted text color for less important information
- `--text-placeholder`: Placeholder text color for inputs

_Borders and Shadows:_

- `--border-light`: Light border color for subtle separations
- `--border-medium`: Medium border color for defined boundaries
- `--shadow-light`: Light shadow for subtle depth
- `--shadow-medium`: Medium shadow for elevated elements

_Interactive Elements:_

- `--accent-primary`: Primary accent color for buttons and links
- `--accent-hover`: Darker accent color for hover states
- `--accent-light`: Light accent color with transparency for backgrounds

_Message Components:_

- `--message-user-bg`: Background color for user messages
- `--message-user-text`: Text color for user messages
- `--message-agent-bg`: Background color for agent messages
- `--message-agent-text`: Text color for agent messages
- `--message-agent-border`: Border color for agent messages

_Scrollbar Styling:_

- `--scrollbar-thumb`: Default scrollbar thumb color
- `--scrollbar-thumb-hover`: Scrollbar thumb color on hover

The color system automatically adapts between light and dark themes using `@media (prefers-color-scheme: dark)`, providing seamless theme switching based on system preferences.

## Design Principles

### 1. Agent Philosophy

- Natural language commands for complex operations (workflows, reviews)
- Contextual note inclusion via wikilinks and notes shelf
- Thread-based conversations preserve AI context
- Custom functions extend AI capabilities
- Tool call visualization for transparency

### 2. Multi-Modal Organization

- Workspaces for context separation
- Pins for permanent organization
- Temporary tabs for session continuity
- Notes shelf for quick reference
- Inbox for capture-first workflow
- Daily journal for time-based organization

### 3. Learning & Knowledge Retention

- Spaced repetition review system with AI prompts
- Automatic scheduling based on user performance
- Review history and streak tracking
- Integration with note organization (review any note)
- AI-generated feedback for deeper learning

### 4. Clean, Focused Interface

- Minimal cognitive load with contextual UI
- Distraction-free editing environment
- Information hierarchy that guides attention
- Progressive disclosure of advanced features
- Smooth animations and transitions
- Consistent design language across all views

### 5. Responsive and Accessible

- Resizable sidebars adapt to user preferences
- Full keyboard navigation support
- Mobile-responsive layout with overlays
- High contrast support via theme system
- Clear visual hierarchy and iconography

## Technical Architecture

### Modern Technology Stack

- Svelte 5 with runes for optimal performance
- TypeScript for type safety and maintainability
- CSS Grid for flexible layout management
- Electron for cross-platform desktop deployment

### Scalable Component Design

- Modular component architecture
- Clear separation of concerns
- Reusable UI components and patterns
- Comprehensive state management

### Performance and Reliability

- Efficient memory usage and cleanup
- Debounced operations to prevent excessive API calls
- Graceful error handling and user feedback
- Persistent user preferences and session management
