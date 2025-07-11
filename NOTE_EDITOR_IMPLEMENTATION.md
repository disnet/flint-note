# Note Editor Implementation

## Overview

This document describes the implementation of the note editor feature for the Flint Electron application. The note editor allows users to view and edit notes that are referenced in chat conversations, with full file system synchronization.

## Features Implemented

### 1. Responsive Note Editor Layout
- **Desktop (≥1200px)**: Note editor opens as a sidebar on the right side
- **Tablet (768px-1199px)**: Note editor opens as an overlay modal
- **Mobile (<768px)**: Note editor opens in fullscreen mode

### 2. File System Integration
- **Read Notes**: Uses MCP `get_note` tool to load note content
- **Save Notes**: Uses MCP `update_note` tool to save changes
- **Auto-save**: Debounced saving after 1 second of inactivity
- **Manual Save**: Ctrl+S (Cmd+S on Mac) for immediate save

### 3. User Interface Features
- **Visual Status Indicators**: Loading, saving, saved, and error states
- **Note Metadata**: Display of note type, title, and path
- **Word Count**: Real-time word count display
- **Keyboard Shortcuts**: ESC to close, Ctrl+S to save
- **Accessibility**: Proper ARIA labels and keyboard navigation

### 4. State Management
- **Reactive Store**: Svelte 5 runes-based state management
- **Global State**: Note editor state accessible across components
- **Layout Awareness**: Responsive layout adjustments

## File Structure

```
src/renderer/src/
├── components/
│   ├── NoteEditor.svelte              # Basic note editor component
│   ├── NoteEditorLayout.svelte        # Advanced responsive layout
│   ├── Chat.svelte                    # Updated with note editor integration
│   └── NoteReferenceComponent.svelte  # Clickable note references
├── stores/
│   └── noteEditor.ts                  # Note editor state management
├── types/
│   └── chat.ts                        # Type definitions including NoteReference
└── App.svelte                         # Main app with note editor integration
```

## Implementation Details

### Note Editor Store

The `noteEditorStore` manages the global state of the note editor:

```typescript
interface NoteEditorState {
  isOpen: boolean;
  activeNote: NoteReference | null;
  content: string;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;
}
```

### MCP Integration

The note editor integrates with the Model Context Protocol (MCP) to perform file operations:

- **get_note**: Loads note content by title
- **update_note**: Saves note content changes
- **search_notes**: Finds notes by title or content for note reference parsing

### Message Parsing with MCP

The message parser has been updated to use real MCP calls instead of mock data:

- **Real-time Note Resolution**: Note references like `[[Note Title]]` are resolved using MCP search
- **Caching**: Note references are cached to avoid repeated MCP calls
- **Async/Sync Support**: Both async and sync parsing methods available
- **Loading States**: Notes show loading state while being resolved
- **Broken Reference Handling**: Invalid note references are marked as broken

### Responsive Layout Logic

The layout adapts based on screen size:

```typescript
const updateLayoutMode = () => {
  if (window.innerWidth < 768) {
    layoutMode = 'fullscreen';
  } else if (window.innerWidth < 1200) {
    layoutMode = 'overlay';
  } else {
    layoutMode = 'sidebar';
  }
};
```

### Auto-save Implementation

Notes are automatically saved after a 1-second delay:

```typescript
const handleContentChange = () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveNote();
  }, AUTOSAVE_DELAY);
};
```

## API Extensions

### Preload Script Updates

Added file system APIs to the preload script:

```typescript
fileSystem: {
  readFile: (filePath: string) => Promise<{success: boolean, content?: string, error?: string}>;
  writeFile: (filePath: string, content: string) => Promise<{success: boolean, error?: string}>;
  watchFile: (filePath: string) => Promise<{success: boolean, error?: string}>;
  unwatchFile: (filePath: string) => Promise<{success: boolean, error?: string}>;
  onFileChange: (callback: (filePath: string, content: string) => void) => void;
  removeFileListeners: () => void;
}
```

### Main Process Extensions

Added IPC handlers for file system operations:

- `fs:read-file`: Read file content
- `fs:write-file`: Write file content
- `fs:watch-file`: Watch file for changes
- `fs:unwatch-file`: Stop watching file
- `fs:file-changed`: Emit file change events

