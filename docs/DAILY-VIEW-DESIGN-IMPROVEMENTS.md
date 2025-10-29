# Daily View Design Improvements

## Current Design Analysis

### Structure
- **WeekNavigation**: Fixed header with week range and prev/next buttons
- **DaySection (x7)**: One card per day containing:
  - Day header (date + "Today" badge)
  - Daily note editor (CodeMirror)
  - Notes worked on section

### Identified Problems

1. **Too much scrolling when entries are filled out**
   - Each day is a full card with padding, borders, and headers
   - Daily note editors expand with content
   - 7 days × (header + editor + notes) = significant vertical space
   - No way to collapse or minimize content

2. **Too much chrome (UI elements)**
   - Full header for each day with background, padding, borders
   - "Notes worked on this day" section headers
   - 1.5rem gaps between days
   - Multiple layers of borders and containers

3. **Cannot quickly jump between weeks**
   - Only prev/next navigation buttons
   - No calendar picker or week selector
   - No keyboard shortcuts
   - No "jump to date" functionality

---

## Design Solutions

### 1. Addressing Scrolling Issues

#### Option A: Collapsible Day Sections ⭐ RECOMMENDED
**Concept**: Add expand/collapse controls to each day

**Features**:
- Collapse icon in day header (chevron or +/-)
- Auto-collapse past days by default
- Keep today + next day expanded
- Show summary when collapsed (e.g., "Has entry • 3 notes")
- Persist collapse state per session
- Click anywhere on collapsed header to expand

