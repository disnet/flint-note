# Markdown List Styling Enhancement Plan

## Overview

This document outlines the implementation plan for improving markdown list text wrapping in the CodeMirror editor within the NoteEditor component. The goal is to achieve proper text alignment for continuation lines in nested markdown lists.

## Current Setup Analysis

The NoteEditor uses:
- CodeMirror 6 with `@codemirror/lang-markdown`
- `EditorView.lineWrapping` enabled
- Custom light/dark themes
- iA Writer Quattro font (monospace, 14px, 1.5 line height)

## Desired Behavior

Transform the current wrapping behavior:

```
- level 0 item
should wrap like this
  - level 1 item should
  wrap like this
```

Into proper alignment:

```
a normal paragraph

- level 0 item
  should wrap like this
  - level 1 item should
    wrap like this
- back to level 0
  item and its wrapping
```

### Key Requirements

1. **No negative indentation** for level 0 lists
2. **Proper text alignment** for continuation lines at each nesting level
3. **Consistent spacing** that respects the monospace font metrics
4. **Real-time updates** as the user types

## Implementation Strategy

### 1. Custom CodeMirror Extension

Create a decoration extension that:
- Identifies markdown list lines using regex patterns
- Detects list markers: `- `, `* `, `+ `, `1. `, `2. `, etc.
- Calculates nesting levels based on leading whitespace
- Distinguishes between marker lines and continuation lines
- Applies appropriate CSS classes for styling

### 2. CSS-Based Indentation System

Use CSS `text-indent` and `padding-left` properties:

```css
/* Level 0: no negative indent, continuation aligns with text */
.cm-list-level-0 {
  text-indent: 0;
  padding-left: 0;
}

.cm-list-level-0.cm-list-continuation {
  padding-left: 2ch; /* width of "- " marker */
}

/* Level 1: indented, continuation aligns with nested text */  
.cm-list-level-1 {
  padding-left: 2ch;
}

.cm-list-level-1.cm-list-continuation {
  padding-left: 4ch; /* base indent + marker width */
}

/* Level 2 and beyond follow the same pattern */
.cm-list-level-2 {
  padding-left: 4ch;
}

.cm-list-level-2.cm-list-continuation {
  padding-left: 6ch;
}
```

### 3. Extension Architecture

#### Line Classification
- **Marker Line**: Contains a list marker (`- text`, `1. text`)
- **Continuation Line**: Wrapped text from a list item
- **Normal Line**: Not part of a list structure

#### Nesting Level Detection
- Count leading spaces/tabs to determine indentation
- Convert tabs to equivalent spaces (typically 2 or 4 spaces)
- Calculate level: `level = Math.floor(leadingSpaces / indentSize)`

#### Marker Width Calculation
Different markers require different continuation indents:
- `- `, `* `, `+ `: 2 characters
- `1. `: 3 characters  
- `10. `: 4 characters
- `100. `: 5 characters

### 4. Integration Points

#### NoteEditor.svelte Changes
- Import the new list styling extension
- Add to the extensions array in `createEditor()` and `updateEditorTheme()`
- Include CSS classes in the `editorTheme` object

#### CSS Integration
- Add list styling rules to the existing `editorTheme`
- Ensure compatibility with light/dark theme switching
- Maintain consistency with the iA Writer Quattro font metrics

### 5. Technical Challenges

#### Dynamic Content Updates
- Efficiently re-parse and re-decorate lines as content changes
- Handle insertions, deletions, and modifications
- Minimize performance impact during rapid typing

#### Edge Cases
- Empty list items: `- \n- item`
- Mixed marker types within the same list
- Deeply nested lists (6+ levels)
- Lists immediately following other content
- Lists at the beginning/end of the document

#### Performance Considerations
- Use efficient regex patterns for line parsing
- Implement incremental updates rather than full re-parsing
- Cache decoration results where possible

### 6. Implementation Files

#### New Files
- `src/renderer/src/lib/markdownListStyling.ts` - Main extension implementation
- `src/renderer/src/lib/markdownListParser.ts` - Line parsing logic

#### Modified Files
- `src/renderer/src/components/NoteEditor.svelte` - Integration
- Potentially `src/renderer/src/assets/fonts.css` - Additional CSS if needed

### 7. Testing Strategy

#### Manual Testing
- Various list nesting scenarios
- Mixed content (paragraphs, lists, code blocks)
- Real-time editing behavior
- Theme switching
- Long lists with scrolling

#### Edge Case Testing
- Empty list items
- Very long list items that wrap multiple times
- Lists with varying marker types
- Copy/paste operations
- Undo/redo functionality

## Expected Outcome

The implementation will provide visually consistent markdown list formatting that:
- Maintains proper text alignment for continuation lines
- Respects the monospace font characteristics
- Updates dynamically as the user types
- Works seamlessly with existing CodeMirror features
- Supports both light and dark themes

This enhancement will significantly improve the writing experience for users creating structured content with nested lists in the note editor.