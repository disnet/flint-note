# Mobile UI Design Brainstorm

## Current State Analysis

**Desktop Layout:**
- Three-panel design: Left sidebar (navigation/pinned notes) | Main content (editor/views) | Right sidebar (AI assistant)
- Rich navigation: System views, pinned notes, temporary tabs, search
- AI Assistant with full chat interface, tool execution, conversation threads
- Note editor with markdown, backlinks, metadata

**Mobile Constraints:**
- Limited screen real estate (typically 360-430px wide)
- Touch-first interaction (minimum 44px tap targets)
- Vertical scrolling natural, horizontal less so
- Context switching should be fast and intuitive
- Keyboard takes up ~50% of screen when active

**Core Mobile Priorities:**
1. **Fast note access** - View and edit notes quickly
2. **AI Agent** - Chat interface for assistance
3. **Pinned notes** - Quick navigation to favorites
4. **Search/Navigation** - Find notes easily
5. **System views** - Secondary priority (Inbox, Daily, etc.)

---

## Design Approach 1: Arc Search-Style Bottom Sheet

### Concept
Main view shows the active note full-screen. Swipe up from bottom or tap a floating button to reveal a bottom sheet with tabs for Pinned Notes and Agent.

### Layout
```
┌─────────────────────────────┐
│     [≡] Title Bar [🔍] [⋮]  │  ← Minimal top bar
├─────────────────────────────┤
│                             │
│                             │
│    Note Content             │
│    (Full Screen)            │
│                             │
│    # Note Title             │
│    Note markdown content... │
│                             │
│                             │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│     ⌃  [Pinned] [Agent]     │  ← Bottom sheet (collapsed)
└─────────────────────────────┘

When expanded:
┌─────────────────────────────┐
│     [≡] Title Bar [🔍] [⋮]  │
├─────────────────────────────┤
│                             │
│    Note Content             │
│    (Partially visible)      │
│                             │
├─────────────────────────────┤
│   [Pinned Notes] [Agent]    │  ← Tab switcher
├─────────────────────────────┤
│  📌 Meeting Notes           │
│  📌 Project Ideas           │  ← Pinned notes list
│  📌 Weekly Review           │     or Agent chat
│  📌 Reading List            │
│  📌 Daily Journal           │
│  📌 Code Snippets           │
└─────────────────────────────┘
```

### Pros
- Note-first: Content takes center stage
- Bottom sheet is discoverable (swipe up gesture is common on mobile)
- Quick switching between pinned notes and agent
- Familiar pattern (similar to Apple Maps, Google Maps, Arc Search)
- Can have multiple sheet heights: collapsed, half, full

### Cons
- Bottom sheet obscures note content when open
- Agent chat needs more vertical space (keyboard + messages)
- May feel cramped when typing in agent with keyboard up
- Sheet management (collapsed/half/full) can be complex

### Variations
- **A1.1:** Bottom sheet always visible (collapsed bar with pill button)
- **A1.2:** Bottom sheet auto-hides, triggered by floating action button
- **A1.3:** Three tabs in sheet: Pinned, Agent, Recent (temporary tabs)
- **A1.4:** Sheet can expand to full screen for agent conversations

---

## Design Approach 2: Tab Bar Navigation with Swipeable Views

### Concept
Traditional tab bar at bottom with three main sections: Notes, Pinned, Agent. Swipe between them horizontally. Current note state is preserved.

### Layout
```
┌─────────────────────────────┐
│     [≡] Title Bar [🔍] [⋮]  │
├─────────────────────────────┤
│                             │
│                             │
│   CURRENT VIEW:             │
│                             │
│   [Notes Tab]               │
│   - Note Editor (full)      │
│     OR                      │
│   - Note list/tree          │
│                             │
│   [Pinned Tab]              │
│   - List of pinned notes    │
│                             │
│   [Agent Tab]               │
│   - Chat interface          │
│                             │
├─────────────────────────────┤
│  [📝 Notes] [📌 Pinned] [🤖 Agent] │  ← Tab bar
└─────────────────────────────┘
```

### Pros
- Clear mental model (three distinct spaces)
- Standard mobile pattern (iOS/Android familiar)
- Each view can be optimized for its purpose
- Easy to show badges (e.g., unread agent messages, inbox count)
- Swipe gestures for quick tab switching

### Cons
- Note content competes with other tabs (not as note-first)
- Context switching requires full view change
- Can't see pinned notes while reading a note
- Agent chat and note editing can't be visible simultaneously

