# Privacy and Security

Understanding how Flint protects your data and what you need to know about privacy.

## Overview

**Flint's privacy principles:**

- **Local-first** - Your notes stay on your computer
- **You control AI usage** - Choose when to send data to AI
- **Transparent** - Clear about what goes where
- **Secure storage** - Industry-standard encryption
- **No tracking** - No analytics, no telemetry, no ads

## Where Your Data Lives

### Local Storage

**All notes stored locally:**

```
Your vault folder:
~/Documents/MyVault/
├── general/
│   └── my-note.md         ← Your markdown files
├── daily/
│   └── 2024-01-22.md      ← Daily notes
└── .flint/
    ├── database.db         ← Metadata and search index
    └── config.json         ← Vault settings
```

**On your computer:**

- Notes: Plain markdown files
- Database: SQLite (unencrypted)
- Settings: JSON files
- All readable, all yours

**Not in the cloud** (unless you sync - see below).

### Application Data

**Flint stores app data separately:**

**macOS:**

```
~/Library/Application Support/Flint/
├── settings/
│   └── app-settings.json    ← Theme, window position
└── vault-data/
    └── {vaultId}/
        ├── pinned-notes.json  ← Your pinned notes
        └── temporary-tabs.json ← Temporary tabs
```

**Windows:**

```
%APPDATA%\Flint\
├── settings\
└── vault-data\
```

**Linux:**

```
~/.config/Flint/
├── settings/
└── vault-data/
```

**This data:**

- Preferences and UI state
- Not synchronized automatically
- Reset on reinstall (unless backed up)

### API Keys

**Stored in OS keychain:**

**macOS:** Keychain Access

```
Application: Flint
Account: openrouter-api-key
Password: [Your API key]
```

**Windows:** Credential Manager

```
Generic Credentials → Flint → openrouter-api-key
```

**Linux:** Secret Service (libsecret)

```
Managed by keyring daemon
```

**Security:**

- Encrypted by your OS
- Protected by system security
- Requires system authentication
- Same security as browser passwords

## What Gets Sent to AI

### Conversation Context

**When you use AI agent:**

**Sent to AI provider:**

- Your messages in conversation
- Notes you explicitly reference
- Code you ask AI to analyze
- Search results AI retrieves

**Example:**

```
You: Summarize [[Project Overview]]

Sent to AI:
- Your message
- Content of "Project Overview" note
- Conversation history
```

**NOT sent:**

- Other notes in vault
- Notes from other vaults
- API keys
- Local file paths
- Application settings

### AI Provider

**Default: OpenRouter**

- Forwards to Claude, GPT, or other models
- Subject to their privacy policies
- Data encrypted in transit (HTTPS)

**Your responsibility:**

- Read AI provider's privacy policy
- Understand data retention
- Choose providers you trust

**Flint doesn't:**

- Store AI conversations permanently (session only)
- Send telemetry about AI usage
- Track which models you use

### What AI "Sees"

**In each conversation:**

```
✓ Current conversation messages
✓ Notes you mention by name
✓ Search results AI retrieves
✓ Current vault context (if you provide it)

❌ Other vaults
❌ Notes not mentioned
❌ Your API keys
❌ File system paths
❌ Other applications
```

**Isolation:**

- Each conversation is separate
- Each vault is separate
- AI doesn't "remember" between sessions

## Sensitive Information

### What NOT to Put in Notes

**Never store in notes:**

```
❌ Passwords or credentials
❌ Credit card numbers
❌ Social security numbers
❌ Private keys (SSH, GPG, etc.)
❌ Authentication tokens
```

**Why:**

- AI might see them if note is referenced
- Markdown files are plain text
- No encryption at rest
- Search indexes content

**Use instead:**

- Password manager (1Password, Bitwarden, etc.)
- Encrypted storage (for secrets)
- Environment variables (for development)

### Personal Information

**Be cautious with:**

- Full names and addresses
- Phone numbers and emails
- Health information
- Financial data
- Legal documents

**Risk assessment:**

```
Low risk: Notes about ideas, projects, learning
Medium risk: Meeting notes with names, general business
High risk: Personal health info, financial details
```

**For high-risk information:**

- Consider encrypted vault storage
- Use separate app designed for sensitive data
- Or encrypt individual notes

### Work Information

**Company/client data:**

- Check company policies
- Consider data classification
- Use work-provided tools for confidential data
- Keep client confidential data in separate vault

**Best practice:**

```
Work Vault: General work notes, non-confidential
Separate Tool: Confidential client data, regulated info
```

