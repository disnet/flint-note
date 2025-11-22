# Frequently Asked Questions

Common questions about Flint, answered concisely.

## General

### What is Flint?

**Flint is a local-first note-taking app with integrated AI assistance.** Your notes are markdown files stored on your computer, and you can optionally use AI to help organize, search, and work with your notes.

### How is Flint different from Obsidian/Notion/Roam?

**Key differences:**

- **Built-in AI** - Native AI agent, not a plugin
- **Local-first** - Your data stays on your computer
- **Simple** - Focused feature set, not overwhelming
- **Plain markdown** - Standard format, no lock-in
- **No subscription** - Free to download (AI provider costs separate)

**Similar to:**

- **Obsidian** - Local markdown, linking
- **Different** - Built-in AI, simpler feature set

### Is Flint free?

**Flint itself: Yes, free to download and use.**

**AI features:** Requires API key from AI provider (OpenRouter, etc.)

- You pay the AI provider directly
- Typically $5-20/month depending on usage
- No subscription to Flint

### What platforms does Flint support?

**Currently:**

- macOS 10.15+
- Windows 10+
- Linux (AppImage)

**Future:** iOS/Android planned

## Installation and Setup

### How do I install Flint?

**Download installer from website:**

1. Visit flint.ai (hypothetical)
2. Download for your platform
3. Run installer
4. Launch Flint

**First-time setup:**

1. Create or open vault
2. Add API key (Settings → API Keys)
3. Start taking notes

### Do I need an API key?

**For AI features: Yes.**

**Without API key:**

- ✓ Create and edit notes
- ✓ Search notes
- ✓ Link notes
- ✓ Organize notes
- ❌ AI agent

**Get API key from:**

- OpenRouter (recommended)
- Direct providers (future)

### How do I get an API key?

**OpenRouter (recommended):**

