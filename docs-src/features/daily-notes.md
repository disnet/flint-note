# Daily Notes

A dedicated system for daily journaling, logging, and thought capture in Flint.

## What are Daily Notes?

**Daily Notes** are special notes created automatically for each day. They provide a dedicated space for:

- Daily journaling
- Thought capture throughout the day
- Meeting notes and conversations
- Ideas and observations
- Daily review and planning

**Key features:**

- One note per day (automatic)
- Calendar-style navigation
- Time-organized sections
- Quick access from anywhere
- Integrated with Daily View

## Accessing Daily Notes

### Quick Access

**From sidebar:**

- Look for "Daily" in the left sidebar
- Click today's date
- Note opens (created if doesn't exist)

**Keyboard shortcut:**

- Future: `Ctrl+D` / `Cmd+D` for today's note

**Via AI:**

```
You: Open today's daily note

AI: [Opens daily/2024-01-15.md]

    Opened today's daily note (Jan 15, 2024)
```

### Daily View

Flint includes a dedicated **Daily View** for working with daily notes.

**Access Daily View:**

1. Click "Daily" in the workspace bar
2. Or navigate to Daily section in sidebar

**What you see:**

- Calendar navigation
- Current day's note
- Day sections (Morning, Afternoon, Evening)
- Quick entry buttons
- Recent daily notes

## Daily Note Structure

### Default Template

Each daily note follows this structure:

```markdown
---
title: 2024-01-15
type: daily
date: 2024-01-15
---

# Monday, January 15, 2024

## Morning

## Afternoon

## Evening

## Notes
```

### Day Sections

**Morning section:**

- Captures early thoughts
- Planning for the day
- Morning meetings
- Initial ideas

**Afternoon section:**

- Midday activities
- Progress updates
- Afternoon meetings
- Ongoing thoughts

**Evening section:**

- End-of-day reflections
- What went well
- What to improve
- Tomorrow's prep

**Notes section:**

- Miscellaneous items
- Links to related notes
- References
- Anything uncategorized

### Customizing Template

**Edit the daily note type:**

1. Navigate to `.note-types/daily/daily.md`
2. Modify the template section
3. New daily notes use updated template

**Example custom template:**

```markdown
## Template

## \`\`\`markdown

title: ${DATE}
type: daily
date: ${DATE}
weather:
mood:

---

# ${DATE_FULL}

## 🌅 Morning

### Plan for Today

-

### Morning Activities

## 🌞 Afternoon

### Progress

## 🌙 Evening

### Reflections

### Gratitude

-

## 📌 Quick Notes

## 🔗 References

\`\`\`
```

**Variables available:**

- `${DATE}` - ISO date (2024-01-15)
- `${DATE_FULL}` - Full date (Monday, January 15, 2024)
- `${TITLE}` - Note title

## Daily View Interface

The Daily View provides a calendar-based interface for daily notes.

### Calendar Navigation

**Navigate days:**

- **Arrow buttons** - Previous/next day
- **Today button** - Jump to today
- **Calendar picker** - Select any date

**Week view:**

- See current week
- Click any day to navigate
- Highlighted: today, notes with content

**Month view:**

- Navigate by month
- Quick jump to specific day
- Visual indicators for days with notes

### Day Sections

**Collapsible sections:**

- Each section (Morning, Afternoon, Evening) can collapse
- Focus on current section
- Expand all to see full day

**Section timestamps:**

- Optional timestamps per entry
- Automatic or manual
- Track when thoughts occurred

### Quick Entry

**Quick add buttons:**

- "Add to Morning"
- "Add to Afternoon"
- "Add to Evening"
- "Add to Notes"

**Behavior:**

- Cursor positioned in that section
- Start typing immediately
- Auto-save as usual

## Using Daily Notes

### Daily Journaling

**Morning journaling:**

```markdown
## Morning

Woke up with an idea about [[Project Alpha]]. Need to:

- Review yesterday's progress in [[Work Log]]
- Schedule meeting with [[Team Lead]]
- Follow up on [[Client Proposal]]

Feeling: Focused and energized
```

**Evening reflection:**

```markdown
## Evening

Good progress today on [[Project Alpha]]. Completed:

- ✅ Design mockups
- ✅ Client meeting (went well!)
- ✅ Code review

Tomorrow:

- Start implementation
- Follow up with [[Sarah]] about timeline

What went well: Clear focus, productive meeting
What to improve: Less context switching
```

### Meeting Notes

**Inline meeting notes:**

```markdown
## Afternoon

### Team Standup - 2:00 PM

Attendees: [[Sarah]], [[John]], [[Maria]]

Updates:

- [[Sarah]]: Working on [[API Integration]]
- [[John]]: Testing [[New Feature]]
- Me: Finishing [[Project Docs]]

Action items:

- [ ] Review John's PR
- [ ] Schedule design sync
```

### Thought Capture

**Throughout the day:**

```markdown
## Morning

Idea: What if we integrated [[Tool X]] with [[System Y]]?
Need to research feasibility.

## Afternoon

Realized the [[Authentication Flow]] could be simplified.
Created [[Auth Simplification Proposal]].

## Evening

Reading [[Book: Atomic Habits]]. Key insight about
[[Identity-Based Change]]. Applies to [[Personal Goals]].
```

### Linking to Projects

**Connect daily activities to projects:**

```markdown
## Afternoon

Made progress on [[Website Redesign]]:

- Completed homepage mockup
- Got feedback from [[Design Team]]
- Updated [[Project Timeline]]

Next: Need to review [[Brand Guidelines]] before finalizing.
```

Daily notes become a chronological log of project progress.

## Workflows with Daily Notes

### Daily Planning

**Morning routine:**

1. Open today's daily note
2. Review yesterday's evening section
3. Write morning plan
4. Link to relevant project notes

**Example:**

```markdown
## Morning

### Today's Plan

**Focus:** [[Project Alpha]] implementation

High priority:

1. Complete [[API Integration]]
2. Review [[Design Feedback]]
3. Update [[Project Status]]

Meetings:

- 10am: [[Team Standup]]
- 2pm: [[Client Check-in]]

Goals:

- Ship feature X
- Clear inbox to zero
```

### Daily Review

**Evening routine:**

1. Open today's daily note
2. Review what happened
3. Note accomplishments
4. Plan tomorrow
5. Create any follow-up notes

**Example:**

```markdown
## Evening

### Accomplishments

- ✅ Completed API integration
- ✅ Resolved 3 bugs
- ✅ Updated documentation

### Challenges

- Integration took longer than expected
- Need more [[Testing Resources]]

### Follow-ups

- Created [[Bug: Timeout Issue]] to track
- Need to discuss [[Resource Allocation]] with team

### Tomorrow

- Start [[Feature B]]
- Finish [[Documentation Updates]]
```

### Weekly Review

**Review past week's daily notes:**

```
You: Summarize my daily notes from last week

AI: [Reads daily notes from past 7 days]

    Last week summary (Jan 8-14):

    Main projects worked on:
    - Project Alpha (5 days)
    - Client Website (3 days)
    - Documentation (ongoing)

    Accomplishments:
    - Completed API integration
    - Shipped 2 features
    - 5 client meetings

    Patterns:
    - Most productive: mornings
    - Interrupted: afternoons (3 days)
    - Meetings: avg 2 per day

    Action items for next week:
    - Schedule focused afternoon time
    - Follow up on 3 pending items
```

### Project Logging

**Track project progress:**

```markdown
## Afternoon

[[Project Alpha]] Update:

Progress:

- Implemented authentication flow
- Added error handling
- Updated tests

Blockers:

- Waiting on [[API Keys]] from client
- [[Design Assets]] not ready

Next steps:

- Continue with other features
- Follow up on blockers tomorrow

See: [[Project Alpha Timeline]]
```

All project updates chronologically logged.

## Advanced Features

### Time Stamping

**Manual timestamps:**

```markdown
## Afternoon

14:30 - Started working on [[Feature X]]

15:45 - Discovered issue with [[API]], investigating

16:20 - Fixed! Was a configuration problem. Updated [[Troubleshooting Guide]].
```

**Benefits:**

- Track when thoughts occurred
- Measure time on tasks
- Understand daily patterns

### Mood Tracking

**Add mood to frontmatter:**

```markdown
---
title: 2024-01-15
type: daily
date: 2024-01-15
mood: focused
energy: high
---
```

**Over time:**

```
You: Analyze my mood patterns over the past month

AI: [Reads mood field from daily notes]

    Mood analysis (past 30 days):

    Most common moods:
    - Focused (12 days)
    - Productive (8 days)
    - Tired (5 days)

    Energy levels:
    - High: 15 days
    - Medium: 10 days
    - Low: 5 days

    Patterns:
    - Mondays: usually high energy
    - Fridays: often tired
    - After meetings: energy dips
```

### Habit Tracking

**Track daily habits:**

```markdown
## Evening

### Habits Today

- [x] Morning exercise
- [x] Meditation
- [x] Reading
- [ ] Writing (missed)

Streak: Exercise (15 days)
```

**Or in frontmatter:**

```markdown
---
habits:
  exercise: true
  meditation: true
  reading: true
  writing: false
---
```

### Integration with Tasks

**Tasks mentioned in daily notes:**

```markdown
## Afternoon

Created tasks:

- [[Task: Review PR #123]]
- [[Task: Update documentation]]
- [[Task: Follow up with client]]

Completed:

- ✅ [[Task: Fix bug in API]]
- ✅ [[Task: Deploy to staging]]
```

Links to task notes for detailed tracking.

## Browsing Historical Daily Notes

### Navigation

**Sequential navigation:**

- Previous/next day buttons
- Keyboard: arrow keys (future)

**Calendar jumping:**

- Click calendar icon
- Select any date
- Jump to that day's note

**Via search:**

```
type:daily created:last-week
```

### Finding Past Entries

**Search within daily notes:**

```
You: Find my daily notes mentioning "project alpha"

AI: [Searches type:daily "project alpha"]

    Found 12 daily notes mentioning "project alpha":
    - Jan 15: Started implementation
    - Jan 14: Planning meeting
    - Jan 12: Initial proposal
    ...
```

**Grep through daily notes:**

```
You: What did I work on last Monday?

AI: [Reads daily note from last Monday]

    Last Monday (Jan 8):

    Morning:
    - Planned week's priorities
    - Team standup

    Afternoon:
    - Worked on API integration
    - Client meeting about timeline

    Evening:
    - Made good progress
    - Identified blocker for tomorrow
```

### Exporting Daily Notes

**Create monthly summary:**

```
You: Summarize my daily notes from January

AI: [Reads all January daily notes, creates summary]

    Created: summaries/january-2024-summary.md

    January 2024 Summary:

    Projects worked on:
    - Project Alpha (primary focus)
    - Client Website
    - Documentation

    Key accomplishments:
    - Launched Feature X
    - Completed 15 tasks
    - 12 client meetings

    Patterns:
    - Best productivity: mornings
    - Regular exercise: 20/31 days
    - Writing streak: 15 days

    Linked to 31 daily notes
```

## Best Practices

### Capture in the Moment

**Write throughout the day:**

```markdown
## Morning

Ideas while making coffee...

## Afternoon

Update after meeting...

## Evening

Reflect on the day...
```

Don't wait until end of day - you'll forget details.

### Link Liberally

**Connect daily notes to:**

- Project notes: `[[Project Alpha]]`
- People: `[[Sarah Johnson]]`
- Concepts: `[[API Design]]`
- Other daily notes: `[[daily/2024-01-14]]`

**Benefits:**

- Build knowledge graph
- See project timelines
- Track conversations
- Find related context

### Use Consistent Structure

**Stick to template:**

- Easier to scan past notes
- Establish routines
- AI can analyze patterns

**Customize once, use forever:**

- Modify template to fit your needs
- Then use consistently
- Adjust only when necessary

### Review Regularly

**Daily review (evening):**

- What happened today?
- What did I learn?
- What's important for tomorrow?

**Weekly review:**

- Read past week's notes
- Identify patterns
- Plan next week

**Monthly review:**

- Skim each day
- Extract key insights
- Create summary note

### Keep it Low-Friction

**Don't overthink:**

- Capture quickly
- Refine later if needed
- Perfect is enemy of done

**Short entries are fine:**

```markdown
## Afternoon

Productive meeting with client. Created [[Action Items]].
```

**Long entries are fine too:**

```markdown
## Evening

Lots to reflect on today...
(detailed thoughts)
```

Whatever serves your thinking.

## Daily Notes vs Other Systems

### Daily Notes vs Inbox

**Daily notes:**

- Chronological organization
- Daily review built-in
- Structured by time

**Inbox:**

- No organization
- Process later
- Quick capture

**Use both:**

- Quick captures → Inbox
- Daily thoughts → Daily note
- Process inbox → Move to appropriate notes/daily

### Daily Notes vs Journals

**Same thing!**

- Daily notes = digital journal
- More structured (sections, links)
- Integrated with other notes

### Daily Notes vs Meeting Notes

**Daily notes:**

- Quick inline meeting notes
- Conversational flow
- Part of daily context

**Meeting notes:**

- Dedicated meeting note
- Detailed minutes
- Shared with team

**Use both:**

- Quick summary in daily note
- Detailed notes in meeting note
- Link between them

## Troubleshooting

### Daily Note Not Created

**Problem:** Today's note doesn't exist.

**Solution:**

1. Click "Daily" in sidebar
2. Note creates automatically
3. Or create manually: new note, type "daily", name with today's date

### Can't Find Past Daily Notes

**Problem:** Can't locate a specific day.

**Solutions:**

1. Use calendar navigation in Daily View
2. Search: `type:daily created:2024-01-15`
3. Browse `daily/` folder directly

### Template Not Applied

**Problem:** Daily note doesn't have expected structure.

**Solution:**

1. Check `.note-types/daily/daily.md` template
2. Manually add structure this time
3. Fix template for future notes

## Next Steps

- **[Inbox System](/features/inbox)** - Capture before organizing
- **[Review System](/features/review-system)** - Review past daily notes
- **[Note Management](/features/notes)** - Link daily notes to projects
- **[AI Agent](/features/agent)** - Analyze daily patterns

---

**Pro tip:** Daily notes become more valuable over time. The investment is small (a few minutes daily), but the ability to trace your thinking and projects chronologically is invaluable. Start today!
