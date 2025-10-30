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

| Approach            | Note-First | Agent Access | Pinned Access | Discoverability | Standard Pattern | Learning Curve |
| ------------------- | ---------- | ------------ | ------------- | --------------- | ---------------- | -------------- |
| A1: Bottom Sheet    | ★★★★★      | ★★★★☆        | ★★★★☆         | ★★★★☆           | ★★★★☆            | Low            |
| A2: Tab Bar         | ★★★☆☆      | ★★★★★        | ★★★★★         | ★★★★★           | ★★★★★            | Very Low       |
| A3: FAB + Radial    | ★★★★★      | ★★★☆☆        | ★★★☆☆         | ★★☆☆☆           | ★★☆☆☆            | Medium         |
| A4: Swipe-Based     | ★★★★★      | ★★★★☆        | ★★★★☆         | ★★☆☆☆           | ★★☆☆☆            | High           |
| A5: Card Stack      | ★★★☆☆      | ★★★★☆        | ★★★★☆         | ★★★★★           | ★★★★★            | Low            |
| A6: Bottom Nav      | ★★★☆☆      | ★★★★★        | ★★★★☆         | ★★★★★           | ★★★★★            | Very Low       |
| A7: Command Palette | ★★★★★      | ★★★★☆        | ★★★☆☆         | ★★☆☆☆           | ★★☆☆☆            | High           |

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

**Best:** Approach 1 (Bottom Sheet) - _Your initial idea!_

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

## Mobile Browser Chrome Constraint

**Critical Issue:** Modern mobile browsers (especially Safari on iOS) now use **floating/overlaid bottom chrome** that sits on top of web content. This creates conflicts with:

- Bottom navigation bars (chrome overlaps the nav)
- Bottom sheets (chrome interferes with swipe gestures)
- Fixed bottom UI elements (partially obscured)

**Safari iOS Behavior:**

- Bottom bar appears on initial load
- Auto-hides on scroll down
- Reappears on scroll up or tap near bottom
- Height varies: ~44px collapsed, ~88px expanded (with tab switcher)
- Uses `safe-area-inset-bottom` but still overlays content

**Chrome Android Behavior:**

- Similar floating behavior
- Can be more aggressive with auto-hide
- Address bar at top also collapses/expands

**Solutions:**

1. **FAB Positioning:** Place FAB in safe zone (right side, above browser chrome)
2. **Full-Screen Modals:** Modal sheets overlay everything including browser chrome
3. **Dynamic Positioning:** Use CSS `env(safe-area-inset-bottom)` for padding
4. **Gesture Detection:** Distinguish between browser gestures and app gestures
5. **Avoid Bottom UI:** Don't rely on persistent bottom elements in browser

This significantly favors FAB-based designs!

---

## FAB-Based Design Explorations

Given the browser chrome constraint, let's explore FAB-based approaches in detail.

### FAB Design 1: Single FAB with Full Modal Sheet

#### Concept

One FAB button positioned in safe zone (bottom-right, above browser chrome). Tapping opens a full-screen modal with navigation hub.

#### Layout

```
Reading Mode:
┌─────────────────────────────┐
│                             │  ← Status bar (hidden)
│                             │
│    Note Content             │
│    (Edge-to-Edge)           │
│                             │
│    # Meeting Notes          │
│                             │
│    Content continues...     │
│    Lorem ipsum dolor sit    │
│    amet consectetur...      │
│                             │
│                      ●🔧   │  ← FAB (80px from bottom)
│                             │
│                             │
└─────────────────────────────┘
   ↑ Browser chrome (floating)

FAB Pressed:
┌─────────────────────────────┐
│  Navigation            [✕]  │  ← Modal header
├─────────────────────────────┤
│  🔍 Search notes...         │  ← Search bar (top)
├─────────────────────────────┤
│                             │
│  📌 Pinned Notes            │
│  ┌───────────────────────┐  │
│  │ Meeting Notes    →    │  │
│  │ Project Ideas    →    │  │
│  │ Weekly Review    →    │  │
│  └───────────────────────┘  │
│                             │
│  🤖 Agent                   │
│  ┌───────────────────────┐  │
│  │ Start Conversation    │  │  ← Full modal
│  │ Recent Chats    →     │  │     (overlays everything)
│  └───────────────────────┘  │
│                             │
│  📂 Views                   │
│  ┌───────────────────────┐  │
│  │ Inbox          →      │  │
│  │ Daily Timeline →      │  │
│  │ All Notes      →      │  │
│  └───────────────────────┘  │
│                             │
│  [+ New Note]               │  ← Big action button
└─────────────────────────────┘
```

