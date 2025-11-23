# Core Concepts

Flint's fundamental philosophy and how its features work together to build deep knowledge.

## The Core Philosophy

**Flint builds deep knowledge by supporting the complete learning cycle of externalizing (getting ideas out), internalizing (making them yours), and resurfacing (bringing them back repeatedly over time to ground memory).**

Most tools optimize for just one part:

- **Capture tools** focus on externalizing but don't help with retention
- **Study tools** focus on resurfacing but make capture painful
- **Writing tools** focus on output but don't help with learning

**Flint optimizes for the entire process.**

## The Three Phases

### Externalizing: Getting Ideas Out

**The problem:** Worrying about "where does this go?" creates capture friction.

**Flint's solution:** Capture freely. The system handles organization through [note types](/features/notes#note-types) and relationships.

**Example:** Create a meeting note without deciding its folder, tags, or final structure. Mark it processed later when you've extracted action items and linked related concepts.

### Internalizing: Making Knowledge Yours

**The problem:** Passive re-reading doesn't build understanding. Real learning requires active engagement.

**Flint's solution:**
- Wikilinks force you to see relationships
- [Note types](/features/notes#note-types) guide different thinking patterns
- The [AI agent](/features/agent) helps connect and synthesize
- [Review system](/features/review-system) tests actual understanding

**Example:** While writing about a project decision, linking to `[[past-failures]]` and `[[design-principles]]` helps you internalize why certain approaches work. The act of linking deepens understanding.

### Resurfacing: Building Long-Term Memory

**The problem:** Most notes are written once and never seen again.

**Flint's solution:**
- [Spaced repetition](/features/review-system) brings notes back on schedule
- Routines automate recurring synthesis
- Backlinks surface past connections
- Search works on ideas, not just keywords

**Example:** A weekly routine prompts: "Review this week's daily notes and extract insights." The [review system](/features/review-system) tests your recall of key concepts on an optimal schedule.

## How Features Support the Cycle

### Notes as First-Class Abstractions

You think in ideas, not files. The system handles file naming, folder structure, and organization.

- **Type-driven** - Organization emerges from content and relationships
- **Frictionless** - No decisions about "where does this go?"

See [Note Management](/features/notes) for details.

### Note Types

Different knowledge needs different thinking patterns. Types aren't just organizational—they're cognitive guides.

- **Evergreen notes** → synthesis and universal principles
- **Predictions** → falsifiable claims with calibration
- **Daily notes** → structured reflection
- **Meeting notes** → action items and context

The type itself shapes how you think.

**Supports:** Externalizing (guides capture) · Internalizing (structures processing) · Resurfacing (enables patterns)

See [Note Types](/features/notes#note-types) and [Daily Notes](/features/daily-notes).

### Wikilinks & Backlinks

Making connections explicit deepens learning.

- `[[Link]]` as you write → externalizes relationships
- Backlinks panel → shows where ideas have been applied
- Knowledge graph → mirrors how you actually think

**Supports:** Externalizing (relationship thinking) · Internalizing (connection discovery) · Resurfacing (associative navigation)

### AI Agent

A learning partner with semantic access to your notes—not generating thoughts, but supporting all three phases.

- Helps structure capture conversationally
- Suggests connections and provides feedback
- Executes routines and generates [review prompts](/features/review-system)
- Type-aware assistance (creates evergreen notes differently than predictions)

**Supports all three phases.**

See [AI Agent](/features/agent).

### Review System

Spaced repetition with AI-generated prompts removes the friction of writing flashcards.

1. Mark note "for review"
2. AI generates contextual test prompt
3. Answer, get feedback, rate performance
4. System reschedules based on recall

**Supports:** Internalizing (active recall) · Resurfacing (optimal scheduling)

See [Review System](/features/review-system).

### Routines

Scheduled practices for recurring workflows—weekly reviews, reading processing, prediction calibration.

Removes discipline burden by automating when and what to do. Build sustainable learning habits.

**Supports:** Externalizing (structured prompts) · Internalizing (regular synthesis) · Resurfacing (recurring reflection)

### Reference Shelf

Keep multiple notes visible while editing. Live editors on each, toggle to show/hide. Works like physical reference materials on a desk.

**Supports:** Externalizing (maintain context) · Internalizing (draw connections)

### Pinned Notes & Workspaces

Manual positioning, not auto-sorted. Spatial memory—you know where things are by position. Make a mess during exploration; cleanup is easy.

[Workspaces](/guides/interface#workspaces-bar) group pinned notes for different projects. Switch contexts without losing your place.

**Supports:** Externalizing (fluid exploration) · Internalizing (spatial memory) · Resurfacing (easy context switching)

See [Workspaces](/guides/interface#workspaces-bar).

### Inbox

All recent notes in one place. Mark as processed when reviewed. Removes "will I find this later?" anxiety.

**Supports:** Externalizing (capture without worry) · Internalizing (lightweight processing routine)

## Key Design Principles

### Notes, Not Files

You see ideas and connections. The system handles file naming, storage, folders, and metadata.

### Type-Guided Thinking

Note types shape how you think. Creating an evergreen note prompts synthesis. Creating a prediction forces falsifiable framing.

### Emergent Organization

Structure emerges from content and relationships—not predetermined hierarchies imposed before you've thought through the material.

## Best Practices

**Let structure emerge.** Don't over-plan. Start with general notes, notice patterns, create types as needs become clear.

**Trust the process.** Capture (externalize) → connect (internalize) → process (internalize) → review (resurface).

## Next Steps

**Core Features:**
- [User Interface](/guides/interface) - Detailed interface walkthrough
- [Note Management](/features/notes) - Notes, types, and organization

**Learning System:**
- [AI Agent](/features/agent) - What the agent can do
- [Review System](/features/review-system) - Active recall practice

**Organization:**
- [Workspaces](/guides/interface#workspaces-bar) - Manage multiple contexts
- [Daily Notes](/features/daily-notes) - Daily journaling workflow

---

**Remember:** All features work together to support the complete learning cycle—externalizing, internalizing, and resurfacing. That's how you build deep, lasting knowledge.
