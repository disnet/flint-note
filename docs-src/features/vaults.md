# Multi-Vault Workspaces

Organize your notes into separate, isolated workspaces with Flint's multi-vault system.

## What is a Vault?

A **vault** is a completely isolated collection of notes stored in a folder on your computer.

**Each vault has:**
- Its own **folder** on your file system
- Separate **database** for metadata and search
- Independent **note types**
- Separate **AI conversation history**
- Own **settings and preferences**
- Isolated **pinned notes and tabs**

**Think of vaults as:**
- Different notebooks
- Separate workspaces
- Isolated contexts
- Independent projects

## Why Use Multiple Vaults?

### Separation of Contexts

**Work vs Personal:**
```
Work Vault:
├── Meeting notes
├── Project documentation
├── Client information
├── Team discussions
└── Work-related research

Personal Vault:
├── Journal entries
├── Personal goals
├── Book notes
├── Recipe collection
└── Travel planning
```

**Benefits:**
- Keep work and personal separate
- Different AI conversations for each context
- Search doesn't mix contexts
- Privacy and organization

### Project-Based Organization

**Different projects:**
```
Startup Vault:
├── Business plans
├── Product ideas
├── Customer research
└── Investor materials

Research Vault:
├── Academic papers
├── Literature notes
├── Experiment logs
└── Research findings

Writing Vault:
├── Book chapters
├── Article drafts
├── Character notes
└── Plot outlines
```

### Privacy Levels

**Public vs Private:**
```
Public Vault:
├── Blog drafts
├── Open-source docs
├── Public notes
└── Shareable content

Private Vault:
├── Personal reflections
├── Financial planning
├── Sensitive information
└── Private thoughts
```

### Learning and Knowledge Domains

**Subject-based:**
```
Programming Vault:
├── Code snippets
├── Technical notes
├── Learning resources
└── Project ideas

Design Vault:
├── Design principles
├── UI patterns
├── Inspiration
└── Case studies

Business Vault:
├── Marketing notes
├── Strategy docs
├── Competitor analysis
└── Business books
```

## Creating Vaults

### Via UI

**First time:**
1. Launch Flint
2. First-Time Experience guides you
3. Choose location for your vault
4. Name it appropriately
5. Vault is initialized

**Additional vaults:**
1. Click **vault selector** (top-left)
2. Click **"Create New Vault"**
3. Choose a **folder location**
4. Enter **vault name**
5. Click **"Create"**

**What happens:**
- Folder created at chosen location
- Database initialized
- Default note types created
- Welcome note generated
- Vault appears in selector

### Via AI

```
You: Create a new vault called "Research" in my Documents folder

AI: I'll create a new vault for you.

    [Creates vault]

    ✓ Created vault "Research"
    Location: ~/Documents/Research
    Status: Initialized with default note types

    Switch to this vault now?
```

### Folder Structure

A vault folder contains:

```
MyVault/
├── .flint/
│   ├── database.db          # SQLite database
│   ├── config.json          # Vault settings
│   └── cache/               # Cache files
├── .note-types/
│   ├── general/
│   │   └── general.md
│   ├── daily/
│   │   └── daily.md
│   └── meeting/
│       └── meeting.md
├── general/
│   ├── note1.md
│   └── note2.md
├── daily/
│   └── 2024-01-15.md
└── meetings/
    └── team-standup.md
```

**Important:**
- `.flint/` contains Flint-specific data
- All other files are standard markdown
- You can edit notes with any text editor
- Vault is self-contained and portable

## Switching Between Vaults

### Vault Selector

**Click vault name** (top-left corner):
- Shows list of all vaults
- Current vault highlighted
- Click another vault to switch

**What happens on switch:**
- Current vault state saved
- New vault loaded
- Different notes appear
- Different AI conversation
- Different pinned notes

**Quick switch:**
- All vaults listed alphabetically
- Recently used vaults at top
- One-click switching

### Keyboard Shortcuts

Future feature - keyboard shortcuts for vault switching:
```
Ctrl+Shift+V  - Open vault selector
Ctrl+1-9      - Switch to vault 1-9
```

### Via AI

```
You: Switch to my Work vault

AI: [Switches vault]

    Switched to "Work" vault
    - 247 notes
    - Last opened: 2 hours ago
    - 3 notes in inbox
```

## Vault Management

### Listing Vaults

**Via vault selector:**
- Click vault name
- See all vaults

**Via AI:**
```
You: What vaults do I have?

AI: You have 4 vaults:

    1. Personal Notes (current)
       - 342 notes
       - Location: ~/Documents/Personal
       - Created: Dec 2023

    2. Work
       - 247 notes
       - Location: ~/Documents/Work
       - Created: Jan 2024

    3. Research
       - 89 notes
       - Location: ~/Documents/Research
       - Created: Jan 2024

    4. Archive
       - 1,234 notes
       - Location: ~/Documents/Archive
       - Created: Nov 2023
```

