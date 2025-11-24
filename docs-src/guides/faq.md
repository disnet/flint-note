# Frequently Asked Questions

Common questions about Flint, answered concisely.

## General

### What is Flint?

**Flint is an open source, local-first note-taking app with integrated AI assistance.** Your notes are markdown files stored on your computer, and you can optionally use AI to help organize, search, and work with your notes.

### Is Flint free?

**Flint itself: Yes, free and open source.**

**AI features:** Requires API key from AI provider (OpenRouter, etc.)

- You pay the AI provider directly
- Typically $5-20/month depending on usage

### Where can I find the source code?

**GitHub:** [github.com/disnet/flint-note](https://github.com/disnet/flint-note)

- View all source code
- Report bugs and request features
- Contribute to development
- See what's being worked on

### What platforms does Flint support?

**Currently:**

- macOS 10.15+
- Windows 10+
- Linux

### Can I use Flint without AI?

**Yes!** Flint works great without AI:

- Full note editor
- Wikilinks and backlinks
- Search
- Organization
- Daily notes
- All local features

Features that require AI:

- AI agent chat conversations
- Agent powered reviews
- Agent note suggestions

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
└── .flint-notes/
    └── search.db
```

### Can I edit notes outside of Flint?

Yes, notes are standard markdown.

**Edit with:**

- Any text editor (VS Code, Sublime, Vim, etc.)
- Other markdown apps
- Mobile editors (if syncing)

**Flint will detect changes** and reload automatically.

## Sync and Backup

### How do I sync between devices?

**Use cloud storage provider like Dropbox, Google Drive etc:**

1. **Open your vault in a cloud folder:**

   ```
   ~/Dropbox/FlintVaults/MyVault/
   ```

2. **Add vault in Flint** on other devices

3. **Cloud service syncs automatically**

**Vault is just a folder** - sync like any folder.

### What about version control?

**Git works great:**

```bash
cd ~/Documents/MyVault
git init
git add .
git commit -m "Initial commit"
```

## Privacy and Security

### Is my data secure?

**Your data never leaves your computer** except:

- When you ask the AI agent to process it
- When you sync with cloud storage

**Flint doesn't:**

- Send data to our servers
- Track your usage
- Collect analytics
- Share your data

### Where are API keys stored?

**In your OS's secure keychain:**

- macOS: Keychain Access
- Windows: Credential Manager
- Linux: Secret Service

### Can the Flint developers see my notes?

**No.** Your notes are on your computer.

**We never see:**

- Your note content
- Your vault structure
- Your API keys
- Your AI conversations

### What does Flint collect?

**Nothing.**

**No telemetry, no analytics, no tracking.**

**We don't know:**

- How many notes you have
- What features you use
- How often you use Flint
- Anything about your usage

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

### Can I export my data?

**Your data is already exported!**

**Notes are markdown files** in vault folder:

- Copy folder anywhere
- Open in any text editor
- Import to other apps
- No export needed

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
   Copy .md files to vault/notes/
   Restart Flitn to rebuild database
   ```

### Does Flint support mobile?

**Not yet.**

**Currently:** Desktop only (macOS, Windows, Linux)

**Meanwhile:**

- Sync vault to cloud
- Edit with mobile markdown app
- Changes sync back to Flint
