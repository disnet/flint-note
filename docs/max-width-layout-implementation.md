# Max-Width Responsive Layout Implementation Plan

## Overview
Implement a new max-width responsive layout for Flint that provides better space utilization on larger screens while maintaining the current layout at smaller breakpoints.

## Current State Analysis

### Current Layout Structure
- **App container**: `max-width: 70ch` with centered layout
- **Responsive breakpoints**: 
  - Large screens (>1200px): sidebar note editor
  - Medium screens (768-1200px): overlay note editor  
  - Small screens (<768px): fullscreen note editor
- **Layout components**:
  - Header with tabs and vault switcher
  - Main content area (chat/notes/pinned views)
  - Footer with message input
  - Note editor (conditional sidebar)

### Wireframe Requirements
Based on the provided wireframe, the new max-width layout should include:
1. **Header row**: Flint logo, search bar, vault switcher
2. **Content row with three columns**:
   - Left: Pinned notes section
   - Center: Chat messages area  
   - Right: Note editor section

## Implementation Plan

### Phase 1: Layout Structure Changes

#### 1.1 Update App.svelte Layout
- Remove current `max-width: 70ch` constraint for large screens
- Implement CSS Grid or Flexbox layout for three-column design
- Add responsive breakpoint logic:
  - **Large screens (>1400px)**: Three-column layout as per wireframe
  - **Medium/Small screens (<1400px)**: Keep current responsive behavior

#### 1.2 Header Redesign
- **Current**: Simple header with title and vault switcher
- **New**: Full-width header with three sections:
  - Left: Flint logo/brand
  - Center: Search bar component
  - Right: Vault switcher
- Maintain current header at smaller breakpoints

#### 1.3 Main Content Grid
Create three-column grid layout:
```css
.main-content {
  display: grid;
  grid-template-columns: 300px 1fr 400px;
  gap: 1rem;
  height: 100%;
}

@media (max-width: 1400px) {
  .main-content {
    /* Revert to current layout */
  }
}
```

### Phase 2: Component Updates

#### 2.1 Search Bar Component
- **Create new component**: `SearchBar.svelte`
- **Functionality**:
  - Global search across notes
  - Keyboard shortcut support (Cmd/Ctrl+K)
  - Autocomplete dropdown
  - Search scope options (notes, commands, etc.)
- **Integration**: Add to header center position

#### 2.2 Pinned Notes Panel
- **Modify existing**: `PinnedView.svelte`
- **Changes**:
  - Optimize for narrow left column (300px)
  - Compact list view
  - Drag-and-drop reordering
  - Collapsible/expandable sections
- **Always visible**: Show pinned notes in left panel instead of tab

#### 2.3 Chat Messages Center Panel
- **Modify existing**: `ChatView.svelte` 
- **Changes**:
  - Optimize for center column (flexible width)
  - Ensure proper scroll behavior
  - Maintain message threading
  - Responsive message bubbles

#### 2.4 Note Editor Right Panel
- **Modify existing**: `NoteEditor.svelte`
- **Changes**:
  - Fixed right column width (400px)
  - Always visible when note is selected
  - Collapsible/closeable
  - Maintain all current editing features

### Phase 3: Responsive Behavior

#### 3.1 Breakpoint Strategy
- **Large (>1400px)**: New three-column layout
- **Medium (1000-1400px)**: Two-column (chat + note editor, pinned as overlay/modal)
- **Small (<1000px)**: Current single-column responsive behavior

#### 3.2 Progressive Enhancement
- Graceful degradation to current layout
- Maintain all existing functionality
- Smooth transitions between layouts
- Preserve user preferences/state

### Phase 4: State Management Updates

#### 4.1 Layout State
- Add layout mode state (`three-column`, `two-column`, `single-column`)
- Update responsive logic in App.svelte
- Persist layout preferences

#### 4.2 Panel Visibility
- Track which panels are open/closed
- Handle panel collapsing/expanding
- Maintain state across sessions

### Phase 5: Styling and Polish

#### 5.1 CSS Grid Implementation
```css
.max-width-layout {
  max-width: 1600px;
  margin: 0 auto;
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  grid-template-areas: 
    "header header header"
    "pinned chat editor"
    "footer footer footer";
}

.header { grid-area: header; }
.pinned-panel { grid-area: pinned; }
.chat-panel { grid-area: chat; }
.editor-panel { grid-area: editor; }
.footer { grid-area: footer; }
```

#### 5.2 Visual Enhancements
- Panel borders/separators
- Consistent spacing
- Smooth transitions
- Loading states
- Empty states for each panel

## Technical Considerations

### Performance
- Virtual scrolling for long chat histories in center panel
- Lazy loading of pinned notes
- Debounced search functionality

### Accessibility
- Keyboard navigation between panels
- Focus management
- Screen reader support
- High contrast mode compatibility

### Browser Compatibility
- CSS Grid fallbacks
- Modern browser features
- Mobile touch interactions

## Implementation Steps

1. **Update App.svelte** with new grid layout structure
2. **Create SearchBar.svelte** component
3. **Modify header** to accommodate three sections
4. **Update PinnedView.svelte** for left panel optimization
5. **Adjust ChatView.svelte** for center panel
6. **Modify NoteEditor.svelte** for right panel
7. **Implement responsive breakpoints**
8. **Add state management** for layout modes
9. **Style and polish** the new layout
10. **Test across different screen sizes**

## Success Criteria

- [ ] Three-column layout works on screens >1400px
- [ ] Current responsive behavior preserved on smaller screens
- [ ] All existing functionality maintained
- [ ] Smooth transitions between layout modes
- [ ] Search bar functional and integrated
- [ ] Pinned notes always visible on large screens
- [ ] Note editor properly sized and functional
- [ ] Performance remains optimal
- [ ] Accessibility standards met

## Future Enhancements

- Resizable panels with drag handles
- Customizable panel layouts
- Multiple note editors (tabs or splits)
- Advanced search filters and scopes
- Panel bookmarking/workspace saving