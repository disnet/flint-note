


## Fixed Editor Cursor Reset and Title Flash on Save - 2025-10-20

- Fixed cursor jumping to beginning and title flashing when typing due to unnecessary reactive state updates during autosave: **noteDocumentRegistry** was reloading documents on every `note.updated` event (self-triggered by saves), causing content re-fetch and editor re-render; changed to only reload on `file.external-change` events from file watcher (for VSCode/vim/git edits), preventing self-triggered reloads while preserving external change detection; **noteCache** was creating new note objects on every update even when values unchanged (e.g., same `modified` timestamp), causing props to change and trigger re-renders; added change detection to skip updates when values haven't actually changed, preventing unnecessary component re-renders; also improved file watcher internal change detection with longer timeout (1000ms vs 500ms) and dual-layer tracking to ensure autosaves never misidentified as external changes

## Fixed File Watcher Test Failures Due to Increased Timeout - 2025-10-20

- Fixed file-watcher tests failing after increasing WRITE_FLAG_CLEANUP_MS from 500ms to 1000ms: tests were creating notes and immediately performing external edits within the write flag cleanup window, causing external changes to be incorrectly identified as internal; updated tests to wait 1200ms (> WRITE_FLAG_CLEANUP_MS) after note creation before performing external file operations, ensuring write flag has fully cleared before testing external change detection; all 536 tests now passing