**Benefits**:
- Dramatically reduces scrolling for filled-out weeks
- User control over what they see
- Reduces visual clutter (solves problem #2 too)

**Implementation**:
```typescript
// Add to DaySection.svelte
let isExpanded = $state(isToday || isTomorrow);

function toggleExpanded() {
  isExpanded = !isExpanded;
}
```

---

#### Option B: Compact Mode Toggle
**Concept**: Global view mode switcher (compact vs. expanded)

**Features**:
- Toggle button in WeekNavigation header
- Compact mode:
  - Smaller editors (3-4 lines max)
  - Reduced padding (0.5rem instead of 1.5rem)
  - Inline day labels
  - No "notes worked on" section (show count badge only)
- Expanded mode: current design

**Benefits**:
- Quick overview vs. detailed view
- User chooses their preference
- Single toggle affects all days

---

#### Option C: Smart Editor Auto-Height
**Concept**: Editors automatically adjust height based on focus/content

**Features**:
- **Unfocused**: 3-4 line preview max
- **Focused**: Expand to full content (or larger max like 15 lines)
- **Empty**: Show placeholder at minimum height (2 lines)
- Fade gradient when content is truncated
- Smooth height transitions

**Benefits**:
- Reduces initial page height significantly
- Natural interaction pattern
- Keeps full editing capability
- Works well with current design

**Implementation**:
```typescript
// CodeMirrorEditor enhancement
let editorHeight = $derived(
  isFocused ? 'auto' : '80px'
);
```

---

#### Option D: Single Day Focus Mode
**Concept**: Show only one day at a time in detail

**Features**:
- Vertical mini-calendar sidebar (7 day boxes)
- Click day to focus it in main area
- Show multiple days side-by-side on wide screens (>=1200px)
- Swipe gestures on mobile to switch days

**Benefits**:
- Eliminates scrolling entirely
- Clean, focused interface
- Works great on mobile

**Drawbacks**:
- Loses weekly overview
- More clicks to see other days
- Bigger paradigm shift from current design

---

### 2. Reducing Chrome (UI Elements)

#### Option A: Minimal Headers ⭐ RECOMMENDED
**Concept**: Simplify day headers dramatically

**Changes**:
- Remove background color (or very subtle)
- Reduce padding: `0.75rem 1rem` → `0.5rem 0.75rem`
- Use just day name: "Monday" instead of "Monday, Jan 27"
- Smaller font size: `1.25rem` → `1rem`
- Thin or no border
- Move "Today" badge inline with day name

**Before**: ~52px header height
**After**: ~32px header height

---

#### Option B: Borderless Design
**Concept**: Remove card borders, use subtle dividers

**Changes**:
- Remove `border: 1px solid` from day sections
- Replace with thin bottom divider (1px)
- Remove border-radius
- Increase whitespace between sections
- Let content breathe without boxes

**Benefits**:
- Cleaner, more modern look
- Reduces visual noise
- Focuses attention on content

---

#### Option C: Floating Day Labels in Margin
**Concept**: Remove header entirely, show day as margin label

**Features**:
- Day name appears in left margin/gutter
- Sticky positioning as you scroll
- Editor fills full width of container
- No header background or border

**Benefits**:
- Maximum space for content
- Unique, clean aesthetic
- Works well with minimal design

**Challenges**:
- Harder to make days clickable
- May not work well on mobile
- Need wider container

---

#### Option D: Integrated Notes Section
**Concept**: Merge daily note and notes-worked-on sections

**Changes**:
- Remove "Notes worked on this day" header
- Show notes as compact footer inside same container
- Use simple text: "Also: [[Note 1]] • [[Note 2]]"
- Or show as inline chips after editor
- No separate border-top

**Benefits**:
- One less section header per day
- More cohesive feel
- Reduces vertical space

---

### 3. Quick Week Navigation

#### Option A: Mini Calendar Picker ⭐ RECOMMENDED
**Concept**: Calendar overlay for date selection

**Features**:
- Calendar icon in WeekNavigation header
- Click to open calendar overlay
- Highlight current week
- Click any day to jump to its week
- Keyboard shortcut: `Cmd/Ctrl + G` to open
- Month/year navigation within calendar

**Benefits**:
- Standard UI pattern users understand
- Precise navigation to any week
- Visual representation of time

**Implementation**:
- Use lightweight calendar component
- Could use native `<input type="date">` as base

---

#### Option B: Keyboard Shortcuts
**Concept**: Fast navigation without mouse

**Shortcuts**:
- `[` / `]` or `H` / `L` - Previous/next week
- `T` - Jump to today
- `1-7` - Jump to specific day of week
- `Cmd/Ctrl + G` - Open date picker
- `Cmd/Ctrl + Click` on day - Pin/collapse

**Benefits**:
- Power user efficiency
- No UI changes needed
- Works well with other features

**Implementation**:
```typescript
// Global keyboard handler
function handleKeyPress(e: KeyboardEvent) {
  if (e.key === '[' && !e.target.matches('input, textarea')) {
    dailyViewStore.navigateToPreviousWeek();
  }
  // ... more shortcuts
}
```

---

#### Option C: Week Dropdown Selector
**Concept**: Click week range to open quick-pick dropdown

**Features**:
- Click "Jan 20 - 26" to open dropdown
- Show: Recent weeks, This week, Next week, Custom date
- Scrollable list of weeks
- Search/filter by date range

**Benefits**:
- Compact solution
- No overlay required
- Quick access to recent weeks

---

#### Option D: Relative Date Input
**Concept**: Text input with natural language parsing

**Features**:
- Input field in header or as command palette
- Type: "last week", "2 weeks ago", "Jan 15", "yesterday"
- Autocomplete suggestions
- Jump on Enter

**Benefits**:
- Most flexible option
- Keyboard-friendly
- Natural interaction

**Challenges**:
- Requires date parsing library
- May be confusing for some users

---

## Recommended Combined Solution

I recommend implementing these together for maximum impact:

### Phase 1: Quick Wins (Minimal Code Changes)

1. **Minimal Headers** (Problem #2)
   - Reduce header padding and font sizes
   - Simplify day date format
   - Remove or reduce borders
   - **Impact**: Immediate visual improvement, ~20px saved per day = 140px per week

2. **Smart Editor Auto-Height** (Problem #1)
   - Limit unfocused editor height to 3-4 lines
   - Expand on focus
   - **Impact**: Major scrolling reduction, ~70% less vertical space for days with entries

3. **Keyboard Shortcuts** (Problem #3)
   - Add `[` / `]` for week navigation
   - Add `T` for today
   - **Impact**: Power users can navigate instantly

**Estimated effort**: 1-2 days
**Estimated impact**: 60-70% improvement in scrolling and chrome issues

---

### Phase 2: Enhanced Features (Moderate Changes)

4. **Collapsible Days** (Problem #1 + #2)
   - Add expand/collapse to day headers
   - Auto-collapse past days
   - Show summary when collapsed
   - **Impact**: User control, can reduce visible content by 80%+

5. **Calendar Picker** (Problem #3)
   - Add calendar icon/button
   - Implement calendar overlay
   - Week highlighting and selection
   - **Impact**: Can jump to any week in seconds

**Estimated effort**: 2-3 days
**Estimated impact**: 90% improvement across all issues

---

### Phase 3: Polish (Optional)

6. **Integrated Notes Section** (Problem #2)
   - Merge notes-worked-on into footer
   - Inline display
   - **Impact**: Cleaner, more cohesive design

7. **Compact Mode Toggle** (Problem #1 + #2)
   - Global view density control
   - **Impact**: User preference accommodation

**Estimated effort**: 1-2 days
**Estimated impact**: Final polish, edge case coverage

---

## Visual Mockup (Text-Based)

### Current Design (Expanded Day):
```
┌─────────────────────────────────────┐
│  Monday, January 27         [Today] │ ← 52px header
├─────────────────────────────────────┤
│                                     │
│  [Daily note editor - expands       │ ← Variable height
│   with content, can be 200-400px]   │
│                                     │
├─────────────────────────────────────┤
│  NOTES WORKED ON THIS DAY       [3] │ ← 40px header
│  • Note Title One                   │
│  • Note Title Two                   │
│  • Note Title Three                 │ ← 80px list
└─────────────────────────────────────┘
↓ 24px gap
```
**Total**: ~410px per day with content

---

### Proposed Design (Phase 1):
```
┌─────────────────────────────────────┐
│  Monday                      [Today] │ ← 32px minimal header
│                                     │
│  [Daily note - 3 line preview]      │ ← 80px when unfocused
│   with fade gradient...             │
│                                     │
│  Also: Note One • Note Two • Thr... │ ← 24px footer
└─────────────────────────────────────┘
↓ 16px gap
```
**Total**: ~150px per day (63% reduction!)

---

### Proposed Design (Phase 2 - Collapsed):
```
┌─────────────────────────────────────┐
│  ▶ Monday          Has entry • 3 no │ ← 32px collapsed
└─────────────────────────────────────┘
```
**Total**: ~32px per collapsed day (92% reduction!)

---

## Alternative: Radical Redesign Options

If you want to think bigger, here are more dramatic departures:

### Option 1: Kanban-Style Week View
- Horizontal columns for each day
- Scroll horizontally through week
- Vertical cards within each day
- Works great on wide screens

### Option 2: Timeline View
- Vertical timeline with time markers
- Days are just labels on the timeline
- Entries appear at creation time
- More journal-like feel

### Option 3: Grid/Calendar Hybrid
- Traditional calendar grid
- Click cell to expand editor inline
- Overview of week at a glance
- Similar to Google Calendar week view

---

## Next Steps

1. **Gather feedback** on which solutions resonate
2. **Create visual mockups** in Figma or similar
3. **Test with users** if possible (or dogfood it)
4. **Implement in phases** starting with quick wins
5. **Iterate** based on usage and feedback

---

## Questions to Consider

1. Do users need to see all 7 days at once? Or is single-day focus acceptable?
2. How important is it to see notes-worked-on inline vs. as separate view?
3. What's more valuable: vertical space efficiency or information density?
4. Should compact mode be per-user preference or per-session state?
5. What keyboard shortcuts would be most intuitive for users?

---

## Technical Considerations

- Collapsible state: Store in local component state or persist to localStorage?
- Editor height transitions: Use CSS transitions or animation library?
- Calendar picker: Build custom or use library (e.g., flatpickr, date-fns)?
- Keyboard shortcuts: Global handler or per-component?
- Responsive behavior: How do these changes affect mobile view?

---

## Related Files

- `src/renderer/src/components/DailyView.svelte` - Main container
- `src/renderer/src/components/WeekNavigation.svelte` - Header navigation
- `src/renderer/src/components/DaySection.svelte` - Individual day card
- `src/renderer/src/components/DailyNoteEditor.svelte` - Editor wrapper
- `src/renderer/src/components/NotesWorkedOn.svelte` - Notes list
- `src/renderer/src/stores/dailyViewStore.svelte` - State management
