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

### Phase 1: Mocked Chat Application ✅ COMPLETED

**Goal:** Create a visually representative but non-functional chat application shell. This phase focuses on setting up the project structure and the basic user interface.

**Key Components:**

- **Basic Project Setup:** A Svelte-based renderer application hosted within an Electron window.
- **Chat View:** A central, scrollable panel to display a stream of messages.
- **Message Components:** Distinct visual components for user messages and agent responses.
- **Input Area:** A simple text input for typing messages.
- **Mock Data Pipeline:** The Electron main process will generate and send mock chat messages (e.g., "Hello, how can I help you?") to the Svelte renderer process via IPC to simulate an agent conversation.

**UI Mockup:**

```
┌─────────────────────────────────────────┐
│ Header (Flint)                          │
├─────────────────────────────────────────┤
│                                         │
│  [User] Hello!                          │
│                                         │
│  [Agent] Hi there! How can I help?      │
│                                         │
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│ > Type your message...                  │
└─────────────────────────────────────────┘
```

**Outcome:** A runnable application that displays a fake chat conversation, establishing the core UI and the communication bridge between the Electron backend and the web-based frontend.

### Phase 2: Real Model Integration ✅ COMPLETED

**Goal:** Replace the mock data pipeline with a connection to a real language model via OpenRouter and LangChain, enabling actual AI responses.

**Key Components:**

- **OpenRouter Integration:** Set up API calls to OpenRouter for accessing various language models.
- **LangChain Implementation:** Utilize LangChain to manage conversational chains, prompt engineering, and potentially integrate with other tools (though initial focus is on basic chat).
- **Electron-to-AI Bridge:** Establish secure and efficient communication between the Electron main process and the AI model, handling API keys and responses.

**Outcome:** The chat application will now interact with a live AI model, providing dynamic and intelligent responses instead of mocked data.

### Phase 3: Tabbed Views and Notes Explorer ✅ COMPLETED

**Goal:** Introduce a tabbed interface to switch between the main chat view and a new "Notes" view, which will display a file explorer-style list of all notes.

**Key Components:**

- **Tabbed Navigation:** A tab bar in the header to switch between "Chat" and "Notes" views.
- **Notes View:** A new view that displays a hierarchical list of notes, similar to a file explorer.
- **Mock Note Data:** The list of notes will be populated with mock data from the Electron main process.

**UI Mockup:**

```
┌─────────────────────────────────────────┐
│ [Chat] [Notes]                          │
├─────────────────────────────────────────┤
│ - Folder 1                              │
│   - Note A                              │
│   - Note B                              │
│ - Folder 2                              │
│   - Note C                              │
│ - Note D                                │
│                                         │
├─────────────────────────────────────────┤
│ > Type your message...                  │
└─────────────────────────────────────────┘
```

**Outcome:** Users can switch between the chat interface and a structured, browsable view of their notes.

### Phase 4: The Note Editor ✅ COMPLETED

**Goal:** Introduce the ability to view and edit notes within the application.

**Key Components:**

- **Interactive Note References:** Agent messages (now from a real model) will include "links" to notes. Clicking these links will trigger the note editor.
- **CodeMirror Integration:** A robust text editor with Markdown syntax highlighting will be integrated as the note editor.
- **Responsive Positioning:** The note editor's placement will adapt to the window size:
  - **Large Screens (>1200px):** Opens in a sidebar to the right of the chat.
  - **Medium Screens (768-1200px):** Overlays the chat panel.
  - **Small Screens (<768px):** Takes over the full screen.
- **Basic Persistence:** Edited notes will be saved in-memory or to local storage for the duration of the session.

**UI Mockup (Large Screen):**

```
┌──────────────────────┬──────────────────┐
│ [Chat] [Notes]       │ Note Editor      │
├──────────────────────┼──────────────────┤
│                      │ # My Note        │
│  [User] Open note    │                  │
│                      │ ...content...    │
│  [Agent] Opening...  │                  │
│                      │                  │
│                      │                  │
├──────────────────────┴──────────────────┤
│ > Type your message...                  │
└─────────────────────────────────────────┘
```

**Outcome:** Users can click on note references in the chat to open an editor, make changes, and have those changes persist temporarily.

### Phase 5: Pinned Notes

**Goal:** Add a dedicated "Pinned" tab for quick access to important notes and provide controls to pin/unpin notes from the editor.

**Key Components:**

- **Pinned Tab:** A new third tab labeled "Pinned" alongside "Chat" and "Notes" tabs that displays only pinned notes.
- **Pin Controls in Note Editor:** Add a pin/unpin button or toggle in the note editor toolbar to allow users to pin the currently open note.
- **Visual Pin Indicators:** Show visual indicators (like a pin icon) on pinned notes in both the Notes tab and the Pinned tab.
- **Persistent State:** Save pinned note status to local storage so pinned notes persist across app sessions.
- **Quick Access:** The Pinned tab provides instant access to frequently referenced notes without scrolling through the full notes hierarchy.

**UI Mockup:**

```
┌─────────────────────────────────────────┐
│ [Chat] [Notes] [Pinned]                 │
├─────────────────────────────────────────┤
│ 📌 Important Project Notes              │
│ 📌 Meeting Notes 2024-01-15             │
│ 📌 Quick Reference Guide                │
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│ > Type your message...                  │
└─────────────────────────────────────────┘
```

**Note Editor with Pin Control:**