### Variations
- **A2.1:** Four tabs: Notes, Pinned, Agent, More (system views)
- **A2.2:** Dynamic tab: Current note + Pinned + Agent
- **A2.3:** Long-press tab for additional actions (new note, new conversation)
- **A2.4:** Swipe gestures on note content to switch tabs (left/right)

---

## Design Approach 3: Floating Action Button with Radial Menu

### Concept
Note is full-screen. A floating action button (FAB) opens a radial menu with quick actions: Agent, Pinned Notes, New Note, Search, etc.

### Layout
```
┌─────────────────────────────┐
│     [≡] Title Bar [🔍] [⋮]  │
├─────────────────────────────┤
│                             │
│                             │
│    Note Content             │
│    (Full Screen)            │
│                             │
│    # Note Title             │
│    Note markdown content... │
│                             │
│                             │
│                     🤖      │  ← FAB (bottom right)
│                             │
│                             │
│                             │
└─────────────────────────────┘

When FAB pressed:
┌─────────────────────────────┐
│     [≡] Title Bar [🔍] [⋮]  │
├─────────────────────────────┤
│                             │
│    Note Content (dimmed)    │
│                             │
│          📌  ← Pinned       │
│       🤖  ⊗  ➕             │  ← Radial menu
│          🔍  ← Search       │     (Agent, New, Close)
│                             │
│                             │
│                             │
└─────────────────────────────┘
```

### Pros
- Maximum screen space for note content
- Fast access to key actions via radial gesture
- Visually distinctive and modern
- Can be customized (different actions on long-press)

### Cons
- Radial menus can be tricky to use (precision required)
- Not standard mobile pattern (learning curve)
- Limited number of actions in radial menu (5-6 max)
- Still need separate views for pinned notes and agent

### Variations
- **A3.1:** FAB opens slide-in drawer instead of radial menu
- **A3.2:** Multiple FABs for different contexts (note mode, edit mode)
- **A3.3:** FAB morphs into different controls (edit → agent → pinned)
- **A3.4:** FAB + swipe gestures (swipe up for agent, left for pinned)

---

## Design Approach 4: Swipe-Based Navigation (No Permanent UI)

### Concept
Immersive note-first design with gesture-based navigation. Swipe from edges to reveal sidebars. No permanent navigation UI.

### Layout
```
┌─────────────────────────────┐
│                             │  ← Swipe down for search/menu
│                             │
│    Note Content             │
│    (Edge-to-Edge)           │
│                             │
│    # Note Title             │
│    Note markdown content... │
│                             │
│                             │
│                             │
│                             │
│                             │
│                             │
└─────────────────────────────┘

Gestures:
- Swipe RIGHT → Pinned notes drawer (from left edge)
- Swipe LEFT → Agent drawer (from right edge)
- Swipe DOWN → Command palette / search
- Swipe UP → Quick actions sheet
```

### Pros
- Maximum immersion for reading/writing
- Beautiful, distraction-free interface
- Power-user friendly (fast when learned)
- Can support many actions via gestures

### Cons
- Discoverability is poor (users need to learn gestures)
- Gestures can conflict with text selection, scrolling
- Accessibility concerns (not all users can perform gestures)
- May feel "hidden" or hard to navigate initially

### Variations
- **A4.1:** Add subtle edge indicators (visual hints for swipe zones)
- **A4.2:** First-time tutorial overlay showing gestures
- **A4.3:** Hybrid: Gestures + small persistent indicators (e.g., edge pills)
- **A4.4:** Velocity-based gestures (fast swipe vs slow swipe = different actions)

---

## Design Approach 5: Card-Based Interface (Stack Navigation)

### Concept
Each section (note, pinned list, agent) is a separate card. Cards stack on top of each other. Navigate back with swipe or button.

### Layout
```
Home Screen:
┌─────────────────────────────┐
│     [≡] Flint           [🔍] │
├─────────────────────────────┤
│                             │
│   📌 Pinned Notes           │
│   ┌─────────────────────┐   │
│   │ Meeting Notes       │   │  ← Tap to open
│   └─────────────────────┘   │
│   ┌─────────────────────┐   │
│   │ Project Ideas       │   │
│   └─────────────────────┘   │
│                             │
│   🤖 Start Agent Chat       │  ← Tap to open
│                             │
│   📝 Recent Notes           │
│   ┌─────────────────────┐   │
│   │ Daily Journal       │   │
│   └─────────────────────┘   │
│                             │
├─────────────────────────────┤
│  [📥 Inbox] [📅 Daily] [⚙️]  │  ← Bottom nav for views
└─────────────────────────────┘

Note View (stacked on top):
┌─────────────────────────────┐
│  [← Back]  Title      [⋮]   │
├─────────────────────────────┤
│                             │
│    # Note Title             │
│    Note content...          │
│                             │
│                             │
└─────────────────────────────┘
```

