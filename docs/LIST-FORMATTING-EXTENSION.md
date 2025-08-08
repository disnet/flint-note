# List Formatting Extension

## Overview

The List Formatting Extension enhances CodeMirror's markdown rendering by replacing list markers with styled versions and implementing hanging indentation for wrapped text:

- **Unordered lists**: Replaces dash markers (`-`) with styled bullet points (`•`)
- **Ordered lists**: Styles numbered markers (`1.`, `2.`, etc.) with consistent formatting

## Implementation

### Core Components

#### 1. BulletWidget Class

- **Purpose**: Creates bullet point widgets to replace `- ` markers
- **Features**:
  - Renders `•` character with custom styling
  - Fixed width for consistent alignment
  - Non-interactive (userSelect: none, pointerEvents: none)

#### 2. NumberWidget Class

- **Purpose**: Creates numbered widgets for ordered lists (`1.`, `2.`, etc.)
- **Features**:
  - Renders numbers with consistent styling and color
  - Right-aligned with minimum width for proper alignment
  - Non-interactive (userSelect: none, pointerEvents: none)

#### 3. List Detection

- **Unordered Lists**: `/^(\s*)- (.*)$/` matches lines starting with optional whitespace + `- ` + content
- **Ordered Lists**: `/^(\s*)(\d+)\. (.*)$/` matches lines starting with optional whitespace + number + `. ` + content
- **Indent Calculation**: `Math.floor(indent.length / 2)` (2 spaces per indent level)

#### 4. Decoration Strategy

Three types of decorations are applied to each list item:

1. **Line Decoration**: Applies hanging indent styling to the entire line with list type classes
2. **Widget Decoration**: Inserts bullet (`•`) or number widget at marker position
3. **Replace Decoration**: Completely removes original markers (`- ` or `1. `) from document flow

### CSS Implementation

#### Hanging Indentation

```css
// Unordered lists - compact spacing for bullets
'.cm-list-unordered': {
  paddingLeft: '1.5ch',     // Space for bullet + content
  textIndent: '-1.5ch'      // Pull first line back
}

// Ordered lists - wider spacing for numbers
'.cm-list-ordered': {
  paddingLeft: '2.5ch',     // Space for numbers + content
  textIndent: '-2.5ch'      // Pull first line back
}
```

#### Wikilink Compatibility

```css
'.cm-list-line .wikilink': {
  textIndent: '0',          // Reset indent for wikilinks
  position: 'relative'      // Maintain positioning context
}
```

#### Widget Styling

```css
'.cm-list-bullet': {
  textIndent: '0',          // Reset indent for bullets
  display: 'inline-block'   // Proper layout behavior
}

'.cm-list-number': {
  textIndent: '0',          // Reset indent for numbers
  display: 'inline-block'   // Proper layout behavior
}
```

## Key Design Decisions

### 1. Complete Marker Replacement

- Uses `Decoration.replace()` to completely remove markers (`- ` or `1. `) from the document flow
- Prevents cursor navigation into hidden marker text
- Maintains clean cursor movement behavior while preserving document structure

### 2. Differentiated Spacing

- **Unordered lists**: `1.5ch` spacing optimized for bullet point width
- **Ordered lists**: `2.5ch` spacing accommodates wider number markers
- **Character units**: Using `ch` instead of `em` for consistent character-based alignment

### 3. Decoration Ordering

- Line decorations first (earliest position)
- Widget decorations second
- Mark decorations last
- Proper sorting prevents CodeMirror "ranges must be sorted" errors

## Extension Integration

### File Location

`src/renderer/src/lib/listFormatting.svelte.ts`

### Integration Points

```typescript
// In NoteEditor.svelte
import { listFormattingExtension } from '../lib/listFormatting.svelte.js';

// Added to CodeMirror extensions array
listFormattingExtension();
```

### Load Order

Extension loads after markdown language support but before content updates to ensure proper decoration application.

## Limitations

1. **Simple Nested Lists**: Only supports 2-space indentation pattern
2. **Bullet Character**: Fixed `•` character (not customizable)
3. **Markdown Only**: Specifically designed for markdown list syntax

## Benefits

1. **Visual Enhancement**: Clean bullet points improve readability
2. **Text Wrapping**: Proper hanging indentation for long list items
3. **Editor Compatibility**: Works with wikilinks, search, and other CodeMirror features
4. **Performance**: Efficient decoration-based approach with minimal DOM manipulation
5. **Maintainability**: Clean separation between logic and styling

## Future Enhancements

- Support for different bullet styles (•, -, \*, etc.)
- Configurable indentation levels
- Numbered list support
- Custom bullet characters per list level
