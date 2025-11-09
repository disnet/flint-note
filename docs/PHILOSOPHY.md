# Flint Philosophy

## Core Beliefs

### AI Should Assist Thinking, Not Replace It

The fundamental principle of Flint is that **humans think, AI assists**.

**Why this matters**:

- Thinking is inherently human; outsourcing it diminishes us
- The act of thinking strengthens understanding and memory
- AI-generated content lacks personal context and meaning
- True knowledge comes from wrestling with ideas yourself

**How Flint embodies this**:

- AI helps with metadata, organization, and workflow automation
- AI suggests connections and patterns, but you evaluate them
- You write your notes; AI doesn't generate content for you
- AI assists with tedious tasks so you can focus on thinking

### Frictionless Capture, Gradual Organization

**The problem with traditional note-taking**:

- Forced categorization interrupts flow
- Overthinking organization prevents writing
- Perfect structure is impossible at capture time

**Flint's approach**:

- **Inbox** - Write without organizing
- **Temporary tabs** - Browse without committing
- **AI-assisted processing** - Organize later with help
- **Emergent structure** - Let organization evolve naturally

**Philosophy**:

- Capture is time-sensitive; organization is not
- Write when inspiration strikes
- Organize when you have perspective
- AI can help categorize when you're ready

### Local-First, User-Owned Data

**Why local-first**:

- **Privacy** - Your thoughts stay on your machine
- **Ownership** - You control your data forever
- **Portability** - Plain text files work with any tool
- **Reliability** - Works offline, no server dependency
- **Longevity** - No risk of service shutdown

**Contrast with cloud-first tools**:

- Cloud services can change terms, raise prices, shut down
- Your notes are hostage to the service
- Privacy concerns with sensitive thoughts
- Sync conflicts and reliability issues

**Flint's implementation**:

- Notes are markdown files on your file system
- SQLite database for indexing (local)
- AI calls go to providers, but notes stay local
- Export anytime; no lock-in

### Plain Text as Foundation

**Why plain text**:

- **Longevity** - Readable in 50 years
- **Simplicity** - No proprietary formats
- **Interoperability** - Works with any text tool
- **Version control** - Git-compatible
- **Searchability** - Standard tools work

**Trade-offs accepted**:

- No rich formatting (but markdown covers most needs)
- No embedded media (but links work)
- Less "pretty" than block-based tools

**Philosophy**:

- Optimize for long-term value, not short-term aesthetics
- Text is timeless; formats come and go
- Simplicity enables flexibility

### Opinionated, But Flexible

**Opinionated design**:

- Strong defaults for workflows (inbox, daily notes, workflows)
- Recommended patterns (note types, wikilinks, backlinks)
- Clear guidance on how to use the tool

**But still flexible**:

- Custom note types with your own schemas
- Custom functions for AI tools
- Custom workflows for your needs
- Multi-vault for different contexts

**Philosophy**:

- Opinionated tools are easier to learn
- Best practices should be built in
- But users should be able to override when needed
- Flexibility within structure

### Open Source, Sustainable Business

**Why open source**:

- **Transparency** - See how the tool works
- **Community** - Contributions and feedback
- **Trust** - No hidden behavior
- **Longevity** - Project can outlive company

**Why sustainable business**:

- Free software can disappear when maintainer burns out
- Business model aligned with users, not advertisers
- Professional development and support
- Long-term commitment

**Philosophy**:

- Open source + business model = best of both worlds
- Users are customers, not products
- Transparent pricing and roadmap
- No enshittification (users pay, so no ads or data selling)

## Design Principles

### Thinking-First Design

Every feature should enhance human cognition:

- Does it help you think more clearly?
- Does it reduce cognitive load?
- Does it surface insights you'd miss?
- Does it free time for deeper thinking?

**Anti-patterns**:

- Features that automate thinking
- Complexity that adds cognitive overhead
- Distractions from the thinking process

### Simplicity Bias

When in doubt, prefer simpler:

- Fewer features, done well
- Simple UI over complex
- Clear workflows over flexibility
- Easy to learn, powerful when mastered

**Trade-offs**:

- Sometimes sacrifice power for simplicity
- Resist feature creep
- Every feature has a maintenance cost

### Performance Matters

The tool should feel like an extension of your mind:

- Fast search (< 100ms)
- Instant note opening
- Smooth editor experience
- No lag or jank