### Vault Information

**View vault details:**
```
You: Tell me about my current vault

AI: Current vault: Personal Notes

    Statistics:
    - Total notes: 342
    - Note types: 8 (7 default + 1 custom)
    - Most used type: general (156 notes)
    - Vault size: 2.3 MB
    - Location: ~/Documents/Personal

    Recent activity:
    - Last note: 5 minutes ago
    - Notes today: 3
    - Notes this week: 18
```

### Renaming Vaults

**Via vault selector:**
1. Click vault name
2. Right-click vault to rename
3. Enter new name
4. Press Enter

**Via file system:**
- Renaming the folder works too
- Flint detects the new location
- Vault registry updates

### Removing Vaults

**Important:** Removing from Flint doesn't delete files.

**Via vault selector:**
1. Click vault name
2. Right-click vault
3. Select "Remove from Flint"
4. Confirm

**What happens:**
- Vault removed from registry
- Files remain on disk (not deleted!)
- Can re-add later if needed

**To permanently delete:**
1. Remove from Flint
2. Delete the folder manually

## Vault Isolation

### What's Isolated

**Each vault has separate:**

**Notes and Database:**
- Completely different note collections
- Separate search indexes
- Independent metadata

**AI Conversations:**
- Different conversation history
- No cross-vault context
- Separate cost tracking

**Settings:**
- Can use different AI models per vault
- Different UI preferences
- Independent note types

**UI State:**
- Different pinned notes
- Separate temporary tabs
- Independent navigation history

**Examples:**

Work vault:
- Pinned: "Current Sprint", "Team Directory"
- AI: GPT-4 for coding help
- Daily notes enabled

Personal vault:
- Pinned: "Today's Journal", "Goals"
- AI: Claude for writing
- Daily notes enabled with different template

### What's Shared

**Global settings:**
- API keys (stored in OS keychain)
- Application theme
- Update preferences

**Application state:**
- Window size/position
- Sidebar visibility

## Use Cases and Workflows

### Personal Knowledge Management

**Single vault approach:**
```
Everything Vault:
├── Areas of life (work, health, learning, etc.)
├── Projects (current active projects)
├── Resources (reference materials)
└── Archive (completed items)
```

**Multi-vault approach:**
```
Work Vault (professional knowledge)
Personal Vault (life management)
Learning Vault (courses, books, skills)
Archive Vault (old projects)
```

Choose based on preference for separation.

### Client Work

**One vault per client:**
```
Client-Acme/
├── Meeting notes
├── Project documentation
├── Deliverables
└── Communications

Client-BetaCorp/
├── Meeting notes
├── Project documentation
├── Deliverables
└── Communications
```

**Benefits:**
- Complete isolation
- Easy to archive when project ends
- Simple backup/sharing
- Client-specific AI context

### Research Projects

**One vault per research topic:**
```
ML-Research/
├── Papers
├── Experiments
├── Notes
└── Ideas

Web3-Research/
├── Papers
├── Protocols
├── Notes
└── Ideas
```

**Transition to main vault:**
- When research complete
- Export key findings
- Create summary in main vault
- Archive research vault

### Writing Projects

**One vault per book/project:**
```
Novel-Draft/
├── Characters
├── Plot
├── Chapters
├── Research
└── Notes

Nonfiction-Book/
├── Outline
├── Chapters
├── Research
├── Interviews
└── Notes
```

**Benefits:**
- Focused context
- Project-specific notes
- Easy to share with editors/collaborators
- Portable to different computers

## Backup and Sync

### Backup Strategy

**Each vault is a folder:**
- Copy the entire folder to backup
- Use any backup software
- Cloud sync works (with caveats)

**Recommended approach:**

1. **Local backup:**
   ```bash
   cp -r ~/Documents/MyVault ~/Backups/MyVault-2024-01-15
   ```

2. **Cloud backup:**
   - Use Dropbox, Google Drive, iCloud
   - Automatically syncs the vault folder

3. **Version control:**
   ```bash
   cd ~/Documents/MyVault
   git init
   git add .
   git commit -m "Backup"
   ```

### Syncing Across Devices

**Cloud storage sync:**

1. **Move vault to cloud folder:**
   ```
   ~/Dropbox/FlintVaults/PersonalNotes/
   ```

2. **Add vault in Flint** on each device

3. **Cloud service handles sync**

**Caveats:**
- **Don't open vault on multiple devices simultaneously**
- Database conflicts can occur
- Close Flint before switching devices

**Alternative - Manual sync:**
- Work on device A
- Close Flint
- Cloud syncs
- Open on device B
- Cloud syncs back

**Future:** Real-time sync support planned.

### Exporting Vaults

**Vault as portable archive:**

