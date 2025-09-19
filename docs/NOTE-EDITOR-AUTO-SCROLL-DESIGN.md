# Note Editor Auto-Scroll Design

## Overview

This document outlines the design and implementation plan for adding viewport auto-scrolling functionality to the note editor. The goal is to automatically scroll the viewport when typing or moving the cursor gets close to the edges of the visible area, providing a smoother editing experience.

## Current Editor Architecture Analysis

### **Existing Components**

```
NoteEditor.svelte (400 lines)
├── CodeMirrorEditor.svelte - Pure editor component with CodeMirror 6
├── EditorConfig.svelte.ts - Theme & extensions management
├── CursorPositionManager.svelte.ts - Cursor persistence
└── AutoSave.svelte.ts - Auto-save functionality
```

### **Current Scrolling Behavior**

1. **Basic scrollIntoView**: Used when restoring cursor positions (`scrollIntoView: !!selection`)
2. **Scroll styling**: Custom scrollbar styling for default and daily-note variants
3. **Bottom margin**: 25vh bottom margin in default variant for comfortable scrolling
4. **No auto-scroll**: Currently no automatic scrolling when cursor approaches viewport edges

### **CodeMirror 6 Integration**

- Uses modern EditorView with extensions system
- Clean separation between editor logic and configuration
- Variant support (default vs daily-note) with different scroll behaviors

## Problem Statement

When typing in long notes or moving the cursor near the bottom of the viewport, users need to manually scroll to continue editing. This breaks the flow of writing and can be jarring when the cursor disappears from view.

## Auto-Scroll Design Solution

### **Architecture Analysis: Container vs CodeMirror Scrolling**

**Current Implementation:**
- CodeMirror instances are sized to `flex: 1` (100% height of container)
- Scrolling happens at the container level (`.note-content` in `MainView.svelte`)
- Container has `overflow: auto` and custom scrollbar styling

**Problem with CodeMirror ScrollMargins:**
- `EditorView.scrollMargins` only works when CodeMirror handles scrolling
- Current architecture scrolls the containing div, not CodeMirror itself
- Would require major layout changes to make CodeMirror the scroll container

### **Approach 1: Container-Based Auto-Scroll (Recommended)**

Monitor CodeMirror cursor position and trigger auto-scrolling on the containing div when cursor approaches viewport edges.

**Benefits:**
- ✅ Works with existing architecture - no layout changes needed
- ✅ Maintains consistent scrolling behavior for entire note content
- ✅ Preserves existing scroll styling and customization
- ✅ User expects entire note view to scroll as a unit
- ✅ Handles headers, metadata, and editor content uniformly

**Implementation:**
```typescript
// ScrollAutoService.svelte.ts
class ScrollAutoService {
  private cursorElement: HTMLElement | null = null;
  private scrollContainer: HTMLElement | null = null;
  private config = {
    topMargin: 75,    // Pixels from top edge to trigger scroll
    bottomMargin: 150 // Pixels from bottom edge to trigger scroll
  };

  setupAutoScroll(editorView: EditorView, container: HTMLElement) {
    this.scrollContainer = container;
    this.attachCursorMonitoring(editorView);
  }

  private attachCursorMonitoring(editorView: EditorView) {
    // Monitor cursor position changes
    // Calculate cursor position relative to viewport
    // Trigger container scrolling when in margin zones
  }
}
```

### **Approach 2: Restructure to CodeMirror Scrolling**

Change architecture to make CodeMirror handle all scrolling using `EditorView.scrollMargins`.

**Benefits:**
- ✅ Uses CodeMirror's built-in, well-tested functionality
- ✅ Automatically handles all cursor movement types

**Drawbacks:**
- ❌ Requires significant layout restructuring
- ❌ Headers and metadata would need repositioning
- ❌ Loss of unified scroll behavior for note content
- ❌ Need to rebuild custom scrollbar styling for CodeMirror

### **Approach 3: Hybrid Solution**

Implement container-based auto-scroll with optional CodeMirror scrollMargins for enhanced scenarios.

## Recommended Implementation Plan

### **Phase 1: Container-Based Auto-Scroll Service**

1. **Create ScrollAutoService**
   ```typescript
   // stores/scrollAutoService.svelte.ts
   export class ScrollAutoService {
     private scrollContainer: HTMLElement | null = null;
     private editorView: EditorView | null = null;
     private isEnabled = true;
     private config = {
       topMargin: 75,
       bottomMargin: 150,
       smoothScroll: false,
       debounceMs: 50
     };

     setupAutoScroll(editorView: EditorView, container: HTMLElement) {
       this.editorView = editorView;
       this.scrollContainer = container;
       this.attachCursorListener();
     }

     private attachCursorListener() {
       // Listen to cursor position changes
       // Calculate if cursor is in scroll trigger zones
       // Trigger smooth container scrolling
     }
   }
   ```

