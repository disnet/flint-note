# List Formatting Extension

## Overview

The List Formatting Extension enhances CodeMirror's markdown rendering by replacing dash markers (`-`) with styled bullet points (`•`) and implementing hanging indentation for wrapped text.

## Implementation

### Core Components

#### 1. BulletWidget Class
- **Purpose**: Creates bullet point widgets to replace `- ` markers
- **Features**: 
  - Renders `•` character with custom styling
  - Supports nested lists with appropriate indentation
  - Non-interactive (userSelect: none, pointerEvents: none)

#### 2. List Detection
- **Regex**: `/^(\s*)- (.*)$/` matches lines starting with optional whitespace + `- ` + content
- **Indent Calculation**: `Math.floor(indent.length / 2)` (2 spaces per indent level)

#### 3. Decoration Strategy
Three types of decorations are applied to each list item:

1. **Line Decoration**: Applies hanging indent styling to the entire line
2. **Widget Decoration**: Inserts bullet widget at marker position  
3. **Mark Decoration**: Hides original `- ` marker with `opacity: 0`

### CSS Implementation

#### Hanging Indentation
```css
'.cm-list-line': {
  paddingLeft: '1.5em',     // Space for content
  textIndent: '-1.5em',     // Pull first line back
  position: 'relative'
}
```

#### Wikilink Compatibility
```css
'.cm-list-line .wikilink': {
  textIndent: '0',          // Reset indent for wikilinks
  position: 'relative'      // Maintain positioning context
}
```

#### Bullet Styling
```css
'.cm-list-bullet': {
  textIndent: '0',          // Reset indent for bullets
  display: 'inline-block'   // Proper layout behavior
}
```

## Key Design Decisions

### 1. Non-Destructive Text Replacement
- Uses `Decoration.mark()` to hide `- ` instead of `Decoration.replace()`
- Preserves underlying document structure
- Prevents conflicts with other decorations (wikilinks, search highlighting)

### 2. Selective CSS Reset
- Line-level `text-indent: -1.5em` creates hanging indent effect
- Element-level `text-indent: 0` on wikilinks prevents positioning issues
- Maintains compatibility with existing editor features

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
listFormattingExtension()
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

- Support for different bullet styles (•, -, *, etc.)
- Configurable indentation levels
- Numbered list support
- Custom bullet characters per list level