## Usage Flow

### Note Reference Parsing
1. **Message Display**: When chat messages are displayed, note references like `[[Note Title]]` are parsed
2. **MCP Resolution**: The message parser uses MCP `search_notes` to resolve note references
3. **Visual Indicators**: Notes show different states (loading, found, broken) with appropriate icons
4. **Caching**: Successfully resolved notes are cached for better performance

### Note Editing
1. **Opening Notes**: User clicks on a resolved note reference in the chat
2. **Note Loading**: `handleNoteOpen` in Chat component calls `noteEditorStore.openNote()`
3. **Content Loading**: Note editor loads content using MCP `get_note` tool
4. **Editing**: User can edit content with auto-save functionality
5. **Saving**: Changes are saved using MCP `update_note` tool
6. **Closing**: User can close with ESC key or close button

## Error Handling

The implementation includes comprehensive error handling:

- **Loading Errors**: Display error messages when notes fail to load
- **Saving Errors**: Show error status when saves fail
- **Network Errors**: Handle MCP connection issues
- **Invalid Responses**: Handle unexpected response formats

## Accessibility Features

- **ARIA Labels**: Proper labeling for screen readers
- **Keyboard Navigation**: Full keyboard support
- **Focus Management**: Proper focus handling on open/close
- **High Contrast**: Respects system color preferences

## Dark Mode Support

The note editor fully supports dark mode:

- **Automatic Detection**: Uses `prefers-color-scheme` media query
- **Consistent Styling**: Matches app's dark mode theme
- **Proper Contrast**: Ensures readability in both modes

## Mobile Optimization

Special considerations for mobile devices:

- **Touch-friendly**: Larger touch targets
- **Responsive Text**: Appropriate font sizes
- **Fullscreen Mode**: Maximizes writing space
- **Virtual Keyboard**: Proper handling of on-screen keyboards

## Testing

To test the note editor:

1. **Start the application**: `npm run dev`
2. **Open chat interface**: Navigate to the chat tab
3. **Send a message**: Ask the agent about notes or create a note
4. **Test note references**: Look for `[[Note Title]]` style references in agent responses
5. **Verify resolution**: Note references should show appropriate icons (⏳ loading, ✅ found, ❌ broken)
6. **Click note references**: Click on any resolved note reference in the chat
7. **Edit content**: The note editor should open with the note content
8. **Test auto-save**: Make changes and wait for auto-save
9. **Test keyboard shortcuts**: Use Ctrl+S to save, ESC to close

### Testing Note References

You can test note reference parsing by:
1. Creating messages with `[[Note Title]]` syntax
2. Verifying that existing notes are resolved and clickable
3. Testing that non-existent notes show as broken references
4. Checking that the cache works by repeated references to the same note

## Future Enhancements

Potential improvements for future versions:

- **Syntax Highlighting**: Add markdown syntax highlighting
- **Split View**: Side-by-side editing and preview
- **Collaborative Editing**: Real-time collaboration support
- **Version History**: Track and restore previous versions
- **Plugin System**: Extensible editor plugins
- **Advanced Search**: Search within note content
- **Export Options**: Export notes to various formats
- **Smart Note Suggestions**: AI-powered note recommendations
- **Batch Operations**: Edit multiple notes simultaneously
- **Real-time Sync**: Live updates when notes change externally

## Performance Considerations

- **Debounced Saving**: Prevents excessive save operations
- **Lazy Loading**: Content loaded only when needed
- **Memory Management**: Proper cleanup of timeouts and listeners
- **Virtual Scrolling**: For large note content (future enhancement)
- **Note Reference Caching**: Reduces redundant MCP calls
- **Async/Sync Parsing**: Supports both immediate display and background resolution
- **Batch MCP Operations**: Multiple note lookups performed in parallel

## Security Notes

- **Input Sanitization**: Content is handled safely
- **File System Access**: Controlled through MCP tools
- **XSS Prevention**: Proper handling of user content
- **Path Validation**: Secure file path handling

## Dependencies

The note editor implementation uses:

- **Svelte 5**: For reactive UI components
- **TypeScript**: For type safety
- **MCP SDK**: For file system operations
- **Electron**: For desktop integration