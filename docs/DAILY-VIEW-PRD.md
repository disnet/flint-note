# Daily View Feature - Product Requirements Document

## Executive Summary

The Daily View feature introduces a new system view that provides users with a time-based perspective on their notes, combining automated note aggregation with dedicated daily journaling capabilities. This feature integrates seamlessly with Flint's agent-first philosophy by providing contextual temporal organization while maintaining the clean, professional interface established in the current design.

## Problem Statement

Current Flint users lack an efficient way to:
- Track notes based on when they were created or modified
- Maintain daily journaling habits within their note-taking workflow
- See temporal patterns in their note-taking activity
- Access a dedicated space for daily reflection and planning

The existing system views (Inbox, All notes, Search, Settings) provide excellent organizational capabilities but don't address time-based note management, which is crucial for productivity workflows and personal knowledge management.

## Goals and Objectives

### Primary Goals
- **Temporal Note Organization**: Provide users with automatic grouping of notes by creation and modification dates
- **Daily Journaling Integration**: Enable seamless daily note creation and editing within the existing workflow
- **Activity Awareness**: Help users understand their note-taking patterns and maintain consistent engagement
- **Contextual AI Integration**: Allow the AI assistant to understand temporal context for better assistance

### Secondary Goals
- **Workflow Continuity**: Maintain consistency with existing UI patterns and behaviors
- **Performance Optimization**: Ensure efficient loading and navigation of date-based note queries
- **Mobile Responsiveness**: Provide full functionality across all device sizes

## User Stories

### Core User Stories

**As a daily user, I want to:**
- See all notes I created or modified on any given day so I can review my recent work
- Quickly access and edit my daily journal entry for any date
- Navigate between weeks to see historical note activity
- Have daily notes created automatically when I need them

**As a knowledge worker, I want to:**
- Track my productivity patterns by seeing note creation/modification trends
- Find notes by remembering roughly when I worked on them
- Use daily notes for planning and reflection without leaving my note-taking app

**As a mobile user, I want to:**
- Access the daily view with the same functionality on my phone or tablet
- Navigate dates efficiently with touch-friendly controls

### Advanced User Stories

**As a power user, I want to:**
- See daily notes integrate with the AI assistant for context-aware conversations
- Have daily notes follow the same metadata and organizational patterns as other notes
- Use wikilinks within daily notes to connect to other notes in my vault

## Functional Requirements

### Core Functionality

**F1: System View Integration**
- Add "Daily" as a new system view in the left sidebar
- Use calendar icon for visual distinction
- Maintain consistency with existing system view patterns

**F2: Vertical Timeline Display**
- Show 7 consecutive days in a vertical scrollable timeline
- Display week navigation header with clear week range
- Show current week by default with today's date at top
- Reverse chronological order (newest dates first)

**F3: Daily Note Management**
- Automatically create daily notes with standardized naming (YYYY-MM-DD format)
- Embed full CodeMirror editor directly in each day section
- Support immediate editing without separate views or modals
- Apply "daily" note type with appropriate metadata
- Auto-save on content changes

**F4: Note Aggregation**
- Display notes created or modified on each day below the editor
- Show notes as clickable wikilink-style brackets [Note Title]
- Exclude daily notes from their own day's aggregation
- Combine created and modified notes into single "Notes worked on" list
- Show all relevant notes without artificial limits

**F5: Navigation Controls**
- Previous/Next week navigation buttons
- "Today" button to jump to current week
- Optional: Mini calendar widget for date selection
- Keyboard shortcuts for navigation (arrow keys, j/k)

### Enhanced Functionality

**F6: Visual Design**
- Follow existing CSS variable system for theming
- Responsive grid that adapts to screen size
- Subtle visual indicators for note counts
- Consistent typography and spacing with existing design

**F7: Performance Optimization**
- Efficient date-based database queries
- Lazy loading of note content
- Caching of frequently accessed date ranges
- Debounced navigation to prevent excessive API calls

