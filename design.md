# Flint GUI Design Document

## Executive Summary

This document outlines the design for a web-based graphical user interface for Flint, an agent-first note-taking system. The GUI will be built using SvelteKit with Svelte 5 (runes syntax) and will provide a chat-centric interface that seamlessly integrates with Flint's MCP server capabilities while maintaining its agent-first philosophy.

## Design Principles

### 1. **Chat-First Interface**

- The primary interaction model remains conversational, preserving Flint's agent-first design
- Natural language commands drive all operations
- Visual elements enhance rather than replace the conversational paradigm

### 2. **Contextual Note Display**

- Notes referenced in chat responses become interactive elements
- Seamless transition between conversation and note editing
- Spatial awareness adapts to available screen real estate

### 3. **Progressive Enhancement**

- Core functionality works on all screen sizes
- Enhanced features activate based on available space
- Mobile-first responsive design

### 4. **Minimal Cognitive Load**

- Clean, distraction-free interface
- Context-aware UI that shows only relevant information
- Consistent interaction patterns

## Core User Interface Components

### Primary Chat Interface

#### **Chat Panel**

- **Central Focus**: Occupies the main viewport area
- **Message Stream**: Scrollable conversation history with the AI agent
- **Input Area**: Multi-line text input with slash command support
- **Message Types**:
  - User queries with timestamp
  - Agent responses with rich formatting
  - System notifications (vault switches, errors)
  - Note references as interactive elements

#### **Interactive Note References**

- **Inline Display**: Note titles appear as clickable links within chat responses
- **Visual Indicators**:
  - Different colors/icons for note types
  - Hover states showing note metadata
  - Visual cues for broken links
- **Click Behavior**: Opens note in context-appropriate location

### Note Editor Component

#### **CodeMirror Integration**

- **Syntax Highlighting**: Markdown with frontmatter support
- **Live Preview**: Optional side-by-side markdown preview
- **Auto-save**: Debounced saving with visual feedback
- **Metadata Editor**: Structured UI for frontmatter based on note type schema

#### **Responsive Positioning**

- **Large Screens** (>1200px): Note opens in right sidebar
- **Medium Screens** (768-1200px): Note overlays chat with resize handle
- **Small Screens** (<768px): Note takes full screen with back navigation

### Pinning System

#### **Pinned Messages**

- **Persistent Reference**: Important chat messages stay accessible
- **Visual Distinction**: Pinned messages appear in dedicated area
- **Quick Actions**: Jump to context, copy, unpin

#### **Pinned Notes**

- **Quick Access Bar**: Horizontal strip of frequently used notes
- **Customizable Order**: Drag-and-drop reordering
- **Visual Preview**: Note type icon and truncated title

### Slash Commands

#### **Command Palette**

- **Trigger**: `/` key in input field
- **Auto-complete**: Fuzzy search through available commands
- **Categories**:
  - Note operations (`/create`, `/find`, `/update`)
  - Vault management (`/switch-vault`, `/list-vaults`)
  - Saved prompts (`/weekly-review`, `/brainstorm`)
- **Custom Commands**: User-defined prompt templates

## Layout Architecture

### Responsive Grid System

```
Desktop Layout (>1200px):
┌─────────────────────────────────────────┐
│ Header (vault selector, settings)       │
├─────────────────────────────────────────┤
│ Pinned Notes Bar                        │
├──────────────────────┬──────────────────┤
│                      │                  │
│   Chat Interface     │   Note Editor    │
│                      │   (when active)  │
│                      │                  │
├──────────────────────┴──────────────────┤
│ Input Area with Slash Commands          │
└─────────────────────────────────────────┘

Mobile Layout (<768px):
┌─────────────────────────┐
│ Header (minimal)        │
├─────────────────────────┤
│ Chat Interface          │
│ (Note editor overlays   │
│  when activated)        │
├─────────────────────────┤
│ Input Area              │
└─────────────────────────┘
```

### Dynamic Space Management

#### **Adaptive Panels**

- Chat panel maintains minimum width of 400px
- Note editor appears when space allows (>800px total width)
- Collapsible panels with smooth transitions

#### **Smart Scrolling**

- Chat auto-scrolls to latest message
- Scroll position preserved when switching contexts
- Note editor maintains scroll position during edits

## User Workflows

### Primary Workflows

#### **1. Conversational Note Management**

1. User types natural language query
2. Agent responds with note content/references
3. User clicks referenced note
4. Note opens in appropriate location
5. User edits and saves
6. Chat confirms changes

#### **2. Quick Note Access**

1. User pins frequently used notes
2. Click pinned note for instant access
3. Edit in-place
4. Changes reflected in chat history

#### **3. Slash Command Efficiency**

1. User types `/` to trigger command palette
2. Fuzzy search for desired command
3. Command executes with parameters
4. Results appear in chat

### Secondary Workflows

#### **Vault Switching**

- Dropdown selector in header
- Keyboard shortcut (Cmd/Ctrl + K)
- Recent vaults quick access

#### **Search and Discovery**

- Global search accessible via header
- Search results appear in chat format
- Filters for note type, date, metadata

## Technical Considerations

### State Management

- **Svelte 5 Runes**: Reactive state for UI components
- **Stores**: Global state for chat history, pinned items, active notes
- **Persistence**: Local storage for UI preferences, pinned items

### Performance Optimization

- **Virtual Scrolling**: For long chat histories
- **Lazy Loading**: Notes load on-demand
- **Debounced Saving**: Prevent excessive server calls
- **Code Splitting**: Route-based chunks for faster initial load

### Accessibility

- **Keyboard Navigation**: Full keyboard support for all operations
- **Screen Reader Support**: Proper ARIA labels and live regions
- **High Contrast Mode**: Respects system preferences
- **Focus Management**: Logical tab order and focus indicators

## Visual Design Guidelines

### Design System

- **Typography**: System font stack with clear hierarchy
- **Color Palette**:
  - Light/dark mode support
  - Semantic colors for note types
  - Accessible contrast ratios
- **Spacing**: 8px grid system
- **Components**: Consistent border radius, shadows, transitions

### Interaction Patterns

- **Hover States**: Subtle elevation changes
- **Active States**: Clear visual feedback
- **Loading States**: Skeleton screens and progress indicators
- **Error States**: Inline validation with helpful messages

## Future Enhancements

### Phase 2 Features

- **Collaborative Editing**: Real-time multi-user support
- **Voice Input**: Speech-to-text for chat input
- **Advanced Visualizations**: Knowledge graph view
- **Plugin System**: Extensible UI components

### Phase 3 Features

- **Mobile Apps**: Native iOS/Android clients
- **Offline Support**: Local-first architecture
- **AI Customization**: Fine-tune agent behavior
- **Export Options**: PDF, DOCX, HTML generation

## Success Metrics

### User Experience Metrics

- Time to first meaningful interaction < 2 seconds
- Chat response time < 500ms
- Note load time < 200ms
- Zero data loss during editing

### Adoption Metrics

- Daily active users
- Average session duration
- Number of notes created/edited per session
- Slash command usage rate

## Conclusion

This GUI design maintains Flint's agent-first philosophy while adding visual enhancements that make the system more approachable and efficient. The chat-centric interface preserves the natural language interaction model while the responsive note editor and pinning system add power-user features. Built with modern web technologies, the interface will be fast, accessible, and adaptable to various use cases and screen sizes.