#### Interaction Details

- **FAB Icon:** Context-aware (🔧 default, 🤖 when agent active, etc.)
- **FAB Long-Press:** Quick action (new note, quick capture)
- **Modal Dismiss:** Tap outside, swipe down, or X button
- **Search Focus:** Auto-focus search when modal opens (optional)
- **Animation:** FAB morphs into modal with smooth transition

#### Pros

✅ No conflict with browser chrome (FAB positioned above it)
✅ Modal overlays browser UI completely
✅ All navigation in one place (search, pinned, agent, views)
✅ Large tap targets in modal (touch-friendly)
✅ Can add more sections without cluttering main view
✅ Clear "hub" mental model

#### Cons

❌ Requires tap to access any navigation
❌ FAB partially obscures note content (though minimal)
❌ Two-step process to get to pinned notes or agent
❌ Modal hides note content while navigating

---

### FAB Design 2: Contextual FAB with Smart Actions

#### Concept

FAB changes behavior based on context. In reading mode: navigation hub. In editing mode: formatting tools. Dynamic and adaptive.

#### Layout States

```
Reading Mode:
┌─────────────────────────────┐
│    Note Content             │
│    # Title                  │
│    Content...               │
│                      ●☰    │  ← FAB: Navigation
└─────────────────────────────┘

Editing Mode:
┌─────────────────────────────┐
│    Note Content (editable)  │
│    # Title█                 │
│    Content...               │
│                      ●B    │  ← FAB: Format menu
└─────────────────────────────┘
        ↓ (tapped)
│    Bold Italic Link         │  ← Mini toolbar
│           ●✓               │  ← FAB: Done

Agent Chat Active:
┌─────────────────────────────┐
│    Agent Messages           │
│    You: Help me...          │
│    Agent: Sure...           │
│                      ●↑    │  ← FAB: Send message
└─────────────────────────────┘

Pinned Notes View:
┌─────────────────────────────┐
│    📌 Pinned Notes          │
│    • Meeting Notes          │
│    • Project Ideas          │
│                      ●+    │  ← FAB: New note
└─────────────────────────────┘
```

#### FAB Actions by Context

| Context        | FAB Icon | Action         | Long-Press       |
| -------------- | -------- | -------------- | ---------------- |
| Reading note   | ☰ Menu  | Open nav modal | Quick search     |
| Editing note   | B Format | Format toolbar | Done editing     |
| Agent chat     | ↑ Send   | Send message   | New conversation |
| Pinned list    | + New    | Create note    | Quick capture    |
| Search results | × Clear  | Exit search    | -                |

#### Pros

✅ Context-aware (always relevant action)
✅ Reduces steps for common actions
✅ Power users learn context patterns
✅ Still no browser chrome conflict

#### Cons

❌ Less predictable (FAB changes meaning)
❌ Learning curve (need to understand contexts)
❌ May confuse users switching contexts
❌ Harder to discover all features

---

### FAB Design 3: Multi-FAB with Quick Actions

#### Concept

Primary FAB opens into multiple mini-FABs for quick actions (similar to Material Design speed dial).

#### Layout

```
Collapsed:
┌─────────────────────────────┐
│    Note Content             │
│                             │
│    # Title                  │
│    Content...               │
│                             │
│                      ●+    │  ← Primary FAB
│                             │
└─────────────────────────────┘

Expanded (FAB tapped):
┌─────────────────────────────┐
│    Note Content (dimmed)    │
│                             │
│                      📌     │  ← Mini FAB: Pinned
│                             │
│                      🤖     │  ← Mini FAB: Agent
│                             │
│                      🔍     │  ← Mini FAB: Search
│                             │
│                      ●✕    │  ← Primary FAB: Close
└─────────────────────────────┘
```

#### Interaction

- **Tap Primary:** Expands to show mini-FABs
- **Tap Mini-FAB:** Opens that feature (e.g., Pinned → pinned notes modal)
- **Background Dim:** Indicates expanded state, tap to close
- **Animation:** Mini-FABs slide out from primary with stagger

