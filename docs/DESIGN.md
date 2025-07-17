# Flint GUI Design Document

## Executive Summary

This document outlines the design for a web-based graphical user interface for Flint, an agent-first note-taking system. The GUI will be built using Svelte with Svelte 5 (runes syntax) and will provide a chat-centric interface that seamlessly integrates with Flint's MCP server capabilities while maintaining its agent-first philosophy.

The implementation will be broken down into distinct phases to allow for iterative development, starting with a basic mocked-up application and progressively adding core features.

## Design Principles

### 1. **Chat-First Interface**

- The primary interaction model remains conversational, preserving Flint's agent-first design.
- Natural language commands drive all operations.
- Visual elements enhance rather than replace the conversational paradigm.

### 2. **Contextual Note Display**

- Notes referenced in chat responses become interactive elements.
- Seamless transition between conversation and note editing.
- Spatial awareness adapts to available screen real estate.

### 3. **Progressive Enhancement**

- Core functionality works on all screen sizes.
- Enhanced features activate based on available space.
- Mobile-first responsive design.

### 4. **Minimal Cognitive Load**

- Clean, distraction-free interface.
- Context-aware UI that shows only relevant information.
- Consistent interaction patterns.

## Implementation Phases

The project will be developed in phases, allowing for rapid prototyping and iterative feedback.

### Phase 1: Mocked Chat Application

**Goal:** Create a visually representative but non-functional chat application shell. This phase focuses on setting up the project structure and the basic user interface.

**Key Components:**

- **Basic Project Setup:** A Svelte-based renderer application hosted within an Electron window.
- **Chat View:** A central, scrollable panel to display a stream of messages.
- **Message Components:** Distinct visual components for user messages and agent responses.
- **Input Area:** A simple text input for typing messages.
- **Mock Data Pipeline:** The Electron main process will generate and send mock chat messages (e.g., "Hello, how can I help you?") to the Svelte renderer process via IPC to simulate an agent conversation.

**Outcome:** A runnable application that displays a fake chat conversation, establishing the core UI and the communication bridge between the Electron backend and the web-based frontend.

### Phase 2: The Note Editor

**Goal:** Introduce the ability to view and edit notes within the application.

**Key Components:**

- **Interactive Note References:** Mock agent messages will include "links" to notes. Clicking these links will trigger the note editor.
- **CodeMirror Integration:** A robust text editor with Markdown syntax highlighting will be integrated as the note editor.
- **Responsive Positioning:** The note editor's placement will adapt to the window size:
    - **Large Screens (>1200px):** Opens in a sidebar to the right of the chat.
    - **Medium Screens (768-1200px):** Overlays the chat panel.
    - **Small Screens (<768px):** Takes over the full screen.
- **Basic Persistence:** Edited notes will be saved in-memory or to local storage for the duration of the session.

**Outcome:** Users can click on note references in the chat to open an editor, make changes, and have those changes persist temporarily.

### Phase 3: Slash Commands

**Goal:** Implement a command palette for efficient, power-user interactions.

**Key Components:**

- **Command Palette Trigger:** Typing `/` in the input area will open a command palette.
- **Fuzzy Search:** The palette will allow users to search through a list of available commands.
- **Initial Command Set:** Implement a few core commands that interact with the mock data system:
    - `/create-note {title}`: Creates a new (mock) note.
    - `/find-note {query}`: Searches through existing (mock) notes.
- **Command Execution:** Selecting a command will execute the corresponding action, with results displayed in the chat stream.

**Outcome:** Users can perform basic operations using slash commands, laying the groundwork for a more powerful, keyboard-driven workflow.

### Phase 4: Pinning System & State Persistence

**Goal:** Add features for quick access to important notes and persist UI state across sessions.

**Key Components:**

- **Pinned Notes Bar:** A dedicated area in the UI (e.g., a horizontal bar above the chat) to display pinned notes.
- **Pin/Unpin Functionality:** Users can pin notes from the chat or the editor.
- **Local Storage Integration:** Use the browser's local storage to save the list of pinned notes and other UI preferences (like theme or panel sizes), so they persist when the app is closed and reopened.

**Outcome:** The application will feel more like a personalized tool, remembering user-specific configurations and providing quick access to frequently used content.

### Phase 5 & Beyond: Full Integration and Advanced Features

**Goal:** Transition from a mocked application to a fully functional Flint client and begin adding advanced capabilities.

**Key Initiatives:**

- **Live Backend Integration:** Replace the mock data pipeline with a real connection to a Flint MCP server.
- **Full Feature Implementation:** Flesh out all slash commands, note operations, and settings.
- **Advanced Search:** Implement a global search feature with filters.
- **Vault Management:** Add UI for switching between different note vaults.
- **Collaborative Editing:** Explore real-time multi-user support.
- **Plugin System:** Design an architecture for extending the UI with custom components.

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

This GUI design maintains Flint's agent-first philosophy while adding visual enhancements that make the system more approachable and efficient. The phased implementation plan ensures that a usable product is available early and can be improved iteratively. The chat-centric interface preserves the natural language interaction model while the responsive note editor and pinning system add power-user features. Built with modern web technologies, the interface will be fast, accessible, and adaptable to various use cases and screen sizes.