2. **Integrate with CodeMirrorEditor**
   ```typescript
   // In CodeMirrorEditor.svelte
   import { ScrollAutoService } from '../stores/scrollAutoService.svelte.js';

   const scrollAutoService = new ScrollAutoService({
     variant: variant === 'daily-note' ? 'compact' : 'default'
   });

   $effect(() => {
     if (editorView && scrollContainer) {
       scrollAutoService.setupAutoScroll(editorView, scrollContainer);
     }
   });
   ```

3. **Find Scroll Container**
   ```typescript
   // Find the nearest scrollable parent (.note-content in MainView)
   function findScrollContainer(element: HTMLElement): HTMLElement | null {
     let parent = element.parentElement;
     while (parent) {
       const style = getComputedStyle(parent);
       if (style.overflow === 'auto' || style.overflowY === 'auto') {
         return parent;
       }
       parent = parent.parentElement;
     }
     return null;
   }
   ```

4. **Configuration Options**
   ```typescript
   interface AutoScrollConfig {
     enabled: boolean;
     topMargin: number;
     bottomMargin: number;
     smoothScroll: boolean;
     variant: 'default' | 'daily-note';
   }
   ```

### **Phase 2: Enhanced Container Auto-Scroll**

1. **Advanced Scroll Triggering**
   ```typescript
   private calculateScrollTarget(cursorRect: DOMRect): number | null {
     const containerRect = this.scrollContainer!.getBoundingClientRect();
     const cursorTop = cursorRect.top - containerRect.top;
     const cursorBottom = cursorRect.bottom - containerRect.top;

     // Check if cursor is in top margin zone
     if (cursorTop < this.config.topMargin) {
       return Math.max(0, this.scrollContainer!.scrollTop - this.config.topMargin);
     }

     // Check if cursor is in bottom margin zone
     if (cursorBottom > containerRect.height - this.config.bottomMargin) {
       return this.scrollContainer!.scrollTop + this.config.bottomMargin;
     }

     return null; // No scroll needed
   }
   ```

2. **Smooth Container Scrolling**
   ```typescript
   private smoothScrollTo(targetY: number) {
     if (this.config.smoothScroll) {
       this.scrollContainer!.scrollTo({
         top: targetY,
         behavior: 'smooth'
       });
     } else {
       this.scrollContainer!.scrollTop = targetY;
     }
   }
   ```

3. **Visual Feedback (Optional)**
   ```typescript
   private addScrollZoneIndicators() {
     // Add subtle visual indicators when cursor is in scroll trigger zones
     const indicator = document.createElement('div');
     indicator.className = 'auto-scroll-indicator';
     // Position and style the indicator
   }
   ```

## Configuration Options

### **Default Configuration**

```typescript
const defaultAutoScrollConfig = {
  enabled: true,
  bottomMargin: 150,  // Pixels from bottom edge to trigger scroll
  topMargin: 75,      // Pixels from top edge to trigger scroll
  smoothScroll: false, // Use smooth scrolling animation
  debounceMs: 50      // Debounce cursor position changes
};
```

### **Variant-Specific Configuration**

```typescript
const autoScrollConfigs = {
  'default': {
    enabled: true,
    bottomMargin: 150,   // Larger margin for full editor
    topMargin: 75,
    smoothScroll: false, // Immediate scrolling for responsiveness
    debounceMs: 50
  },
  'daily-note': {
    enabled: true,
    bottomMargin: 100,   // Smaller margin for compact layout
    topMargin: 50,
    smoothScroll: true,  // Smoother for daily editing workflow
    debounceMs: 30       // More responsive for short entries
  }
};
```

## Integration with Existing Architecture

### **Minimal Changes Required**

1. **New file**: `stores/scrollAutoService.svelte.ts` - Auto-scroll service implementation
2. **CodeMirrorEditor.svelte**: Import and initialize scroll auto service
3. **MainView.svelte**: Ensure scroll container is accessible (already implemented)
4. **No changes needed**: NoteEditor.svelte, cursor management, auto-save, existing scroll styling

### **Backward Compatibility**

- ✅ Auto-scroll is additive, doesn't break existing behavior
- ✅ Can be disabled via configuration
- ✅ Preserves existing container scroll styling (`.note-content::-webkit-scrollbar`)
- ✅ Works with existing cursor position restoration
- ✅ Maintains unified scroll behavior for headers, metadata, and editor content

### **Testing Strategy**

1. **Unit Tests**: Test scroll auto service configuration and trigger calculations
2. **Integration Tests**: Test container scrolling with different cursor movements
3. **Manual Testing**:
   - Typing at bottom of viewport triggers auto-scroll
   - Arrow key navigation near edges
   - Mouse cursor placement in margin zones
   - Scroll restoration after note switching
   - Performance with long documents
   - Different note variants (default vs daily-note)

## Implementation Details

### **Container Auto-Scroll Algorithm**

```typescript
// Core auto-scroll logic
function checkAndScroll(editorView: EditorView) {
  // 1. Get cursor position in document
  const cursorPos = editorView.state.selection.main.head;
  const cursorCoords = editorView.coordsAtPos(cursorPos);

  // 2. Calculate cursor position relative to scroll container
  const containerRect = scrollContainer.getBoundingClientRect();
  const relativeTop = cursorCoords.top - containerRect.top;
  const relativeBottom = cursorCoords.bottom - containerRect.top;

  // 3. Check trigger zones and calculate scroll target
  const scrollTarget = calculateScrollTarget(relativeTop, relativeBottom);

  // 4. Perform smooth scroll if needed
  if (scrollTarget !== null) {
    smoothScrollTo(scrollTarget);
  }
}
```