#### Mini-FAB Actions

1. **📌 Pinned** → Opens pinned notes modal
2. **🤖 Agent** → Opens agent chat modal
3. **🔍 Search** → Opens search modal
4. **➕ New** → Creates new note (or shows note type picker)
5. **📥 Inbox** → Opens inbox view

#### Pros

✅ One-tap access to main features
✅ Visual (all options shown when expanded)
✅ Familiar pattern (Material Design)
✅ Can accommodate 4-6 quick actions

#### Cons

❌ Mini-FABs can obscure content
❌ Requires precision tapping (smaller targets)
❌ May feel cluttered when expanded
❌ Still needs modals for actual content

---

### FAB Design 4: FAB + Slide-In Panel

#### Concept

FAB opens a side panel that slides in from the right (or bottom), keeping note partially visible.

#### Layout

```
Default:
┌─────────────────────────────┐
│    Note Content             │
│    # Title                  │
│    Content...               │
│                      ●☰    │  ← FAB
└─────────────────────────────┘

FAB Tapped - Panel Slides In:
┌──────────────┬──────────────┐
│              │ [✕] Nav      │  ← Slide-in panel
│  Note        ├──────────────┤    (60-70% width)
│  Content     │ 🔍 Search... │
│  (visible)   │              │
│              │ 📌 Pinned    │
│              │ • Meeting    │
│              │ • Project    │
│     ●☰      │              │
│              │ 🤖 Agent     │
│              │ • Start chat │
│              │              │
│              │ 📂 Views     │
└──────────────┴──────────────┘
```

#### Panel Variations

**Right Panel (default):**

- Slides from right edge
- Note visible on left (dimmed)
- Better for right-handed users

**Bottom Panel:**

- Slides up from bottom (above browser chrome)
- Note visible on top
- More vertical space for lists

**Left Panel:**

- Slides from left edge
- Better for left-handed users
- Less common pattern

#### Pros

✅ Note content stays partially visible
✅ Can see context while navigating
✅ Dismissible with swipe or tap outside
✅ More space than modal for navigation items

#### Cons

❌ Less space than full modal
❌ Note content is obscured
❌ Panel width needs careful tuning (too narrow = cramped, too wide = hides note)
❌ May compete with native browser gestures (swipe from edge)

---

### FAB Design 5: Pill FAB with Expandable Menu Bar

#### Concept

Instead of circular FAB, use a "pill" shaped bar that expands inline with actions.

#### Layout

```
Collapsed State:
┌─────────────────────────────┐
│    Note Content             │
│                             │
│    # Title                  │
│    Content...               │
│                             │
│              [☰ Menu]       │  ← Pill FAB (bottom-right)
│                             │
└─────────────────────────────┘

Expanded State (horizontal):
┌─────────────────────────────┐
│    Note Content             │
│                             │
│    # Title                  │
│    Content...               │
│                             │
│  [📌] [🤖] [🔍] [➕] [✕]   │  ← Expanded pill bar
│                             │
└─────────────────────────────┘

Expanded State (vertical):
┌─────────────────────────────┐
│    Note Content             │
│                             │
│    # Title                  │
│    Content...               │
│                 ┌─────┐     │
│                 │ 📌  │     │
│                 │ 🤖  │     │  ← Vertical pill
│                 │ 🔍  │     │
│                 │ ➕  │     │
│                 │ ✕   │     │
│                 └─────┘     │
└─────────────────────────────┘
```

#### Interaction

- **Tap Pill:** Expands to show icon buttons
- **Tap Icon:** Opens that feature's modal/view
- **Tap X or Outside:** Collapses back to pill
- **Animation:** Smooth width/height expansion

#### Pros

✅ Less intrusive than circular FAB
✅ Can show labels when expanded (e.g., "Pinned", "Agent")
✅ Familiar pattern (similar to mobile app quick actions)
✅ Flexible layout (horizontal or vertical)

#### Cons

❌ Takes more space when expanded
❌ May look less polished than circular FAB
❌ Horizontal version can be wide (may wrap on small screens)

---

### FAB Design 6: Double FAB (Navigation + Action)

#### Concept

Two FABs positioned strategically: one for navigation, one for primary action (new note).

#### Layout

