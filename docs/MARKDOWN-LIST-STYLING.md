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

### 2. Dynamic Measurement System

The core challenge is that CSS `ch` units don't precisely match actual character widths, even in monospace fonts. We need to dynamically measure the pixel width of list markers.

#### Measurement Approach

1. **Text Width Measurement Utility**
   - Create a hidden measurement element with identical font properties
   - Measure actual pixel widths of common markers: `"- "`, `"* "`, `"+ "`, `"1. "`, `"10. "`, etc.
   - Update CSS custom properties with these measured values

2. **CSS Custom Properties Integration**

```css
:root {
  --list-marker-dash-width: 0px;     /* "- " width */
  --list-marker-num1-width: 0px;     /* "1. " width */
  --list-marker-num2-width: 0px;     /* "10. " width */
  --list-marker-num3-width: 0px;     /* "100. " width */
  --list-base-indent: 0px;           /* 2-space indent width */
}

/* Level 0: no negative indent, continuation aligns with text */
.cm-list-level-0 {
  text-indent: 0;
  padding-left: 0;
}

.cm-list-level-0.cm-list-continuation.cm-list-marker-dash {
  padding-left: var(--list-marker-dash-width);
}

.cm-list-level-0.cm-list-continuation.cm-list-marker-num1 {
  padding-left: var(--list-marker-num1-width);
}

/* Level 1: indented, continuation aligns with nested text */  
.cm-list-level-1 {
  padding-left: var(--list-base-indent);
}

.cm-list-level-1.cm-list-continuation.cm-list-marker-dash {
  padding-left: calc(var(--list-base-indent) + var(--list-marker-dash-width));
}

/* Dynamic marker-specific styling for each level/marker combination */
```

3. **Measurement Implementation**

```typescript
interface MarkerWidths {
  dash: number;      // "- "
  star: number;      // "* " 
  plus: number;      // "+ "
  num1: number;      // "1. "
  num2: number;      // "10. "
  num3: number;      // "100. "
  baseIndent: number; // "  " (2 spaces)
}

function measureMarkerWidths(editorElement: Element): MarkerWidths {
  const measurer = document.createElement('div');
  measurer.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: nowrap;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    line-height: inherit;
  `;
  
  editorElement.appendChild(measurer);
  
  const widths = {
    dash: measureText(measurer, '- '),
    star: measureText(measurer, '* '),
    plus: measureText(measurer, '+ '),
    num1: measureText(measurer, '1. '),
    num2: measureText(measurer, '10. '),
    num3: measureText(measurer, '100. '),
    baseIndent: measureText(measurer, '  ')
  };
  
  editorElement.removeChild(measurer);
  return widths;
}

function measureText(element: HTMLElement, text: string): number {
  element.textContent = text;
  return element.getBoundingClientRect().width;
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

#### Dynamic Marker Width System
Instead of assuming character counts, markers are measured dynamically:
- Measure actual pixel width of each marker type in the current font
- Store measurements in CSS custom properties
- Apply marker-specific CSS classes for precise continuation alignment
- Re-measure when font or theme changes

### 4. Integration Points

#### NoteEditor.svelte Changes
- Import the new list styling extension and measurement utility
- Add to the extensions array in `createEditor()` and `updateEditorTheme()`
- Call measurement function when editor is created or theme changes
- Update CSS custom properties with measured values

#### CSS Integration
- Add list styling rules to the existing `editorTheme` using CSS custom properties
- Ensure compatibility with light/dark theme switching
- Re-measure and update custom properties when font or theme changes
- Maintain consistency with the iA Writer Quattro font metrics through dynamic measurement

#### Measurement Triggers
- Initial editor creation
- Theme changes (light/dark mode switching)
- Font size changes (if implemented)
- Editor element resize (potential font scaling)

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
- Cache measurement results to avoid repeated DOM measurements
- Throttle measurement updates during rapid theme changes

#### Measurement Accuracy Challenges
- Ensure measurement element inherits exact font properties from editor
- Handle potential subpixel rendering differences across browsers
- Account for potential font loading delays
- Validate measurements across different zoom levels

### 6. Implementation Files

#### New Files
- `src/renderer/src/lib/markdownListStyling.ts` - Main CodeMirror extension implementation
- `src/renderer/src/lib/markdownListParser.ts` - Line parsing and classification logic  
- `src/renderer/src/lib/textMeasurement.ts` - Dynamic text width measurement utility

#### Modified Files
- `src/renderer/src/components/NoteEditor.svelte` - Integration, measurement calls, CSS custom property updates

### 7. Testing Strategy

#### Manual Testing
- Various list nesting scenarios
- Mixed content (paragraphs, lists, code blocks)
- Real-time editing behavior
- Theme switching (light/dark mode)
- Long lists with scrolling
- Measurement accuracy across different marker types
- Font rendering consistency across browsers

#### Edge Case Testing
- Empty list items
- Very long list items that wrap multiple times
- Lists with varying marker types
- Copy/paste operations
- Undo/redo functionality

## Expected Outcome

The implementation will provide visually consistent markdown list formatting that:
- Maintains pixel-perfect text alignment for continuation lines through dynamic measurement
- Respects the actual character widths in iA Writer Quattro font
- Updates dynamically as the user types and when themes change
- Works seamlessly with existing CodeMirror features
- Supports both light and dark themes with automatic re-measurement
- Provides accurate indentation regardless of browser rendering differences

This enhancement will significantly improve the writing experience for users creating structured content with nested lists in the note editor, ensuring perfect visual alignment that matches the user's expectations for professional text editing.