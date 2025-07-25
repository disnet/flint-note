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
- **Note Type Selection:** A dropdown or selector to change the note type, as all Flint notes have a specific type (e.g., 'general', 'meeting', 'project', etc.). ✅ COMPLETED
- **Responsive Positioning:** The note editor's placement will adapt to the window size:
  - **Large Screens (>1200px):** Opens in a sidebar to the right of the chat.
  - **Medium Screens (768-1200px):** Overlays the chat panel.
  - **Small Screens (<768px):** Takes over the full screen.
- **Auto-Save Functionality:** Notes automatically save on every change with a 500ms debounce delay, removing the need for manual save operations. ✅ COMPLETED

**UI Mockup (Large Screen):**

```
┌──────────────────────┬──────────────────┐
│ [Chat] [Notes]       │ [general ▼] [💾] │
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

### Phase 4.5: Create Note Feature

**Goal:** Provide users with an intuitive way to create new notes directly from the interface with full integration into the existing workflow.

**Key Components:**

#### **Create Note Button & UI**

- **Create Button:** Add a prominent "+" or "New Note" button in the Notes tab header for easy note creation.
- **Keyboard Shortcut:** Support Cmd/Ctrl+N for quick note creation from anywhere in the app.
- **Context Menu:** Right-click option in notes explorer to create notes within specific folders.

#### **Note Creation Modal**

- **Note Type Selection:** Dropdown populated dynamically using the Flint Note API's `listNoteTypes()` method.
- **Smart Defaults:** Remember user's last selected note type as default for new notes.
- **Quick Creation Form:** Streamlined form with fields for:
  - Note type (dropdown with icons/descriptions)
  - Note title/identifier (text input with real-time validation)
  - Parent folder selection (optional, defaults to type-based folder)
  - Initial content (optional textarea with template support)

#### **Advanced Features**

- **Template System:** Pre-populate content based on note type (e.g., meeting notes get date/attendee fields).
- **Validation & Error Handling:**
  - Real-time validation of note identifiers
  - Conflict detection with existing notes
  - Invalid character filtering
  - Duplicate name prevention
- **Integration with Note Editor:** Seamlessly open newly created notes in the editor for immediate editing.
- **Undo Creation:** Allow users to quickly delete just-created notes if created by mistake.

**UI Mockup:**

```
┌─────────────────────────────────────────┐
│ [Chat] [Notes] [+New]                   │
├─────────────────────────────────────────┤
│ 📁 general/                             │
│   📄 welcome.md                         │
│   📄 getting-started.md                 │
│ 📁 meeting/                             │
│   📄 team-standup-2024-01-15.md         │
│                                         │
├─────────────────────────────────────────┤
│ > Type your message...                  │
└─────────────────────────────────────────┘
```

**Enhanced Create Note Modal:**

```
┌─────────────────────────────────────────┐
│ ✨ Create New Note                      │
├─────────────────────────────────────────┤
│ Type: [📝 general ▼] [📋 Use Template]  │
│ Title: [my-awesome-note_________] ✓     │
│ Folder: [general/ ▼] (auto-selected)   │
│                                         │
│ Initial Content (optional):             │
│ ┌─────────────────────────────────────┐ │
│ │ # My Awesome Note                   │ │
│ │                                     │ │
│ │ Content starts here...              │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 💡 Pro tip: Use Cmd+N for quick access │
│        [Cancel] [Create & Edit] [⌨️]    │
└─────────────────────────────────────────┘
```

#### **User Experience Flow**

1. **Trigger:** User clicks "+" button, uses Cmd+N, or right-clicks in notes explorer
2. **Modal Appearance:** Smooth slide-in animation with focus on title field
3. **Real-time Feedback:** Live validation shows ✓/❌ for title availability
4. **Smart Suggestions:** Auto-complete for similar note names or templates
5. **Quick Creation:** Enter key creates note and opens editor immediately
6. **Error Recovery:** Clear error messages with suggested fixes

#### **Technical Implementation**

- **API Integration:** Uses `createNote()` method from Flint Note API
- **State Management:** Modal state managed via Svelte 5 runes (`$state`)
- **Validation:** Client-side validation with server-side confirmation
- **Performance:** Debounced validation checks (300ms delay)
- **Accessibility:** Full keyboard navigation and screen reader support

**Outcome:** Users can efficiently create new notes with a polished, intuitive interface that integrates seamlessly with the existing note management workflow, supporting both novice and power users.

### Phase 5: Pinned Notes ✅ COMPLETED

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

### Phase 9: Note Linking & Autocomplete COMPLETED

**Goal:** Enable seamless note linking with autocomplete functionality and clickable wikilinks for navigation.

**Key Components:**

#### **Wikilink Autocomplete**

- **Trigger:** `[[` inside CodeMirror opens a type-ahead list filtered by note titles & aliases.
- **UI:**
  • Popup below cursor (lightweight Svelte component)
  • Arrow / mouse selection, ↩ inserts `[[Title]]`
- **Data:** NoteService exposes `searchTitles(query)` with < 50 ms response.
- **Edge cases:** If note doesn't exist, offer **Create "New Note"** option.

#### **Clickable Wikilinks**

- **Visual Treatment:** Wikilinks (`[[Note Title]]`) are rendered as clickable elements with distinct styling:
  • Blue underlined text for existing notes
  • Red dotted underline for broken/missing links
  • Hover effects showing note preview tooltips
- **Click Behavior:** Clicking a wikilink loads the referenced note in the editor:
  • **Large screens:** Opens note in the right sidebar editor panel
  • **Medium screens:** Overlays the current editor content
  • **Small screens:** Navigates to full-screen note view
- **Link Resolution:**
  • Matches note titles exactly or by alias
  • Case-insensitive matching for user convenience
  • Handles special characters and spaces in note names
- **Broken Link Handling:** Clicking a broken wikilink offers to create the referenced note

#### **Navigation Integration**

- **History Stack:** Wikilink navigation integrates with the navigation history system (Phase 11)
- **Breadcrumbs:** Current note path shows linked note relationships
- **Back Navigation:** Standard back/forward controls work with wikilink traversal

**Technical Implementation:**

- **CodeMirror Extensions:** Custom extension for wikilink detection and rendering
- **Link Parser:** Regex-based parser for `[[...]]` patterns with alias support
- **Click Handlers:** Event delegation for efficient wikilink click handling
- **State Management:** Track currently linked notes and update UI reactively

### Phase 10: `@` Mentions for Context Injection

- **Chat Input Enhancements**
  • Typing `@` opens the same fuzzy list but shows notes _and_ special entities (agents, personas).
  • On selection, a pill (chip) is inserted after the cursor.
- **Prompt Assembly**
  • Renderer packages message text + referenced note IDs into IPC payload.
  • Main process loads note contents (trimmed to N tokens) and prepends them to the LLM prompt.
- **UX:** Hovering a chip shows note preview; Backspace removes.

### Phase 11: Navigation History

- **Model:** `historyStack: NoteId[]`, `cursor` index.
- **Controls:**
  • Toolbar ← → buttons in editor header
  • Keyboard: ⌘ [ and ⌘ ] (or Alt+←/→ Win/Linux)
- **Behavior:** Opening a link pushes the current note onto the stack, navigates to target. Going back pops/advances cursor.
- **Persist:** Session-only (reset on reload) for now.

### Phase 12: Global Search Bar COMPLETE

- **Placement:** Fixed at header center on desktop, hides behind ⌘ P / Ctrl P hotkey on mobile.
- **Scope Switcher:** Tabs or `⌥ 1-3` keys to filter **Notes / Commands / Vaults**.
- **Results:** Virtual list, arrow navigation, ↩ to open.
- **Tech:** Fuse.js fuzzy index kept in a Svelte `$derived` store that auto-rebuilds on note CRUD events.

### Phase 13: LLM Model Provider Selection ✅ COMPLETED

**Goal:** Allow users to switch between different LLM model providers and models directly from the chat interface.

**Key Components:**

#### **Model Provider Dropdown in Chat Interface**

- **Placement:** Integrated into the MessageInput component as a compact dropdown selector
- **Position:** Left side of the input container, before the text input field
- **Models Supported:**
  - OpenAI GPT models (gpt-3.5-turbo, gpt-4, gpt-4-turbo, gpt-4o)
  - Anthropic Claude models (claude-3-haiku, claude-3-sonnet, claude-3-opus, claude-3.5-sonnet)
  - Google Gemini models (gemini-pro, gemini-1.5-pro)
  - Meta Llama models (llama-3.1-8b, llama-3.1-70b, llama-3.1-405b)
  - Mistral models (mistral-7b, mixtral-8x7b, mixtral-8x22b)

#### **State Management**

- **Global Model State:** Reactive store that tracks the current selected model
- **Persistence:** Selected model preference saved to localStorage
- **Real-time Updates:** Model changes apply immediately to new conversations
- **Session Handling:** Current conversation continues with original model; new messages use selected model

#### **UI/UX Design**

```
┌─────────────────────────────────────────┐
│ [Chat] [Notes] [Pinned]                 │
├─────────────────────────────────────────┤
│                                         │
│  [User] Hello!                          │
│                                         │
│  [Agent] Hi there! How can I help?      │
│                                         │
├─────────────────────────────────────────┤
│ [GPT-4 ▼] Type your message...    [Send]│
└─────────────────────────────────────────┘
```

**Dropdown Design:**

```
┌─────────────────────────────────────────┐
│ 🤖 GPT-4                                │
├─────────────────────────────────────────┤
│ ✓ 🤖 GPT-4                              │
│   🤖 GPT-3.5 Turbo                      │
│   🧠 Claude 3.5 Sonnet                  │
│   🧠 Claude 3 Opus                      │
│   💎 Gemini Pro                         │
│   🦙 Llama 3.1 70B                      │
│   🌪️  Mixtral 8x7B                       │
└─────────────────────────────────────────┘
```

#### **Technical Implementation**

- **Frontend:** New `ModelSelector` Svelte component with provider icons and names
- **Backend:** Enhanced `AIService` with dynamic model switching capability
- **API Integration:** Unified interface through OpenRouter for all providers
- **Configuration:** Model definitions with display names, providers, and capabilities
- **Error Handling:** Graceful fallback to default model on API errors

#### **Provider-Specific Features**

- **Model Capabilities:** Different context lengths, multimodal support, tool usage
- **Cost Indication:** Optional cost-per-token display for usage awareness
- **Performance Hints:** Response time and capability indicators
- **Smart Defaults:** Remember user preference per vault or use-case

**Outcome:** Users can seamlessly switch between different AI models based on their needs - using cost-effective models for simple queries and powerful models for complex reasoning tasks.

### Phase 14: Settings Screen

**Goal:** Provide a dedicated settings interface for managing API keys and application preferences.

**Key Components:**

#### **Settings Access**

- **Settings Button:** Add a gear/settings icon in the main header or toolbar for easy access
- **Keyboard Shortcut:** Support Cmd/Ctrl+, (comma) for quick settings access
- **Settings Tab:** Option to add "Settings" as a fourth tab alongside Chat, Notes, and Pinned

#### **API Key Management**

- **Anthropic API Key:** Secure input field for Claude API configuration
  - Real-time validation to test key validity
  - Support for different Claude model access levels
  - Clear instructions for obtaining API keys
- **OpenAI API Key:** Input field for GPT model access
  - Organization ID field (optional)
  - Model availability verification
  - Usage monitoring and rate limiting info
- **Key Security:**
  - API keys stored securely in encrypted local storage
  - Option to show/hide key values (masked by default)
  - Clear warnings about key security and sharing

#### **Model Configuration**

- **Default Model Selection:** Set preferred default model per provider
- **Model Availability:** Show which models are accessible with current API keys
- **Cost Preferences:** Optional cost-per-token warnings and budgets
- **Context Length Settings:** Configure max context per model

#### **Application Preferences**

- **Theme Selection:** Light/Dark/System mode toggle
- **Auto-save Settings:** Configure debounce timing for note saves
- **Pinned Notes Limit:** Maximum number of pinned notes allowed
- **Chat History:** Retention settings and clear history option

**UI Mockup:**

```
┌─────────────────────────────────────────┐
│ [Chat] [Notes] [Pinned] [Settings]      │
├─────────────────────────────────────────┤
│ ⚙️  Settings                            │
│                                         │
│ 🔑 API Keys                             │
│ ┌─────────────────────────────────────┐ │
│ │ Anthropic: [sk-ant-***************] │ │
│ │ OpenAI:    [sk-proj-**************] │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 🤖 Model Preferences                    │
│ Default Model: [Claude 3.5 Sonnet ▼]   │
│ Show Costs: [✓] Warn at $10/month      │
│                                         │
│ 🎨 Appearance                           │
│ Theme: [⚫ Dark] [⚪ Light] [🖥️ System]  │
│                                         │
│ 💾 Data & Privacy                       │
│ Auto-save delay: [500ms ▼]              │
│ Chat history: [Keep 30 days ▼] [Clear] │
│                                         │
│        [Reset to Defaults] [Save]       │
├─────────────────────────────────────────┤
│ > Type your message...                  │
└─────────────────────────────────────────┘
```

#### **Settings Validation & Feedback**

- **Real-time Validation:** Test API keys immediately on input
- **Connection Status:** Visual indicators (✓/❌) for each provider
- **Error Messages:** Clear, actionable error messages for invalid configurations
- **Success Feedback:** Confirmation when settings are saved successfully

#### **Import/Export Settings**

- **Settings Backup:** Export all preferences to a JSON file (excluding API keys)
- **Settings Restore:** Import preferences from backup file
- **Reset Options:** Selective reset by category or complete reset to defaults

#### **Advanced Options**

- **Debug Mode:** Toggle for additional logging and diagnostics
- **Performance Settings:** Memory usage limits, cache size configuration
- **Proxy Configuration:** HTTP/HTTPS proxy settings for corporate networks
- **Custom Endpoints:** Override default API endpoints for self-hosted solutions

**Technical Implementation:**

- **Settings Store:** Dedicated Svelte store for managing all application settings
- **Secure Storage:** Use Electron's safeStorage API for sensitive data like API keys
- **Settings Persistence:** JSON configuration file with encrypted sensitive fields
- **Migration System:** Handle settings schema changes between app versions
- **Validation Service:** Centralized validation for all settings with async key testing

**Outcome:** Users can securely configure their API keys, customize their experience, and manage application behavior through an intuitive settings interface that prioritizes security and ease of use.

### Phase 15: Metadata Editor

- **Toggle:** "𝑖" icon in editor header (or `⌘ I`).
- **Layout:** Slide-over panel on right (desktop) or modal (mobile).
- **Fields:** Title (readonly), Tags (comma list with chips), Aliases, Created, Updated, Custom key-value.
- **Sync:**
  • Edits immediately mutate YAML front-matter in the buffer.
  • Debounced patch (< 300 ms) to NoteService.
- **Validation:** Inline errors for invalid YAML / dup keys.

## Accessibility

- `@` & `[[` popups are ARIA `listbox` with live region status.
- Search bar announces number of results.
- History buttons have tooltips and keyboard shortcuts.

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