## Encryption

### At Rest

**Currently:**

- Notes stored as plain text markdown
- Database stored unencrypted (SQLite)
- Readable by anyone with file access

**Your options:**

**1. Full-disk encryption:**

```
macOS: FileVault
Windows: BitLocker
Linux: LUKS / dm-crypt
```

- Encrypts entire drive
- Transparent to applications
- Protects if computer stolen

**2. Folder encryption:**

```
macOS: Encrypted disk image
Windows: EFS (Encrypting File System)
Linux: eCryptfs
```

- Encrypt vault folder specifically
- Requires password to access
- More targeted protection

**Future:** Built-in vault encryption planned.

### In Transit

**API communication:**

- All AI requests use HTTPS
- TLS 1.2 or higher
- Encrypted end-to-end to AI provider

**Local communication:**

- No network traffic for local operations
- Database queries local only
- File operations local only

## Cloud Sync

### How Cloud Sync Works

**If you sync vault folder:**

**Example: Dropbox**

```
1. Move vault to Dropbox folder
2. Dropbox syncs to cloud
3. Access from multiple devices
```

**What gets synced:**

- All markdown files
- .flint/ database
- .note-types/ definitions

**Privacy implications:**

- Notes stored on cloud provider's servers
- Subject to their encryption/privacy
- Accessible to cloud provider (typically)

### Cloud Provider Security

**Choose wisely:**

**Dropbox:**

- AES-256 encryption
- TLS in transit
- Can use Dropbox encryption

**iCloud:**

- End-to-end encrypted (recent macOS/iOS)
- Apple's privacy policies
- Integrated with macOS

**Google Drive:**

- AES-256 encryption at rest
- TLS in transit
- Google's privacy policies

**Recommendation:**

- Use provider with end-to-end encryption
- Enable two-factor authentication
- Review sharing settings (keep private)

### Sync Conflicts

**When syncing:**

- Don't edit on multiple devices simultaneously
- Close Flint before syncing
- Let sync complete before opening on other device

**If conflict occurs:**

- Cloud provider creates conflict files
- Manually merge changes
- Or choose one version

**Database conflicts:**

- Can corrupt database
- Rebuild if issues: Settings → Database → Rebuild

## Multi-User Access

### Sharing Vaults

**Not recommended:**

- Flint not designed for multi-user
- Simultaneous edits cause conflicts
- Database can corrupt

**If you must share:**

- Take turns editing
- Use version control (Git)
- Coordinate who's editing when

**Better alternatives:**

- Export notes to share
- Use collaboration tools for team work
- Each person has own vault

### Collaborative Workflows

**Individual vaults + sharing:**

```
1. Each person has own Flint vault
2. Share notes via:
   - Email (export markdown)
   - Shared documents (copy content)
   - Version control (Git repository)
3. Import into personal vault
```

**Benefits:**

- No conflicts
- Personal organization
- Clear ownership

## API Key Security

### Protecting Your Keys

**Do:**

- ✓ Store only in Flint's secure storage
- ✓ Use different keys for different apps
- ✓ Rotate keys periodically (every 6-12 months)
- ✓ Monitor usage on provider website
- ✓ Delete old/unused keys

**Don't:**

- ❌ Share keys with others
- ❌ Commit to Git repositories
- ❌ Store in plain text files
- ❌ Post in screenshots/videos
- ❌ Email to yourself

### Key Rotation

**When to rotate:**

- Every 6-12 months (proactive)
- If possibly compromised
- When leaving project/team
- After security incident

**How to rotate:**

```
1. Generate new key on provider website
2. Update in Flint: Settings → API Keys
3. Test with AI agent
4. Delete old key on provider website
```

### If Key Compromised

**Immediate actions:**

```
1. Revoke key on provider website (NOW)
2. Generate new key
3. Update in Flint
4. Check billing for unauthorized usage
5. Review recent activity
```

**Prevention:**

- Don't share screen with API keys visible
- Don't save API keys in notes
- Use different keys for testing/production

## Data Portability

### Exporting Your Data

**Everything is portable:**

**Notes:**

```
Your vault folder contains:
- .md files (standard markdown)
- Readable in any text editor
- Import to other apps
- No proprietary format
```

**To export:**

1. Copy vault folder
2. Zip if needed
3. Use anywhere

**Import to other apps:**

- Obsidian (compatible)
- Notion (import markdown)
- Any markdown editor
- Plain text editors

### Backing Up

**What to back up:**

**Essential:**