### Pros
- Clear visual hierarchy (cards suggest depth)
- Standard navigation pattern (iOS/Android)
- Each view optimized for its purpose
- Easy to add transitions and animations
- Works well with native navigation controllers

### Cons
- Not as "note-first" (home screen is a hub)
- Requires more taps to get to content
- Back button/gesture needed frequently
- May feel slower for quick note capture

### Variations
- **A5.1:** Pinned notes on home, agent as floating button overlay
- **A5.2:** Most recent note auto-opens on launch
- **A5.3:** Cards can be minimized to bottom bar (multitasking style)
- **A5.4:** Home screen customizable (reorder sections)

---

## Design Approach 6: Hybrid: Bottom Nav + Contextual Overlays

### Concept
Persistent bottom navigation with main sections (Notes, Search, New, Agent). Context-sensitive overlays for pinned notes and actions.

### Layout
```
┌─────────────────────────────┐
│     Title Bar           [⋮] │
├─────────────────────────────┤
│                             │
│                             │
│    Note Content             │
│    OR                       │
│    Agent Chat               │
│    OR                       │
│    Search Results           │
│                             │
│                             │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│ [📝] [🔍] [➕] [🤖] [📌]    │  ← Bottom nav (5 items)
└─────────────────────────────┘

Bottom Nav Items:
- 📝 Notes (current note or note list)
- 🔍 Search
- ➕ New Note (quick action)
- 🤖 Agent (chat view)
- 📌 Pinned (opens overlay)

Pinned Notes Overlay:
┌─────────────────────────────┐
│    Note Content (dimmed)    │
│                             │
│  ┌─────────────────────┐    │
│  │ 📌 Pinned Notes     │    │
│  │ ─────────────────── │    │
│  │ • Meeting Notes     │    │  ← Modal overlay
│  │ • Project Ideas     │    │     (center or bottom)
│  │ • Weekly Review     │    │
│  │ • Reading List      │    │
│  └─────────────────────┘    │
│                             │
└─────────────────────────────┘
```

### Pros
- Clear, always-visible navigation
- Pinned notes accessible from anywhere (overlay)
- Agent, search, and new note are one tap away
- Standard pattern (most mobile apps use bottom nav)
- Can show badges and notifications easily

### Cons
- Bottom nav takes permanent screen space
- Five items is the recommended maximum (can feel crowded)
- Overlay may obscure content
- Switching between notes and agent requires nav change

### Variations
- **A6.1:** Four items in nav, pinned notes in hamburger menu
- **A6.2:** Long-press nav items for quick actions (e.g., long-press Agent for new conversation)
- **A6.3:** Bottom nav auto-hides on scroll (appears on scroll up)
- **A6.4:** Pinned notes as slide-out drawer instead of overlay

---

## Design Approach 7: Command Palette / Spotlight Style

### Concept
Minimal UI with a persistent search/command bar at top. Everything accessible via search and commands. Note-first with keyboard-driven power-user features.

### Layout
```
┌─────────────────────────────┐
│  🔍 Search or command...    │  ← Always visible
├─────────────────────────────┤
│                             │
│                             │
│    Note Content             │
│    (Full Screen)            │
│                             │
│    # Note Title             │
│    Note markdown content... │
│                             │
│                             │
│                             │
│                             │
│                             │
└─────────────────────────────┘

Tap search bar:
┌─────────────────────────────┐
│  🔍 meeting                 │
├─────────────────────────────┤
│  📝 Meeting Notes           │
│  🤖 Ask agent about meeting │  ← Command results
│  ➕ New note: meeting       │
│  📌 Pin current note        │
│  📅 Today's daily note      │
│                             │
│  Recent:                    │
│  • Project Ideas            │
│  • Weekly Review            │
└─────────────────────────────┘
```

### Pros
- Extremely fast for power users
- Unified interface for search, navigation, actions
- Minimal UI chrome (more space for content)
- Scalable (can add many commands without UI clutter)
- Great for keyboard users (external keyboard support)

### Cons
- Requires typing (slower for casual browsing)
- Discoverability of commands can be poor
- Not ideal for touch-only interaction
- Learning curve (users need to know commands)