**F8: Integration Features**
- Daily notes appear in search results
- Wikilinks work within and to daily notes
- AI assistant recognizes daily note context
- Metadata editor supports daily notes
- Temporary tabs integration for note opening

## Technical Requirements

### Data Model

**Daily Note Type**
```typescript
interface DailyNote extends NoteMetadata {
  type: 'daily';
  title: string; // Format: "YYYY-MM-DD"
  date: string; // ISO date string
  autoCreated: boolean; // Track if auto-generated
}
```

**Date Aggregation**
```typescript
interface DayData {
  date: string; // ISO date string
  dailyNote: DailyNote | null;
  createdNotes: NoteMetadata[];
  modifiedNotes: NoteMetadata[];
  totalActivity: number;
}

interface WeekData {
  startDate: string;
  endDate: string;
  days: DayData[];
}
```

### Database Requirements
- Add indexes on `created_at` and `updated_at` fields for efficient date queries
- Implement date aggregation queries with timezone handling
- Support efficient pagination for historical data

### API Extensions
- `GET /api/notes/daily/{date}` - Get or create daily note for date
- `GET /api/notes/week/{startDate}` - Get aggregated week data
- `POST /api/notes/daily` - Create daily note with proper metadata
- `GET /api/notes/by-date/{date}` - Get notes created/modified on date

### State Management

**New Store: `dailyViewStore.svelte.ts`**

Following Flint's existing store architecture with IPC-based data loading:

```typescript
interface DailyViewState {
  currentWeek: WeekData | null;
  selectedDate: string | null;
  isLoading: boolean;
  navigationHistory: string[];
}

// Daily View Store Implementation
class DailyViewStore {
  private currentWeek = $state<WeekData | null>(null);
  private selectedDate = $state<string | null>(null);
  private isLoading = $state(false);
  private currentVaultId = $state<string | null>(null);

  get loading(): boolean {
    return this.isLoading;
  }

  get weekData(): WeekData | null {
    return this.currentWeek;
  }

  // Load week data via IPC
  async loadWeek(startDate: string, vaultId?: string): Promise<void> {
    this.isLoading = true;
    try {
      const weekData = await window.api?.getWeekData(startDate, vaultId);
      this.currentWeek = weekData;
      this.currentVaultId = vaultId || null;
    } catch (error) {
      console.error('Failed to load week data:', error);
      this.currentWeek = null;
    } finally {
      this.isLoading = false;
    }
  }

  // Get or create daily note via IPC
  async getOrCreateDailyNote(date: string): Promise<Note | null> {
    try {
      return await window.api?.getOrCreateDailyNote(date, this.currentVaultId);
    } catch (error) {
      console.error('Failed to get/create daily note:', error);
      return null;
    }
  }

  // Update daily note content via existing note update IPC
  async updateDailyNote(date: string, content: string): Promise<void> {
    try {
      await window.api?.updateNote(date, content, this.currentVaultId);
      // Refresh current week data to reflect changes
      if (this.currentWeek) {
        await this.loadWeek(this.currentWeek.startDate, this.currentVaultId);
      }
    } catch (error) {
      console.error('Failed to update daily note:', error);
    }
  }
}

export const dailyViewStore = new DailyViewStore();
```

### Component Architecture

**New Components:**
- `DailyView.svelte` - Main daily view container with vertical timeline
- `WeekNavigation.svelte` - Week range header with prev/next controls
- `DaySection.svelte` - Individual day with embedded editor and note list
- `DailyNoteEditor.svelte` - Inline CodeMirror editor for daily notes
- `NotesWorkedOn.svelte` - List of notes created/modified on date

## User Interface Specifications

