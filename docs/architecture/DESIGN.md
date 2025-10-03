# Flint GUI Design Document

## Executive Summary

This document describes the current architecture and design of the Flint GUI, a modern note-taking interface built with Svelte 5 and Electron. The application features a three-column layout with left sidebar navigation, central note editing, and contextual right sidebar for AI assistance and metadata editing. The design maintains Flint's agent-first philosophy while providing an intuitive and scalable interface that adapts to different screen sizes.

## Current Architecture

### Core Layout System

The application uses a responsive three-column grid layout with a custom title bar on macOS for a native feel:

```
Desktop Layout (>1400px) with Custom Title Bar:
┌─────────────────────────────────────────┐
│ Custom Title Bar (macOS traffic lights) │
├─────────────────────────────────────────┤
│ Left Sidebar │ Main View │ Right Sidebar │
│ (Navigation) │ (Editor)  │ (AI/Metadata) │
│             │           │               │
│ • Vault     │ Note      │ • AI Assistant│
│ • System    │ Title     │ • Task Mgmt   │
│ • Pinned    │ Content   │ • Notes       │
│ • Temp Tabs │ Editor    │ • Metadata    │
└─────────────────────────────────────────┘

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

**App.svelte** - Root application component with state management and event handling

- Custom title bar with macOS traffic light integration
- Three-column responsive grid layout
- Platform-specific styling and behavior
- Global keyboard shortcuts (Ctrl+N, Ctrl+O)
- Message passing between AI service and UI
- Note navigation and temporary tab management

**LeftSidebar.svelte** - Primary navigation hub

- `SystemViews` component (Inbox, All notes, Search, Settings)
- `PinnedNotes` component with visual note type indicators
- `TemporaryTabs` component with Arc-style tab management
- Clean, minimal layout focused purely on content sections

**MainView.svelte** - Central note editing interface

- Note type selector dropdown
- Full-width markdown editor using CodeMirror
- Clean typography and responsive design
- Empty state with helpful prompts

**RightSidebar.svelte** - Contextual assistance panel

- Tabbed interface: AI Assistant / Metadata
- `AIAssistant` component with task management
- `MetadataEditor` component with YAML frontmatter editing

### State Management

The application uses modern Svelte 5 runes for reactive state management:

**Core Stores:**

- `sidebarState.svelte.ts` - Left/right sidebar visibility and modes
- `temporaryTabsStore.svelte.ts` - Arc-style temporary note tabs
- `notesStore.svelte.ts` - Note data and vault management (existing)
- `modelStore.svelte.ts` - AI model selection (existing)
- `settingsStore.svelte.ts` - Application preferences (existing)

**Additional Stores:**

- `searchOverlay.svelte.ts` - Global search overlay state

## Key Features

### 1. Custom Title Bar Integration

**Native macOS Experience:**

- Hidden Electron title bar with custom implementation
- Proper traffic light button positioning and spacing
- Draggable area for window management
- Platform detection for appropriate styling
- Integrated hamburger menu and vault switcher in title bar
- AI assistant toggle button positioned on the right side for easy access with visual indicator for active state

**Cross-Platform Compatibility:**

- Automatic detection of macOS vs other platforms
- Platform-specific CSS styling via data attributes
- Fallback behavior for non-macOS systems
- Consistent interface regardless of platform

### 2. Sidebar-Based Navigation

**Left Sidebar Structure:**

- **System Views**:
  - Inbox for quick note capture
  - All notes with hierarchical organization
  - Global search functionality
  - Settings configuration
- **Pinned Notes**: User-curated favorites with type-specific icons
- **Temporary Tabs**: Recently accessed notes with individual close buttons

### 2. Advanced AI Integration

**AI Assistant Features:**

- Task management with expandable sections
- Visual progress indicators (✓ completed, ⟳ in-progress, ○ pending)
- [[Wikilink]] support in conversations
- "Notes discussed" section tracking referenced notes
- Contextual note inclusion in AI prompts
- Streaming response support with real-time updates

**Task Management:**

- Automatic task extraction from tool calls
- Expandable task details with related note links
- Status-based visual organization
- Click-to-navigate for all note references

### 3. Professional Metadata Editing

**YAML Frontmatter Editor:**

- Real-time validation with line-specific error reporting
- Support for all YAML data types (strings, numbers, booleans, arrays, dates)
- Custom field management with add/remove functionality
- Auto-save with visual change indicators
- Comprehensive help system with examples

**Metadata Features:**

- Automatic frontmatter generation from note properties
- Field-specific validation for common metadata
- Visual parsing preview with interactive editing
- Integration with note update system

### 4. Note Management System

**Temporary Tabs:**

- Arc-style tab behavior with automatic population
- Source tracking (search, wikilink, navigation)
- 24-hour automatic cleanup
- Individual and bulk close options
- Persistence across application sessions

**Note Navigation:**

- Wikilink support with click-to-navigate
- Multiple note opening sources (search, pinned, navigation)
- Active note highlighting and state management
- Integration with AI conversation context

### 5. Advanced Search and Discovery

**Global Search:**

- Keyboard shortcut activation (Ctrl+O)
- Full-text search with fuzzy matching
- Search result integration with temporary tabs
- Overlay interface that doesn't disrupt workflow

**Note Organization:**

- Visual note type indicators (calendar, folder, document icons)
- Hierarchical note display in system views
- Pinned notes for quick access to favorites
- Collapsible sections with smooth animations

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

**Chat Service Integration:**

- Streaming message support with real-time updates
- Tool call handling for task management
- Model selection integration via `modelStore`
- Error handling with graceful fallbacks

**Note Service Integration:**

- CRUD operations for note management
- Vault switching and note type changes
- Metadata updates with frontmatter synchronization
- Search and discovery capabilities

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

- `Ctrl+Shift+N` - Create new note
- `Ctrl+O` - Open global search
- `Ctrl+,` - Access settings (via system views)

**Navigation:**

- Wikilink navigation with [[Note Title]] syntax
- Click-to-navigate for all note references
- Tab management for recently accessed notes

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

### 1. Agent-First Philosophy

- AI assistant remains central to the workflow
- Natural language commands drive operations
- Contextual note inclusion enhances AI responses
- Task-oriented interface for productivity

### 2. Clean, Focused Interface

- Minimal cognitive load with contextual UI
- Distraction-free editing environment
- Information hierarchy that guides attention
- Progressive disclosure of advanced features

### 3. Responsive and Accessible

- Mobile-first design approach
- Full keyboard navigation support
- Screen reader compatibility
- High contrast mode support

### 4. Professional Note Management

- Enterprise-grade metadata capabilities
- Robust search and discovery features
- Reliable auto-save and data persistence
- Comprehensive error handling and recovery

## Technical Architecture Benefits

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

## Conclusion

The current Flint GUI successfully implements a modern, professional note-taking interface that maintains the agent-first philosophy while providing powerful organizational and editing capabilities. The sidebar-based architecture provides clear separation between navigation, content creation, and AI assistance, creating an intuitive workflow for users across all device types.

The implementation represents a significant evolution from the original tab-based design, offering improved scalability, better information architecture, and enhanced user experience. The combination of advanced AI integration, professional metadata management, and responsive design creates a comprehensive note-taking solution suitable for both casual and professional use cases.

Key achievements include:

- Modern three-column layout with responsive behavior
- Advanced AI assistant with task management and contextual note integration
- Professional metadata editing with YAML frontmatter support
- Arc-style temporary tab management for improved workflow
- Comprehensive search and discovery capabilities
- Enterprise-grade reliability with auto-save and error handling

The architecture is well-positioned for future enhancements while maintaining stability and performance for current users.