### Variations
- **A7.1:** Command palette + bottom sheet for visual navigation
- **A7.2:** Voice input support for commands
- **A7.3:** Smart suggestions based on context and usage patterns
- **A7.4:** Command aliases (e.g., "a" for agent, "p" for pinned)

---

## Comparative Matrix

| Approach | Note-First | Agent Access | Pinned Access | Discoverability | Standard Pattern | Learning Curve |
|----------|-----------|--------------|---------------|-----------------|------------------|----------------|
| A1: Bottom Sheet | ★★★★★ | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★★★★☆ | Low |
| A2: Tab Bar | ★★★☆☆ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | Very Low |
| A3: FAB + Radial | ★★★★★ | ★★★☆☆ | ★★★☆☆ | ★★☆☆☆ | ★★☆☆☆ | Medium |
| A4: Swipe-Based | ★★★★★ | ★★★★☆ | ★★★★☆ | ★★☆☆☆ | ★★☆☆☆ | High |
| A5: Card Stack | ★★★☆☆ | ★★★★☆ | ★★★★☆ | ★★★★★ | ★★★★★ | Low |
| A6: Bottom Nav | ★★★☆☆ | ★★★★★ | ★★★★☆ | ★★★★★ | ★★★★★ | Very Low |
| A7: Command Palette | ★★★★★ | ★★★★☆ | ★★★☆☆ | ★★☆☆☆ | ★★☆☆☆ | High |

---

## Recommendations by User Type

### For Casual Users (Discoverability Priority)
**Best:** Approach 2 (Tab Bar) or Approach 6 (Bottom Nav)
- Standard patterns
- Clear visual navigation
- Low learning curve

### For Power Users (Speed Priority)
**Best:** Approach 4 (Swipe-Based) or Approach 7 (Command Palette)
- Gesture-driven
- Minimal UI
- Fast access to all features

### For Balanced Experience (Note-First + Easy Navigation)
**Best:** Approach 1 (Bottom Sheet) - *Your initial idea!*
- Note content gets maximum space
- Quick access to agent and pinned notes
- Familiar interaction pattern (bottom sheets are common)
- Can expand to full screen when needed

---

## Hybrid Recommendation: Bottom Sheet + Bottom Nav

Combine the best of Approach 1 and Approach 6:

```
┌─────────────────────────────┐
│     [≡] Title Bar       [⋮] │
├─────────────────────────────┤
│                             │
│    Note Content             │
│    (Full Screen)            │
│                             │
│    # Note Title             │
│    Note markdown content... │
│                             │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│     ⌃  Swipe up for more    │  ← Bottom sheet indicator
├─────────────────────────────┤
│   [📝] [🔍] [➕] [🤖]       │  ← Minimal 4-item nav
└─────────────────────────────┘

Swipe up or tap indicator:
┌─────────────────────────────┐
│     [≡] Title Bar       [⋮] │
├─────────────────────────────┤
│    Note (partially visible) │
├─────────────────────────────┤
│  [Pinned] [Recent] [Agent]  │  ← Tabs in sheet
├─────────────────────────────┤
│  📌 Meeting Notes           │
│  📌 Project Ideas           │
│  📌 Weekly Review           │  ← Sheet content
│  📌 Reading List            │
│                             │
├─────────────────────────────┤
│   [📝] [🔍] [➕] [🤖]       │
└─────────────────────────────┘
```

**Why This Works:**
- ✅ Note-first (content dominates)
- ✅ Bottom sheet for contextual actions (pinned, recent, agent threads)
- ✅ Bottom nav for primary actions (view note, search, new, agent chat)
- ✅ Standard patterns (both bottom sheet and nav are familiar)
- ✅ Agent can be both in nav (for full chat) and sheet (for quick questions)
- ✅ Swipe gesture for power users, tap indicator for casual users

---

## Next Steps

1. **Create low-fidelity mockups** for top 2-3 approaches
2. **Prototype interaction patterns** (bottom sheet behavior, swipe gestures)
3. **User testing** with target audience (note-takers, PKM users)
4. **Consider implementation complexity** (React Native? Capacitor? Native?)
5. **Accessibility review** (VoiceOver, TalkBack, keyboard nav)

## Questions to Answer

- Should mobile be read-only or full-featured editing?
- Is the agent equally important as notes, or secondary?
- Do users need system views (Daily, Inbox) on mobile?
- Should pinned notes sync across devices?
- Is offline support required?
- What's the minimum viable feature set for v1?

---

*Brainstorm created: 2025-10-23*