```
┌─────────────────────────────┐
│    Note Content             │
│                             │
│    # Title                  │
│    Content...               │
│                             │
│              ●☰            │  ← Navigation FAB
│                             │
│    ●+                      │  ← Action FAB (new note)
└─────────────────────────────┘
   ↑ Left side            ↑ Right side
```

#### Positioning

- **Left FAB:** Primary action (New Note) - left thumb zone
- **Right FAB:** Navigation menu - right thumb zone
- Both positioned above browser chrome safe zone

#### Interaction

- **Left FAB:** Always creates new note (or opens note type picker)
- **Right FAB:** Opens navigation modal (pinned, agent, search, views)
- **Long-press Left:** Quick capture / inbox
- **Long-press Right:** Quick search

#### Pros

✅ Dedicated button for most common action (new note)
✅ Clear separation: action vs navigation
✅ Ambidextrous design (both thumbs have targets)
✅ No mode switching needed

#### Cons

❌ Two FABs may feel cluttered
❌ Takes up more screen space
❌ Users might not know which to tap first
❌ Harder to maintain visual hierarchy

---

### FAB Design 7: Smart FAB with Progressive Disclosure

#### Concept

Single FAB that adapts to usage patterns. Shows most-used features first, others on second tap.

#### Layout

```
First Tap (Common Actions):
┌─────────────────────────────┐
│    Note Content (dimmed)    │
│                             │
│  ┌─────────────────────┐    │
│  │ Quick Actions       │    │
│  │                     │    │
│  │ 📌 Pinned Notes     │    │  ← Top 3 most-used
│  │ 🤖 Start Agent      │    │     features
│  │ 🔍 Search           │    │
│  │                     │    │
│  │ [More...]           │    │  ← Expand for full menu
│  └─────────────────────┘    │
│                      ●     │
└─────────────────────────────┘

Second Tap on "More" (Full Menu):
┌─────────────────────────────┐
│  [Back] All Options    [✕]  │
├─────────────────────────────┤
│  🔍 Search                  │
│  📌 Pinned Notes            │
│  🤖 Agent                   │
│  ➕ New Note                │
│  📥 Inbox                   │
│  📅 Daily Timeline          │
│  📝 All Notes               │
│  ⚙️ Settings               │
└─────────────────────────────┘
```

#### Smart Behavior

- **Usage Tracking:** Learns which features user accesses most
- **Adaptive Order:** Reorders quick actions based on frequency
- **Time-Aware:** Morning = Daily note, Evening = Review/inbox
- **Context-Aware:** Reading mode = search/pinned, No note = new note

#### Pros

✅ Personalized to user habits
✅ Reduces cognitive load (shows what matters)
✅ Still gives access to everything (via More)
✅ Gets faster over time as it learns

#### Cons

❌ Unpredictable (menu changes)
❌ Complex to implement (usage tracking)
❌ May confuse users when order changes
❌ Privacy concerns (tracking behavior)

---

## FAB Design Comparison

| Design         | Simplicity | Speed | Discoverability | Screen Space | Novelty |
| -------------- | ---------- | ----- | --------------- | ------------ | ------- |
| 1. Full Modal  | ★★★★★      | ★★★☆☆ | ★★★★★           | ★★★★★        | ★★★☆☆   |
| 2. Contextual  | ★★★☆☆      | ★★★★★ | ★★☆☆☆           | ★★★★★        | ★★★★☆   |
| 3. Multi-FAB   | ★★★★☆      | ★★★★☆ | ★★★★☆           | ★★★★☆        | ★★★☆☆   |
| 4. Slide Panel | ★★★★☆      | ★★★★☆ | ★★★★☆           | ★★★☆☆        | ★★★☆☆   |
| 5. Pill Menu   | ★★★★☆      | ★★★★☆ | ★★★★★           | ★★★☆☆        | ★★★★☆   |
| 6. Double FAB  | ★★★☆☆      | ★★★★★ | ★★★☆☆           | ★★★★☆        | ★★☆☆☆   |
| 7. Smart FAB   | ★★☆☆☆      | ★★★★★ | ★★☆☆☆           | ★★★★★        | ★★★★★   |

---

## Recommended FAB Approach

### Winner: FAB Design 1 (Full Modal) + Design 3 (Multi-FAB) Hybrid

**Why this combination:**