**Why this matters**:

- Slow tools interrupt flow
- Friction reduces usage
- Speed enables exploration

### Data Integrity Above All

Never lose user data:

- Auto-save always
- Conflict detection and resolution
- Backups and versioning
- Migration tested thoroughly

**Philosophy**:

- Users trust you with their thoughts
- Data loss is catastrophic
- Better to be conservative than fast

### Keyboard-First, But Not Keyboard-Only

Power users love keyboards:

- Keyboard shortcuts for everything
- Slash commands for quick actions
- Global search with Ctrl+O

But also accessible:

- Mouse works for all operations
- Visual feedback and hints
- Discoverable features

### Progressive Disclosure

Start simple, reveal complexity as needed:

- Basic features obvious
- Advanced features available but hidden
- Help when you need it, invisible when you don't

**Examples**:

- Search starts simple, operators available
- Workflows have examples, but you can build custom
- AI chat available, but not in your face

## Use Cases

### Knowledge Workers

**Who**: Professionals who think for a living
**Needs**: Capture ideas, synthesize information, find connections
**Flint helps**: Inbox for capture, search for retrieval, AI for synthesis

### Researchers

**Who**: Academics, scientists, independent researchers
**Needs**: Literature notes, research synthesis, idea development
**Flint helps**: Note types for different sources, workflows for synthesis, backlinks for connections

### Writers

**Who**: Authors, journalists, bloggers
**Needs**: Idea capture, outline development, drafting
**Flint helps**: Inbox for ideas, wikilinks for structure, daily notes for progress

### Developers

**Who**: Software engineers, technical writers
**Needs**: Technical notes, documentation, learning journal
**Flint helps**: Code syntax in markdown, custom functions, project notes

### Lifelong Learners

**Who**: Anyone building knowledge over time
**Needs**: Personal wiki, learning journal, idea incubation
**Flint helps**: Wikilinks for connections, workflows for review, daily notes for reflection

## Philosophical Influences

### Zettelkasten Method

- Atomic notes (one idea per note)
- Wikilinks for connections
- Emergent structure over rigid hierarchy
- Thinking tool, not archive

### Getting Things Done (GTD)

- Inbox for capture
- Process and organize later
- Contexts (vaults) for different areas
- Review workflows

### Tools for Thought Movement

- Augmenting human intellect (Douglas Engelbart)
- Bicycle for the mind (Alan Kay)
- Personal knowledge graphs
- Computational text (Bret Victor)

### Local-First Software

- Offline-first architecture
- User ownership of data
- Peer-to-peer potential
- Sync without servers

## What Flint Is Not

### Not a Content Generator

- AI writes content for you → **Not Flint**
- AI helps you organize your thoughts → **Flint**

### Not a Team Tool (Yet)

- Real-time collaboration → **Not Flint**
- Individual thinking → **Flint**
- (Collaboration may come later, but individual-first)

### Not a Task Manager

- Project management with Gantt charts → **Not Flint**
- Task notes with metadata → **Flint**
- (Tasks are part of thinking, not project management)

### Not a Database

- Structured data tables → **Not Flint**
- Structured metadata on text notes → **Flint**

### Not Cloud-Based

- Sync across devices via cloud → **Not Flint** (yet)
- Local files on your machine → **Flint**
- (Sync may come, but local-first always)

### Not a Replacement for Deep Work

- Tool does thinking for you → **Not Flint**
- Tool supports your deep work → **Flint**

## Future Philosophy Considerations

### Collaboration vs. Individual Thinking

- How to add collaboration without losing individual focus?
- Shared vaults vs. personal thinking space
- Real-time editing vs. deliberate sharing

### Mobile vs. Desktop-First

- Mobile encourages quick capture but discourages deep thinking
- Desktop better for long-form writing
- How to support both without compromising either?

### AI Capability vs. Human Agency

- As AI gets smarter, how to prevent it from replacing thinking?
- Balance between helpful automation and maintaining agency
- Designing for human-in-the-loop always

### Monetization vs. Open Source

- How to make business sustainable without compromising values?
- What features are paid vs. free?
- How to keep community involved?

### Privacy vs. Sync

- Users want sync, but it risks privacy
- End-to-end encryption?
- Peer-to-peer sync?
- Optional cloud with strong guarantees?