### **How Container Auto-Scroll Works**

1. Monitor CodeMirror cursor position changes via selection change listeners
2. Calculate cursor's viewport position relative to scroll container
3. Check if cursor is within top/bottom margin trigger zones
4. Smoothly scroll container to maintain cursor in comfortable zone
5. Debounce rapid cursor movements for performance

### **Edge Cases Handled**

- **Document shorter than viewport**: No unnecessary scrolling when content fits
- **Cursor at document boundaries**: Respects scroll container limits
- **Multiple rapid movements**: Debounced cursor tracking for smooth experience
- **Focus changes**: Only auto-scrolls when editor has focus
- **Container resizing**: Recalculates trigger zones on viewport changes
- **Multiple editors**: Each editor manages its own scroll container independently

## Performance Considerations

### **Container Auto-Scroll Performance**

- ✅ **Efficient cursor tracking**: Uses CodeMirror's built-in selection change events
- ✅ **Debounced calculations**: Prevents excessive scroll calculations during rapid typing
- ✅ **Minimal DOM queries**: Caches container references and reuses viewport calculations
- ✅ **GPU accelerated**: Uses native browser `scrollTo()` with smooth behavior
- ✅ **Early termination**: Skips calculations when cursor is in safe zones

### **Memory Usage**

- ✅ **Lightweight service**: Single instance per editor with minimal state
- ✅ **No DOM observers**: Uses event-driven cursor tracking
- ✅ **Automatic cleanup**: Service destroys listeners when editor unmounts
- ✅ **Shared configuration**: Reuses config objects across editor instances

## Alternative Approaches Considered

### **1. CodeMirror ScrollMargins (Original Plan)**

**Approach**: Use CodeMirror's built-in `EditorView.scrollMargins`
**Rejected because**:
- Requires restructuring layout to make CodeMirror the scroll container
- Would break unified scroll behavior for headers/metadata
- Loss of existing container scroll styling
- Major architectural changes needed

### **2. Intersection Observer**

**Approach**: Use browser API to detect cursor near viewport edges
**Rejected because**:
- Requires creating DOM elements to track cursor position
- Complex setup for text cursor vs physical DOM elements
- Performance overhead of continuous intersection monitoring
- CodeMirror already provides better cursor position APIs

### **3. CSS Scroll Padding**

**Approach**: Use CSS `scroll-padding` properties on containers
**Rejected because**:
- CSS scroll-padding doesn't trigger automatic scrolling
- Limited browser support for programmatic scroll triggers
- No integration with cursor position tracking
- Doesn't provide the dynamic behavior needed

## Migration Path

### **Phase 1: Basic Container Auto-Scroll**
- Implement ScrollAutoService with basic cursor tracking
- Enable by default with conservative margin settings
- Test with existing note editing workflows
- Ensure compatibility with current scroll styling

### **Phase 2: Refinement**
- Gather user feedback on scroll behavior and timing
- Adjust margin sizes and debounce timing based on usage patterns
- Add variant-specific configurations (daily-note vs default)
- Performance optimization for long documents

### **Phase 3: Enhancement**
- Add smooth scrolling animation options
- Implement visual feedback for scroll trigger zones
- Add user preference controls for auto-scroll behavior
- Consider advanced features like predictive scrolling

## Success Metrics

### **User Experience Improvements**

- ✅ **Reduced manual scrolling**: Users scroll less frequently while typing
- ✅ **Improved writing flow**: Cursor stays visible during long writing sessions
- ✅ **Better navigation**: Arrow key navigation doesn't lose cursor
- ✅ **Consistent behavior**: Works identically across all note types

### **Technical Metrics**

- ✅ **No performance regression**: Maintain current editor performance
- ✅ **Cross-platform compatibility**: Works on all supported platforms
- ✅ **No breaking changes**: Existing functionality unchanged
- ✅ **Easy configuration**: Simple enable/disable and tuning

## Conclusion

The recommended container-based auto-scroll approach provides an elegant, performant solution that works seamlessly with the existing editor architecture. This approach:

1. **Preserves existing architecture**: Works with current container scrolling without layout changes
2. **Maintains unified behavior**: Headers, metadata, and editor content scroll together as expected
3. **Leverages proven APIs**: Uses CodeMirror's cursor tracking and browser's smooth scrolling
4. **Requires minimal changes**: Only adds new ScrollAutoService and minor integration code
5. **Ensures compatibility**: No breaking changes to existing scroll styling or functionality
6. **Enables future enhancement**: Foundation for advanced scroll behaviors and user preferences

The implementation can be completed incrementally, starting with basic container auto-scroll and optionally adding enhanced features based on user feedback and requirements. This solution respects the existing user experience while adding the desired auto-scroll functionality.