1. Vault is just a folder
2. Zip the entire folder
3. Share or archive the zip
4. Recipient can add to their Flint

**Example:**
```bash
cd ~/Documents
zip -r MyVault-Archive.zip MyVault/
```

**Importing:**
1. Unzip to desired location
2. Add vault in Flint
3. All notes, metadata, types preserved

## Vault Settings

### Per-Vault Configuration

**Settings stored in vault:**
- `.flint/config.json`

**Configurable per vault:**
- Default note type
- Daily note template
- Review settings
- Custom note types

**Example config:**
```json
{
  "defaultNoteType": "general",
  "dailyNoteEnabled": true,
  "reviewEnabled": true,
  "aiModel": "claude-3-opus"
}
```

### AI Model Per Vault

**Use different models:**

Work vault → GPT-4 (coding/technical)
Personal vault → Claude (writing)
Research vault → Opus (deep reasoning)

**Set per vault:**
1. Switch to vault
2. Open AI agent
3. Select model from dropdown
4. Preference saved for this vault

## Best Practices

### When to Create a New Vault

**Good reasons:**
- Fundamentally different context (work/personal)
- Client projects (one vault per client)
- Major research projects
- Privacy isolation needed

**Don't overdo it:**
- Too many vaults = fragmentation
- Harder to find information
- Connections across vaults lost

**General guidance:**
- **1-3 vaults:** Most people
- **5-10 vaults:** Power users with distinct contexts
- **10+ vaults:** Usually too many

### Vault Naming

**Descriptive names:**
```
✓ Personal Notes
✓ Work - Acme Corp
✓ ML Research Project
✓ Book: My Novel Title

❌ Vault1
❌ Notes
❌ Stuff
```

### Archive Old Vaults

**When project complete:**
1. Export important findings to main vault
2. Create archive vault or folder
3. Remove from active vaults
4. Keep folder as backup

**Example:**
```
~/Documents/FlintVaults/
├── Active/
│   ├── Personal/
│   └── Work/
└── Archive/
    ├── Client-OldProject/
    └── Research-2023/
```

### Regular Maintenance

**Periodically review:**
- Which vaults are actively used?
- Can any be archived?
- Are backups current?
- Is organization still working?

## Troubleshooting

### Vault Not Appearing

**Problem:** Vault disappeared from selector.

**Solutions:**
1. **Check if folder moved:**
   - Locate the folder manually
   - Re-add to Flint

2. **Re-add vault:**
   - Click vault selector
   - "Add Existing Vault"
   - Browse to folder

3. **Check vault registry:**
   - Settings → Vaults
   - See all registered vaults

### Database Corruption

**Problem:** Vault database corrupted.

**Solutions:**
1. **Rebuild database:**
   - Settings → Database → Rebuild
   - Flint re-indexes from markdown files

2. **Backup and recreate:**
   - Copy vault folder (backup)
   - Delete `.flint/database.db`
   - Flint recreates on next open

### Sync Conflicts

**Problem:** Edited same note on two devices.

**Solutions:**
1. **Don't sync simultaneously:**
   - Close Flint on device A
   - Wait for cloud sync
   - Open on device B

2. **If conflict occurs:**
   - Cloud service creates conflict files
   - Manually merge changes
   - Or choose one version

3. **Use external edit detection:**
   - Flint detects external changes
   - Prompts to resolve conflicts

## Advanced Vault Workflows

### Vault Chaining

**Main vault + Satellite vaults:**

```
Main Vault (permanent knowledge)
  ↑
  └─ Pulls from:
     ├─ Work Vault (current work)
     ├─ Research Vault (ongoing research)
     └─ Temporary Vault (scratch)
```

**Workflow:**
1. Work in satellite vaults
2. Periodically export key notes to main vault
3. Archive satellite vaults when done

### Inbox Vault

**Dedicated capture vault:**

```
Inbox Vault:
- Quick capture on mobile/anywhere
- All notes as inbox type
- Process periodically
- Move to appropriate main vault
```

**Benefits:**
- Frictionless capture
- No thinking about organization
- Batch processing later

### Template Vaults

**Create template vaults:**

```
Project-Template/
├── .note-types/ (custom types)
├── Templates/
│   ├── README.md
│   ├── Project Overview template
│   └── Meeting template
└── Structure/ (empty folders)
```

**For new projects:**
1. Copy template vault
2. Rename
3. Start with structure in place

## Next Steps

- **[Daily Notes](/features/daily-notes)** - Use daily notes in each vault
- **[Note Management](/features/notes)** - Organize within vaults
- **[AI Agent](/features/agent)** - Vault-specific AI conversations
- **[Settings](/guides/configuration)** - Configure vault settings

---

**Remember:** Vaults are for major separations of context. Most people need only 2-3 vaults. Don't over-organize—let your note-taking flow naturally within each workspace.