1. Visit [openrouter.ai](https://openrouter.ai)
2. Create account
3. Add payment method
4. Generate API key
5. Copy key
6. Paste in Flint: Settings → API Keys

**Cost:** Pay-as-you-go, typically $5-20/month

### Can I use Flint without AI?

**Yes!** Flint works great without AI:

- Full note editor
- Wikilinks and backlinks
- Search
- Organization
- Daily notes
- All local features

**AI is optional, not required.**

## Notes and Organization

### Where are my notes stored?

**In a folder on your computer:**

**Example:**

```
~/Documents/MyVault/
├── general/
│   └── my-note.md
├── daily/
│   └── 2024-01-22.md
└── .flint/
    └── database.db
```

**Plain text markdown files** - readable in any editor.

### Can I edit notes outside of Flint?

**Yes!** Notes are standard markdown.

**Edit with:**

- Any text editor (VS Code, Sublime, Vim, etc.)
- Other markdown apps
- Mobile editors (if syncing)

**Flint will detect changes** and reload automatically.

### What is a vault?

**A vault is a folder containing your notes.**

**One vault = one folder:**

- All your notes inside
- Database for indexing
- Configuration files
- Self-contained workspace

**Multiple vaults** for separation:

- Work vs Personal
- Different projects
- Shared vs Private

### How many notes can I have?

**Practically unlimited.**

**Performance:**

- 1,000 notes: Excellent
- 5,000 notes: Good
- 10,000 notes: Acceptable
- 20,000+ notes: May slow down, consider splitting

**Most users: < 5,000 notes.**

### Can I import from Obsidian/Notion/etc?

**From Obsidian:**

- ✓ Direct import (both use markdown)
- ✓ Wikilinks compatible
- ✓ Open Obsidian vault as Flint vault

**From Notion:**

- Export as markdown
- Import files to Flint vault
- May need link cleanup

**From other apps:**

- Export to markdown
- Copy files to Flint vault
- Rebuild database

## Wikilinks and Connections

### How do wikilinks work?

**Type `[[` to start a wikilink:**

```markdown
I'm working on [[Project Alpha]]
```

**Creates link to "Project Alpha" note.**

**Click to navigate.**

**See backlinks** in right sidebar.

### What if a linked note doesn't exist?

**Wikilink appears red/orange** (broken link).

**Click to create note:**

- Opens new note with that title
- Link updates automatically
- Now working link

**Encourages** bottom-up note creation.

### Can I link to headings?

**Not yet** - planned feature.

**Current:** Link to whole notes only.

**Workaround:** Create separate notes for major sections.

### How do backlinks work?

**Automatic:**

- Note A links to Note B: `[[Note B]]`
- Note B shows backlink from Note A
- See in right sidebar

**Benefits:**

- Discover unexpected connections
- See who references this note
- Build knowledge graph

## Search

### How do I search?

**Quick search:**

- Press `Cmd/Ctrl+O`
- Type search term
- Select result, press Enter

**In-note search:**

- `Cmd/Ctrl+F` in editor
- Searches current note only

### What can I search for?

**Everything:**

- Note titles
- Note content
- Tags
- Metadata fields

**Operators:**

```
type:daily          - Filter by note type
tag:important       - Filter by tag
created:today       - By creation date
modified:this-week  - By modified date
```

**Combine operators:**

```
type:daily created:this-week
```

### How do I search by date?

**Relative dates:**

```
created:today
created:yesterday
created:this-week
created:this-month
```

**Absolute dates:**

```
created:2024-01-15
modified:2024-01
```

**Ranges:**

```
created:2024-01-01..2024-01-31
```

## AI Agent

### What can the AI do?

**AI can:**

- Answer questions about your notes
- Summarize content
- Create new notes
- Organize information
- Search and analyze
- Generate content
- Execute workflows
- Much more

**AI has full access** to Flint's tools.

### What AI models are available?

**Two models available:**

- **Normal** (Claude Haiku 4.5) - Fast and economical, great for most tasks
- **Plus Ultra** (Claude Sonnet 4.5) - Enhanced reasoning, but slower and more expensive

**Choose model** in conversation.

**Different models:**

- Different capabilities
- Different costs
- Different speeds

**Recommend:** Claude Sonnet for most tasks.

### How much does AI cost?

**Pay-as-you-go** through provider:

**Typical costs:**

- Light usage: $5-10/month
- Medium usage: $10-20/month
- Heavy usage: $20-50/month

**Depends on:**

- Model used (some more expensive)
- Conversation length
- Frequency of use

**Monitor usage** on provider website.

### Can AI see all my notes?

**No.** AI only sees:

- Current conversation
- Notes you explicitly reference
- Search results AI retrieves

**AI doesn't see:**

- Other vaults
- Notes not mentioned
- Your API keys
- File system

**You control** what AI accesses.

### Can I use AI offline?

**No.** AI requires internet connection.

**Other features** work offline:

- Note editing
- Search
- Organization
- Everything except AI

## Daily Notes

### What are daily notes?

**One note per day** for journaling and logging.

**Automatically created** with date-based structure:

- Morning section
- Afternoon section
- Evening section
- Notes section

**Access:** Click "Daily" or `Cmd/Ctrl+D`

### Do I have to use daily notes?

**No.** Completely optional.

**Many users find them useful** for:

- Daily journaling
- Capturing thoughts throughout day
- Meeting notes
- Weekly review

**Try it** - see if it fits your workflow.

### Can I customize the daily note template?

**Yes.**

**Edit template:**

1. Navigate to `.note-types/daily/daily.md`
2. Modify template section
3. New daily notes use updated template

**Customize:**

- Sections
- Frontmatter fields
- Structure
- Prompts

## Workflows and Automation

### What are workflows?

**Persistent task definitions** AI can execute.

**Examples:**

- Daily standup note generation
- Weekly review process
- Monthly report compilation
- Recurring analysis tasks

**Schedule** or run on-demand.

### How do I create a workflow?

**Ask the AI:**

```
You: Create a daily standup workflow that runs
     every weekday at 9am

AI: [Creates workflow]
    ✓ Created workflow "Daily Standup"
```

**AI writes** workflow definition for you.

### Can workflows run automatically?

**Yes**, on schedule:

- Daily at specific time
- Weekly on specific day
- Monthly on specific date

**Or on-demand:**

- Ask AI to run workflow
- Manual execution

### What's the difference between workflows and custom functions?

**Workflows:**

- High-level procedures
- AI-executed
- Multiple steps
- Human-readable descriptions
- Example: "Create weekly review"

**Custom Functions:**

- Low-level operations
- Code-based (TypeScript)
- Reusable utilities
- Example: "calculateReadingTime()"

**Use together** for powerful automation.

## Sync and Backup

### How do I sync between devices?

**Use cloud storage:**

1. **Move vault to cloud folder:**

   ```
   ~/Dropbox/FlintVaults/MyVault/
   ```

2. **Add vault in Flint** on other devices

3. **Cloud service syncs automatically**

**Important:**

- Don't edit simultaneously on multiple devices
- Close Flint before switching devices
- Let sync complete

### Can I use iCloud/Dropbox/Google Drive?

**Yes**, any cloud storage works:

- iCloud Drive
- Dropbox
- Google Drive
- OneDrive
- Syncthing
- Any file sync service

**Vault is just a folder** - sync like any folder.

### How do I backup my notes?

**Automatic backups:**

1. **Cloud sync** - Continuous
2. **Time Machine** (macOS) - Hourly
3. **File History** (Windows) - Regular

**Manual backups:**

1. Copy vault folder
2. Store elsewhere
3. Regular schedule (weekly/monthly)

**Vault is portable** - copy folder = full backup.

### What about version control?

**Git works great:**

```bash
cd ~/Documents/MyVault
git init
git add .
git commit -m "Initial commit"
```

**Benefits:**

- Full history
- Revert changes
- Branch for experiments
- Remote backups

**For developers** - highly recommended.

## Privacy and Security

### Is my data secure?

**Your data never leaves your computer** except:

- When you ask AI to process it
- When you sync with cloud storage

**Flint doesn't:**

- Send data to our servers (we don't have servers)
- Track your usage
- Collect analytics
- Share your data

**Your vault** = your data = your control.

### Where are API keys stored?

**In your OS's secure keychain:**

- macOS: Keychain Access
- Windows: Credential Manager
- Linux: Secret Service

**Encrypted by your OS**, same security as browser passwords.

**Not in plain text**, not in vault folder.

### Can the developers see my notes?

**No.** Your notes are on your computer.

**We never see:**

- Your note content
- Your vault structure
- Your API keys
- Your AI conversations

**Local-first** means truly private.

### What does Flint collect?

**Nothing.**

**No telemetry, no analytics, no tracking.**

**We don't know:**

- How many notes you have
- What features you use
- How often you use Flint
- Anything about your usage

**Privacy-first** design.

## Technical

### What format are notes?

**Standard markdown (.md files).**

**With YAML frontmatter:**

```markdown
---
title: Note Title
type: general
created: 2024-01-22
---

# Note Title

Content here...
```

**Future-proof** - readable anywhere.

### Can I export my data?

**Your data is already exported!**

**Notes are markdown files** in vault folder:

- Copy folder anywhere
- Open in any text editor
- Import to other apps
- No export needed

**Truly portable.**

### What database does Flint use?

**SQLite** for metadata and search index.

**Database contains:**

- Note metadata (titles, dates, types)
- Search index (FTS5)
- Backlinks
- Tags

**Database doesn't contain:**

- Note content (that's in .md files)
- Anything you can't regenerate

**Rebuildable** from markdown files anytime.

### Can I use Flint with existing markdown files?

**Yes!**

**Two options:**

1. **Open folder as vault:**

   ```
   Flint → Open Existing Vault → Select folder
   Flint indexes existing .md files
   ```

2. **Copy files into vault:**
   ```
   Copy .md files to vault/general/
   Rebuild database
   ```

**Flint works** with any markdown files.

### Does Flint support mobile?

**Not yet.**

**Currently:** Desktop only (macOS, Windows, Linux)

**Planned:** iOS and Android apps

**Meanwhile:**

- Sync vault to cloud
- Edit with mobile markdown app
- Changes sync back to Flint

## Comparisons

### Flint vs Obsidian?

**Similar:**

- Local markdown notes
- Wikilinks and backlinks
- Plugin ecosystem (Obsidian has more)

**Flint advantages:**

- Built-in AI (not plugin)
- Simpler, more focused

**Obsidian advantages:**

- More mature
- Larger plugin ecosystem
- Mobile apps available

**Choose Flint if:** You want integrated AI and simpler experience.

### Flint vs Notion?

**Very different:**

**Notion:**

- Cloud-based
- Proprietary format
- Team collaboration
- Databases and views
- Subscription required

**Flint:**

- Local-first
- Markdown files
- Personal knowledge management
- AI agent
- Free (except AI)

**Choose Flint if:** You want local control and markdown.

### Flint vs Logseq/Roam?

**Different approaches:**

**Logseq/Roam:**

- Outliner-based
- Block references
- Daily notes centered
- Bi-directional linking

**Flint:**

- Document-based
- Note references
- AI assistance
- Flexible structure

**Choose Flint if:** You prefer documents over outlines and want AI.

## Troubleshooting

### Flint won't start - what do I do?

**Try in order:**

1. **Restart computer**
2. **Reinstall Flint**
3. **Check system requirements**
4. **Check logs** (see Troubleshooting guide)

**Most issues** resolve with reinstall.

### Search isn't finding my notes - help?

**Quick fix:**

```
Settings → Database → Rebuild Database
```

**Rebuilds search index** from markdown files.

**Fixes** most search issues.

### AI isn't working - what's wrong?

**Checklist:**

1. ✓ API key entered? (Settings → API Keys)
2. ✓ Green checkmark on API key?
3. ✓ Internet connected?
4. ✓ Provider website accessible?
5. ✓ Account has credits?

**If all yes** and still broken:

- Try new conversation
- Restart Flint
- Check provider status page

### How do I report a bug?

**When reporting issues, include:**

- Flint version (Help → About)
- Operating system
   - Steps to reproduce
   - Error messages
   - Screenshots

**Better info** = faster fix.

## Getting Started

### I'm new - where do I start?

**Recommended path:**

1. **Install Flint** and create vault
2. **Add API key** (Settings → API Keys)
3. **Create first note** - just write something
4. **Try wikilinks** - link to another note with `[[Note Title]]`
5. **Ask AI** a question about your note
6. **Explore daily notes** - try journaling for a week
7. **Gradually add** other features as needed

**Don't try** to learn everything at once.

### What's the best way to organize notes?

**Start simple:**

- Just create notes
- Link related notes
- Let structure emerge

**Don't pre-organize:**

- No elaborate folder systems
- No complex tagging schemes
- No rigid templates

**Trust:**

- Search is powerful
- Wikilinks create structure
- AI helps organize

**See:** [Best Practices](/guides/best-practices) for detailed guidance.

### How do I get the most out of Flint?

**Three practices:**

1. **Daily notes** - Journal consistently
2. **Link liberally** - Connect ideas with wikilinks
3. **AI collaboration** - Ask AI to help organize

**Consistency** matters more than perfection.

**Start small**, build gradually.

## Community and Support

### Where can I get help?

**Resources:**

- **Documentation** - Check the full docs
- **FAQ** - Common questions answered
- **Troubleshooting Guide** - Solve common issues

### What's planned for future releases?

**Planned features:**

- Mobile apps (iOS/Android)
- Plugin system
- More AI providers
- Advanced search
- Collaboration features

**Development priorities** are driven by user feedback.

## Next Steps

- **[Getting Started](/getting-started)** - Begin your journey
- **[Core Concepts](/guides/core-concepts)** - Understand Flint's philosophy
- **[Best Practices](/guides/best-practices)** - Learn effective workflows
- **[Troubleshooting](/guides/troubleshooting)** - Solve common issues

---

**Still have questions?** Check the full documentation and troubleshooting guide for more help.