```
✓ Vault folder (all your notes)
✓ .flint/ directory (database, config)
✓ .note-types/ directory (custom types)
```

**Optional:**

```
✓ Application settings (UI preferences)
✓ Pinned notes / tabs (UI state)
```

**Backup strategy:**

```
Daily: Automatic cloud sync (Dropbox/iCloud)
Weekly: Local backup to external drive
Monthly: Archive backup (versioned)
```

**Recovery:**

- Restore vault folder
- Flint rebuilds database if needed
- All notes intact

## Privacy Settings

### Current Settings

**Minimal settings currently:**

- Theme (light/dark/auto)
- API keys
- No telemetry toggles (none exists)
- No analytics toggles (none exists)

**What Flint doesn't collect:**

- Usage statistics
- Crash reports (without permission)
- Feature usage
- Note content
- Search queries
- AI conversation topics

### Future Privacy Controls

**Planned:**

- Per-vault AI access controls
- Encrypted vault option
- Audit log of AI access
- Data export tools
- Privacy dashboard

## Third-Party Integrations

### AI Providers

**Current: OpenRouter**

- Acts as gateway to multiple models
- Privacy policy: openrouter.ai/privacy
- Data handling: Per their terms

**Future: Direct providers**

- Anthropic (Claude)
- OpenAI (GPT)
- Each has own privacy policy

**Your responsibility:**

- Review provider privacy policies
- Understand data retention
- Choose providers aligned with your needs

### MCP Servers

**Model Context Protocol:**

- Optional extensions
- Third-party tools
- Each has own privacy implications

**Before installing:**

- Review what tool accesses
- Understand data flow
- Only install from trusted sources
- Research the tool's reputation

## Compliance

### GDPR Considerations

**If you're in EU:**

- Your notes are personal data
- You control your data (it's on your computer)
- Right to erasure: Delete vault folder
- Data portability: Standard markdown format

**AI providers:**

- May process data in US or elsewhere
- Subject to GDPR if serving EU
- Check provider's GDPR compliance

### HIPAA Considerations

**Flint is NOT HIPAA compliant:**

- Don't store patient health information
- Use HIPAA-compliant tools for healthcare
- Flint is for general note-taking only

### Other Regulations

**Generally:**

- Flint stores data locally (low risk)
- AI transmission may cross jurisdictions
- You're responsible for compliance
- Use appropriate tools for regulated data

## Security Best Practices

### System Security

**Protect your computer:**

```
✓ Use strong login password
✓ Enable full-disk encryption
✓ Keep OS updated
✓ Use antivirus (Windows)
✓ Lock screen when away
✓ Enable firewall
```

**Flint security depends on system security.**

### Network Security

**On public WiFi:**

- HTTPS protects AI requests
- Local operations unaffected
- Consider VPN for extra security

**On corporate networks:**

- Traffic may be monitored
- Check company policies
- Consider using personal device

### Physical Security

**If laptop stolen:**

**With disk encryption:**

- ✓ Data encrypted
- ✓ Vault protected
- ✓ API keys protected

**Without disk encryption:**

- ❌ Data readable
- ❌ Vault accessible
- ❌ API keys may be accessible

**Enable disk encryption today.**

## Reporting Security Issues

**If you find a security vulnerability:**

**Do:**

1. Email: security@flint.example (hypothetical - use real contact)
2. Include: Description, steps to reproduce, impact
3. Allow: Time to fix before public disclosure

**Don't:**

- Post publicly before fix
- Exploit vulnerability
- Access others' data

**Responsible disclosure benefits everyone.**

## Privacy FAQ

**Q: Does Flint phone home?**
A: No. No telemetry, no analytics, no tracking.

**Q: Can you see my notes?**
A: No. They're on your computer. We never see them.

**Q: What does the AI see?**
A: Only what you explicitly send to it in conversations.

**Q: Are my notes encrypted?**
A: Not by default. Use OS disk encryption for protection.

**Q: Can I use Flint offline?**
A: Yes, for all features except AI agent.

**Q: Where are API keys stored?**
A: In your OS's secure keychain, encrypted.

**Q: Can I export my data?**
A: Yes, it's all standard markdown in your vault folder.

**Q: Is my data sold or shared?**
A: No. It never leaves your computer except AI requests.

## Next Steps

- **[Best Practices](/guides/best-practices)** - Use Flint securely

---

**Bottom line:** Your data is yours. It stays on your computer. We believe in local-first, privacy-respecting software. When in doubt, your notes never leave your computer unless you explicitly ask the AI to process them.