### Desktop Layout (>1400px)
```
┌─────────────────────────────────────────────────────────────────┐
│ Left Sidebar │           Main View (Daily)           │ Right     │
│              │                                       │ Sidebar   │
│ • Daily ←    │ <prev> Week of Sep 15 <next>         │           │
│ • Inbox      │                                       │           │
│ • All notes  │ # Tue Sep 16                          │           │
│ • Search     │ ┌─────────────────────────────────────┐ │           │
│ • Settings   │ │ CodeMirror Editor                   │ │           │
│              │ │ (Daily note content)                │ │           │
│              │ └─────────────────────────────────────┘ │           │
│              │ ---                                   │           │
│              │ Notes worked on this date:            │           │
│              │ [Flint] [The Unaccountability Machine] │           │
│              │                                       │           │
│              │ # Mon Sep 15                          │           │
│              │ ┌─────────────────────────────────────┐ │           │
│              │ │ CodeMirror Editor                   │ │           │
│              │ │ (Daily note content)                │ │           │
│              │ └─────────────────────────────────────┘ │           │
│              │ ---                                   │           │
│              │ Notes worked on this date:            │           │
│              │ [Flint]                               │           │
│              │                                       │           │
│              │ ... (scrollable timeline)             │           │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout (<768px)
```
┌─────────────────────────┐
│ <prev> Week of Sep 15 <next> │
├─────────────────────────┤
│ # Tue Sep 16            │
│ ┌─────────────────────┐ │
│ │ CodeMirror Editor   │ │
│ │ (Daily note)        │ │
│ └─────────────────────┘ │
│ ---                     │
│ Notes worked on:        │
│ [Flint] [Machine]       │
├─────────────────────────┤
│ # Mon Sep 15            │
│ ┌─────────────────────┐ │
│ │ CodeMirror Editor   │ │
│ │ (Daily note)        │ │
│ └─────────────────────┘ │
│ ---                     │
│ Notes worked on:        │
│ [Flint]                 │
├─────────────────────────┤
│ ... (scrollable)        │
└─────────────────────────┘
```

### Visual Design Specifications

**Colors (using existing CSS variables):**
- Today's date header: `--accent-primary` color highlight
- CodeMirror editors: Standard editor styling with `--bg-secondary`
- Note links: `--accent-primary` with bracket styling [Note Title]
- Navigation: `--text-secondary` with hover states
- Section dividers: `--border-light` for horizontal rules

**Typography:**
- Date headers: Large bold heading style (# heading)
- Week navigation: Medium weight, centered
- "Notes worked on" labels: Regular weight, `--text-secondary`
- Note links: Regular weight, `--accent-primary` in brackets

**Spacing:**
- Grid gap: 12px between day cells
- Cell padding: 16px internal padding
- Navigation height: 48px
- Responsive breakpoints: Follow existing system

## Development Strategy

### Parallel Development Opportunities

These components can be developed simultaneously by different developers:

**Team A: Backend Foundation**
- Phase 0A: Database Schema
- Phase 1A: Backend APIs
- Phase 1B: Note Aggregation

**Team B: UI Foundation** 
- Phase 0B: Date Utilities
- Phase 0C: UI Shell
- Phase 2A: CodeMirror Integration

**Team C: Integration**
- Phase 2B: Real Data Integration (after Teams A & B complete Phase 1)
- Phase 2C: Note List Display

### Testing Strategy

**Unit Testing** (Can be done with each phase)
- Database schema changes
- Date utility functions
- API endpoints
- UI components with mock data
- Note aggregation logic

**Integration Testing** (After Phase 2B)
- End-to-end daily view workflow
- Cross-browser compatibility
- Mobile responsiveness
- Performance under load

### Rollout Strategy

**Alpha Release** (After Phase 2B)
- Basic daily view functionality
- Manual testing with small user group
- Core workflow validation

**Beta Release** (After Phase 3)
- Enhanced features and optimizations
- Broader user testing
- Performance validation

**Full Release** (After Phase 4)
- Complete system integration
- All features polished and tested
- Documentation and user onboarding

## Implementation Considerations

## Implementation Phases

### Phase 0: Foundation (Completely Independent)

**0A: Database Schema** *(Can be done first, tested independently)*
- Add `daily` note type to database
- Add indexes on `created_at` and `updated_at` fields
- Database migration scripts
- Unit tests for schema changes

**0B: Date Utilities** *(Pure functions, fully testable)*
- Week calculation functions (`getWeekDates`, `formatWeekRange`)
- Date formatting utilities
- Timezone handling logic
- Unit tests for all date operations

**0C: UI Shell** *(Can use mock data initially)*
- Basic `DailyView.svelte` container component
- `WeekNavigation.svelte` component with prev/next buttons
- CSS layout structure and responsive grid
- Navigation state management (`dailyViewStore.svelte.ts`)
- Works with hardcoded mock week data

### Phase 1: Core Functionality (Sequential Dependencies)

**1A: Backend APIs** *(Requires 0A)*
- `GET /api/notes/daily/{date}` - Get or create daily note
- `POST /api/notes/daily` - Create daily note with metadata
- `GET /api/notes/by-date/{date}` - Get notes by creation/modification date
- Unit tests for all endpoints
- Integration tests with test database

**1B: Note Aggregation** *(Requires 0A, can develop in parallel with 1A)*
- Database queries for date-based note filtering
- Exclude daily notes from their own day's aggregation
- Combine created/modified notes logic
- Performance optimization for date range queries
- Unit tests for aggregation logic

**1C: Daily Note Management** *(Requires 1A)*
- Auto-creation of daily notes with YYYY-MM-DD naming
- Integration with existing note creation pipeline
- Proper metadata assignment (`type: 'daily'`)
- Error handling for duplicate creation

### Phase 2: UI Integration (Requires Phase 1)

**2A: CodeMirror Integration** *(Can be developed as standalone component)*
- `DailyNoteEditor.svelte` with embedded CodeMirror
- Auto-save functionality with debouncing
- Integration with existing note update APIs
- Proper cleanup and memory management
- Can be tested independently with mock note data

**2B: Real Data Integration** *(Requires 1A, 1B, 1C)*
- Connect UI shell to real APIs
- Replace mock data with live note aggregation
- Week navigation with real date ranges
- Loading states and error handling
- Basic daily view is now functional

**2C: Note List Display** *(Requires 1B)*
- `NotesWorkedOn.svelte` component
- Wikilink-style `[Note Title]` formatting
- Click-to-open integration with temporary tabs
- "Show more" functionality for long lists

### Phase 3: Enhanced Features (Independent Improvements)

**3A: Navigation Enhancements** *(Independent)*
- Keyboard shortcuts (arrow keys, j/k for navigation)
- "Today" quick jump button
- URL-based navigation and deep linking
- Navigation history and browser back/forward

**3B: Performance Optimizations** *(Independent)*
- Caching strategy for frequently accessed weeks
- Lazy loading of note content
- Virtual scrolling for long timelines
- Database query optimization

**3C: Mobile Responsiveness** *(Independent)*
- Touch-friendly navigation controls
- Optimized editor sizing for mobile
- Smooth scrolling and gesture support
- Mobile-specific UI adjustments

### Phase 4: System Integration (Requires Core Functionality)

**4A: Wikilink Integration** *(Requires 2A, 2C)*
- Wikilink parsing and rendering in daily notes
- Click-to-navigate functionality
- Backlink tracking for daily notes
- Integration with existing wikilink system

**4B: AI Assistant Integration** *(Requires 2A)*
- Daily note context in AI conversations
- Temporal awareness in AI responses
- Task management integration with daily notes
- AI-suggested daily note prompts

**4C: Search Integration** *(Requires 2A)*
- Daily notes appear in global search results
- Date-based search filters
- Search highlighting in daily note editors
- Integration with existing search infrastructure

**4D: Metadata Integration** *(Requires 2A)*
- Daily notes support in metadata editor
- YAML frontmatter for daily notes
- Tag and category support
- Integration with existing metadata system

### Risk Mitigation

**Phase 0 Risks:**
- Database migration failures → Thorough testing with database backups
- Date utility edge cases → Comprehensive unit test coverage
- UI shell complexity → Start with minimal viable layout

**Phase 1 Risks:**
- API performance issues → Load testing with realistic data volumes
- Note aggregation complexity → Start with simple queries, optimize later
- Auto-creation conflicts → Proper locking and error handling

**Phase 2 Risks:**
- CodeMirror integration bugs → Develop as isolated component first
- Real data integration issues → Gradual rollout with feature flags
- Memory leaks → Careful cleanup and testing

**Phase 3+ Risks:**
- Feature creep → Stick to defined scope per phase
- Integration conflicts → Thorough regression testing
- Performance degradation → Continuous monitoring

### Technical Challenges

**Date Handling:**
- Timezone consistency across client/server
- Efficient date-based database queries
- Proper handling of daylight saving time transitions

**Performance:**
- Avoid n+1 queries when loading week data
- Implement proper caching strategy
- Optimize for large note collections

**User Experience:**
- Smooth scrolling timeline with embedded editors
- Immediate editing without mode switching
- Clear visual separation between dates and content
- Intuitive wikilink-style note references

### Minimum Viable Product (MVP)

After **Phase 2B**, we have a complete, usable daily view:
- Week navigation working
- Daily note creation and editing
- Note aggregation display
- Basic responsive design

This MVP can be released to gather user feedback before investing in advanced features.

### Database Migrations
```sql
-- Phase 0A: Add daily note type if not exists
INSERT OR IGNORE INTO note_types (id, name, icon) 
VALUES ('daily', 'Daily', 'calendar');