```
┌──────────────────────┬──────────────────┐
│ [Chat] [Notes]       │ [📌] [💾] [❌]    │
├──────────────────────┼──────────────────┤
│                      │ # My Note        │
│  [User] Open note    │                  │
│                      │ ...content...    │
│  [Agent] Opening...  │                  │
│                      │                  │
│                      │                  │
├──────────────────────┴──────────────────┤
│ > Type your message...                  │
└─────────────────────────────────────────┘
```

**Outcome:** Users have quick access to their most important notes via a dedicated tab, and can easily pin/unpin notes while editing them.

### Phase 6: Slash Commands

**Goal:** Implement a command palette for efficient, power-user interactions.

**Key Components:**

- **Command Palette Trigger:** Typing `/` in the input area will open a command palette.
- **Fuzzy Search:** The palette will allow users to search through a list of available commands.
- **Initial Command Set:** Implement a few core commands that interact with the AI model and mock data system:
  - `/create-note {title}`: Creates a new (mock) note.
  - `/find-note {query}`: Searches through existing (mock) notes.
- **Command Execution:** Selecting a command will execute the corresponding action, with results displayed in the chat stream.

**UI Mockup:**

```
┌─────────────────────────────────────────┐
│ [Chat] [Notes]                          │
├─────────────────────────────────────────┤
│                                         │
│  [User] /find-note...                   │
│                                         │
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ /create-note                        │ │
│ │ /find-note                          │ │
│ └─────────────────────────────────────┘ │
│ > /                                     │
└─────────────────────────────────────────┘
```

**Outcome:** Users can perform basic operations using slash commands, laying the groundwork for a more powerful, keyboard-driven workflow.

### Phase 7: State Persistence & Enhanced Features

**Goal:** Persist UI state across sessions and add advanced user experience features.

**Key Components:**

- **Local Storage Integration:** Use the browser's local storage to save UI preferences (like theme, panel sizes, last opened notes), so they persist when the app is closed and reopened.
- **Session Restoration:** Restore the last active tab, open notes, and chat history when the app restarts.
- **Enhanced Pin Management:** Allow reordering of pinned notes and provide bulk pin/unpin operations.
- **Keyboard Shortcuts:** Add keyboard shortcuts for common actions like switching tabs, opening notes, and pinning/unpinning.

**Outcome:** The application will feel more like a personalized tool, remembering user-specific configurations and providing a seamless experience across sessions.

### Phase 8: Reactive State Management ⏳

**Goal:** Implement reactive data flow to automatically update the UI when vault or note changes occur, eliminating the need for manual refresh operations.

**Current Problem:** The vault switcher and notes explorer require manual refresh calls when switching vaults. The UI doesn't automatically respond to external changes or operations performed outside the application.

**Key Components:**

#### **Subphase 8.1: Event-Driven IPC Layer**

- **Enhanced NoteService:** Extend the main process `NoteService` to emit events for all CRUD operations (vault switching, note creation, updates, deletions).
- **IPC Event Channels:** Add `ipcMain.send()` broadcasting to supplement the existing request-response pattern.
- **Event Types:** Define semantic events like `vault-switched`, `note-created`, `note-updated`, `note-deleted`, `vault-changed`.
- **Automatic Refresh:** Update `VaultSwitcher` to broadcast events instead of manually calling `notesStore.refresh()`.

#### **Subphase 8.2: Reactive Store Migration**

- **Svelte 5 Runes Integration:** Convert `noteStore.ts` from traditional Svelte stores to modern runes (`$state`, `$derived`, `$effect`).
- **Global Vault State:** Create a centralized vault state store that components can reactively subscribe to.
- **Automatic Dependency Tracking:** Use `$effect` to automatically refresh notes when vault changes are detected.
- **Smart State Management:** Implement granular state updates instead of full store reloads.

#### **Future Enhancements (Phase 8.3+):**

- **File System Watching:** Add `chokidar` or native Node.js `fs.watch` to detect external file changes.
- **WebSocket Integration:** Extend `@flint-note/server` to support real-time updates for future collaboration features.
- **Smart Polling:** Implement adaptive polling with debouncing for edge cases.
- **Conflict Resolution:** Handle conflicts between internal operations and external file changes.

**Technical Architecture:**

```typescript
// Event flow: VaultSwitcher → NoteService → IPC Events → Store Updates → UI Refresh
VaultSwitcher.switchVault()
  → service.switchVault()
  → broadcastEvent('vault-switched')
  → notesStore.$effect()
  → automatic refresh
```

**Implementation Priority:**
1. **Phase 8.1** (Immediate): Event-driven IPC for vault operations
2. **Phase 8.2** (Short-term): Reactive store migration using Svelte 5 runes
3. **Phase 8.3** (Medium-term): External change detection and conflict handling
4. **Phase 8.4** (Long-term): Real-time API enhancements for collaboration

**Success Metrics:**
- Zero manual refresh calls required for vault switching
- Automatic UI updates when notes change externally
- Sub-200ms response time for vault switching
- Consistent state across all UI components

**Outcome:** The application will provide a seamless, reactive user experience where all UI components automatically stay in sync with the underlying data, creating a more polished and responsive note-taking environment.

### Phase 9 & Beyond: Full Integration and Advanced Features

**Goal:** Transition from a mocked application to a fully functional Flint client and begin adding advanced capabilities.

**Key Initiatives:**

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