```
Default State:
┌─────────────────────────────┐
│    Note Content             │
│    (Edge-to-Edge)           │
│                             │
│    # Title                  │
│    Content...               │
│                      ●+    │  ← Single FAB (primary action)
└─────────────────────────────┘

Quick Actions (long-press or swipe on FAB):
┌─────────────────────────────┐
│    Note Content (dimmed)    │
│                             │
│                      📌     │  ← Pinned notes
│                      🤖     │  ← Agent
│                      🔍     │  ← Search
│                      ●☰    │  ← More options
└─────────────────────────────┘

Full Modal (tap "More" mini-FAB):
┌─────────────────────────────┐
│  Navigation            [✕]  │
├─────────────────────────────┤
│  🔍 Search notes...         │
├─────────────────────────────┤
│  📌 Pinned Notes            │
│  • Meeting Notes            │
│  • Project Ideas            │
│                             │
│  🤖 Agent                   │
│  • Start Conversation       │
│  • Recent Chats             │
│                             │
│  📂 System Views            │
│  • Inbox                    │
│  • Daily Timeline           │
│  • All Notes                │
│                             │
│  [+ New Note]               │
└─────────────────────────────┘
```

**Interaction Flow:**

1. **Tap FAB** → Create new note (most common action)
2. **Long-press FAB** → Shows 3-4 mini-FABs (pinned, agent, search, more)
3. **Tap mini-FAB** → Direct action (pinned → pinned list, agent → start chat)
4. **Tap "More" mini-FAB** → Full navigation modal

**Why this works:**
✅ **Speed:** Most common action (new note) is one tap
✅ **Discoverable:** Long-press reveals more options (micro-tutorial on first use)
✅ **Comprehensive:** Full modal gives access to everything
✅ **Progressive:** Three levels: quick action → quick menu → full menu
✅ **Browser-safe:** FAB positioned above browser chrome
✅ **Clean:** Default state is minimal (just one FAB)

---

## Implementation Considerations

### CSS Safe Area Handling

```css
.fab {
  position: fixed;
  bottom: calc(16px + env(safe-area-inset-bottom));
  right: 16px;
  /* Ensures FAB is always above browser chrome */
}

.modal {
  position: fixed;
  inset: 0;
  /* Full screen, overlays browser chrome */
}
```

### Gesture Detection

- **Short tap:** Primary action
- **Long press (500ms):** Show mini-FABs
- **Swipe up on FAB:** Alternative to long-press (discovery)
- **Tap outside:** Dismiss mini-FABs or modal

### Animation

- **FAB → Mini-FABs:** Staggered slide-out (150ms delay between each)
- **Mini-FAB → Modal:** Expand from mini-FAB position
- **Backdrop:** Fade in background dim (0.5s ease)

### Accessibility

- **Screen reader labels:** Clear labels for each FAB action
- **Touch targets:** Minimum 44x44px for all interactive elements
- **Keyboard navigation:** Tab through mini-FABs, Esc to dismiss
- **Reduced motion:** Respect `prefers-reduced-motion` (instant transitions)

---

## Alternative: Minimal Swipe-Based (No FAB)

If you want to go even more minimal:

```
┌─────────────────────────────┐
│                             │  ← Edge-to-edge content
│    Note Content             │
│    No permanent UI          │
│                             │
│    # Title                  │
│    Content...               │
│                             │
│                             │
└─────────────────────────────┘

Gestures:
- Swipe DOWN from top → Search bar appears
- Swipe UP from bottom → Navigation modal
- Swipe RIGHT from left edge → Pinned notes drawer
- Swipe LEFT from right edge → Agent chat drawer
```

**Pros:** Maximum immersion, no visual clutter
**Cons:** Poor discoverability, conflicts with browser gestures

**Verdict:** Only for power users or with extensive onboarding

---

## Next Steps for FAB Design

1. **Create interactive prototype** (Figma or React prototype)
2. **Test FAB position** (does it conflict with content? thumb reach?)
3. **Design mini-FAB icons** (clear, distinct, recognizable)
4. **Build modal content** (pinned notes list, agent chat, system views)
5. **Handle keyboard states** (modal behavior when keyboard appears)
6. **Test on real devices** (iPhone 15, Android flagship, various screen sizes)

---

_Brainstorm created: 2025-10-23_
_FAB section added: 2025-10-23_