-- Phase 0A: Add indexes for date-based queries
CREATE INDEX IF NOT EXISTS idx_notes_created_at 
ON notes(created_at);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at 
ON notes(updated_at);

CREATE INDEX IF NOT EXISTS idx_notes_type_date 
ON notes(type, created_at);
```

## Success Metrics

### User Engagement
- **Daily Active Usage**: % of users who access daily view within first week
- **Retention**: % of users who continue using daily view after 30 days
- **Daily Note Creation**: Average daily notes created per active user
- **Navigation Patterns**: Most common navigation behaviors (week forward/back)

### Performance Metrics
- **Load Time**: Daily view initial load under 500ms
- **Query Performance**: Date aggregation queries under 100ms
- **Memory Usage**: No significant memory leaks during extended use

### Feature Adoption
- **Feature Discovery**: % of users who try daily view within first session
- **Cross-Feature Usage**: Integration with search, AI assistant, metadata editing
- **Mobile Usage**: Daily view usage on mobile vs desktop

## Future Considerations

### Potential Enhancements
1. **Month View**: Expand to show monthly calendar grid
2. **Note Templates**: Daily note templates with customizable structure
3. **Habit Tracking**: Visual indicators for daily note consistency
4. **Advanced Filtering**: Filter daily notes by tags, content, etc.
5. **Export Options**: Export daily notes as journal entries
6. **Collaborative Features**: Shared daily notes for team workflows

### Integration Opportunities
1. **AI-Generated Summaries**: Automatic daily summaries of note activity
2. **Task Integration**: Show tasks due/completed by date
3. **Calendar Sync**: Integration with external calendar systems
4. **Analytics Dashboard**: Detailed productivity insights over time

### Scalability Considerations
- Archival strategy for old daily notes
- Performance with years of historical data
- Backup and sync implications for daily notes
- Multi-vault daily note organization

## Conclusion

The Daily View feature represents a natural evolution of Flint's note organization capabilities, providing temporal context while maintaining the clean, agent-first design philosophy. The vertical timeline approach with embedded editors creates an immediate, friction-free writing experience while automatically organizing related note activity.

By integrating seamlessly with existing workflows and providing both automated organization and dedicated daily journaling capabilities, this feature addresses a key gap in personal knowledge management tools. The implementation approach ensures backward compatibility, performance optimization, and cross-platform functionality while opening opportunities for future enhancements in productivity tracking and AI-assisted temporal workflows.