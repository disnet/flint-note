# Settings and Configuration

Configure Flint to match your preferences and workflow.

## Accessing Settings

**Click the Settings icon:**

- Located in the top-right corner of Flint
- Gear/cog icon
- Opens settings panel

**Keyboard shortcut:**

- `Ctrl+,` (Windows/Linux) or `Cmd+,` (Mac)

## Settings Sections

Settings are organized into categories:

1. **Appearance** - Theme and visual preferences
2. **API Keys** - AI provider credentials
3. **Database** - Vault database management
4. **Application Updates** - Update settings and changelog

## Appearance

Customize how Flint looks.

### Theme

**Three theme options:**

**Light Mode:**

- Always use light theme
- Regardless of system settings
- High contrast, bright background

**Dark Mode:**

- Always use dark theme
- Regardless of system settings
- Low light, dark background

**Auto (System):**

- Follow your OS theme
- macOS: Uses system Dark Mode setting
- Windows: Uses system theme preference
- Switches automatically when OS changes

**Setting your theme:**

1. Settings → Appearance
2. Select theme option:
   - Light
   - Dark
   - Auto
3. Theme applies immediately

### Future Appearance Settings

Planned customizations:

**Font settings:**

- Editor font family
- Editor font size
- UI font size

**Layout:**

- Sidebar default width
- Editor line height
- Code block styling

**Colors:**

- Accent color
- Syntax highlighting theme

## API Keys

Configure AI provider access.

### Supported Providers

**OpenRouter (Recommended):**

- Access to multiple models
- One API key for many providers
- Flexible model selection
- Cost-effective

**Direct providers** (future):

- Anthropic (Claude directly)
- OpenAI (GPT models directly)

### Adding an API Key

**OpenRouter setup:**

1. Visit [openrouter.ai](https://openrouter.ai)
2. Create account
3. Generate API key
4. Copy the key

**In Flint:**

1. Settings → API Keys
2. Paste key in "OpenRouter API Key" field
3. Key validated automatically
4. Green checkmark when valid

**Auto-save:**

- Key saves after 1 second of no typing
- "Saved" message appears
- Stored securely in OS keychain

### API Key Storage

**Secure storage:**

- Keys stored in your OS keychain
- macOS: Keychain Access
- Windows: Credential Manager
- Linux: Secret Service / libsecret

**Encryption:**

- Your OS encrypts the keys
- Flint never stores keys in plain text
- Only accessible to Flint

**macOS Keychain Prompt:**

When you first save an API key on macOS:

```
"Flint" wants to access your keychain

[Password field]

[ Deny ]  [ Always Allow ]
```

**Click "Always Allow"** to avoid repeated prompts.

This is normal - Flint is using your OS's secure storage.

### Validating Keys

**Automatic validation:**

- Green ✓ = Valid key
- Red ❌ = Invalid key

**Testing:**

1. Add key
2. Open AI agent
3. Send test message
4. If responds = key works

**If invalid:**

- Check for typos
- Verify key is active on provider site
- Generate new key if needed

### Managing API Keys

**Viewing keys:**

- Keys displayed as password field (hidden)
- Can't copy from settings
- Retrieve from provider site if needed

**Changing keys:**

1. Delete existing key (clear field)
2. Paste new key
3. Validates and saves automatically

**Clearing all keys:**

**Danger Zone section:**

1. Click "Clear All API Keys"
2. Confirm action
3. All keys removed from keychain

**Use with caution** - cannot be undone!

### API Key Security

**Best practices:**

**DO:**

- Store only in Flint (secure storage)
- Rotate keys periodically
- Use separate keys for different apps
- Monitor usage on provider site

**DON'T:**

- Share keys with others
- Commit keys to git repositories
- Store in plain text files
- Use same key across many apps

**If compromised:**

1. Revoke key on provider site immediately
2. Generate new key
3. Update in Flint
4. Monitor billing for unusual activity

## Database

Manage your vault's database.

### What is the Database?

Flint uses **SQLite** to index your notes:

**Stores:**

- Note metadata (titles, types, dates)
- Full-text search index (FTS5)
- Wikilinks and backlinks
- Tags and fields
- Review schedules

**Doesn't store:**

- Note content (that's in .md files)
- Binary files (images, PDFs)

**Location:**

- `.flint/database.db` in your vault folder

### Rebuilding Database

**When to rebuild:**

**Search not working:**

- Can't find notes you know exist
- Search results seem incomplete

**Notes missing:**

- Notes created externally don't appear
- Recently created notes not showing

**After corruption:**

- Database errors
- App crashes related to database

**How to rebuild:**

1. Settings → Database
2. Click "Rebuild Database"
3. Confirm action
4. Flint scans all .md files
5. Rebuilds index from scratch
6. "Rebuild complete" message

**What happens:**

- All .md files in vault scanned
- Metadata extracted
- Search index recreated
- Links reprocessed
- Takes a few seconds to minutes (depends on vault size)

**Safe to do:**

- Non-destructive (doesn't touch .md files)
- Can rebuild anytime
- Good for troubleshooting

### Database Statistics

**View stats** (future):

```
Database info:
- Total notes: 342
- Last rebuilt: 2 hours ago
- Database size: 5.2 MB
- Index size: 12.3 MB
- FTS index: Current
```

### Backup and Recovery

**Database is reconstructible:**

- If database.db deleted or corrupted
- Flint rebuilds from .md files automatically
- No permanent data loss

**Backup strategy:**

- Backup vault folder (includes database)
- Or just backup .md files
- Database can be regenerated

## Application Updates

Manage Flint updates.

### Auto-Update System

**How it works:**

1. **Background check** - Flint checks for updates on startup
2. **Download** - New version downloads in background
3. **Notification** - Green dot appears when ready
4. **Install** - Restart to update

**Update channels:**

**Stable:**

- Production releases
- Thoroughly tested
- Recommended for most users

**Canary:**

- Bleeding edge features
- Latest development
- May have bugs
- For early adopters

### Checking for Updates

**Automatic:**

- Checks on every app launch
- Checks periodically while running

**Manual check:**

1. Settings → Application Updates
2. Click "Check Now"
3. Status appears

**Results:**

```
✓ You're up to date (v1.2.3)

or

🔄 Update available (v1.3.0)
   Downloading in background...

or

⬇ Update ready to install
   Restart to update
```

### Viewing Changelog

**See what's new:**

1. Settings → Application Updates
2. Click "View Changelog"
3. Changelog modal opens

**Shows:**

- Current version
- All previous versions
- Changes in each version
- New features, bug fixes

**Useful for:**

- Understanding new features
- Seeing what changed
- Reporting bugs ("since version X")

### Update Notifications

**Green dot indicator:**

- Appears in top bar when update ready
- Click to see update details

**Update banner** (future):

- In-app notification
- "Update available - Restart to install"
- Dismiss or install

### Installing Updates

**To update:**

1. Save any work
2. Quit Flint
3. Relaunch Flint
4. Update applies automatically

**Or:**

- Click "Restart to Update" if available
- Flint closes and reopens with new version

**Update process:**

- Preserves all data
- Settings maintained
- Notes untouched
- Conversation history kept

### Troubleshooting Updates

**Update not downloading:**

1. Check internet connection
2. Check for firewall/proxy issues
3. Manually download from website
4. Install new version over old

**Update failed:**

1. Download installer manually
2. Quit Flint
3. Run installer
4. Relaunch

**Rollback** (if needed):

1. Download previous version
2. Install over current version

## Future Settings

Planned configuration options:

### Editor Settings

**Preferences:**

- Line numbers (on/off)
- Word wrap (on/off)
- Tab size (2, 4 spaces)
- Auto-save interval
- Spell check (enable/disable)

### AI Settings

**Per-vault model:**

- Default model for vault
- Model selection preferences
- Cost limits/warnings
- Context window size

### Review Settings

**Scheduling:**

- Custom intervals (not just 1 day / 7 days)
- Review time limits
- Daily review reminders

### Privacy Settings

**Telemetry:**

- Opt-in crash reporting
- Anonymous usage statistics
- What data is collected

### Keyboard Shortcuts

**Customization:**

- Change default shortcuts
- Add custom shortcuts
- Export/import keybindings

## Best Practices

### API Keys

**Security:**

- Never share keys
- Rotate periodically
- Monitor usage
- Use OpenRouter for flexibility

**Cost management:**

- Choose appropriate models
- Monitor spending on provider site
- Use caching (automatic in Claude)
- Start fresh conversations to reduce context

### Database

**Maintenance:**

- Rebuild if search seems off
- Rebuild after major external edits
- Rebuild if weird behavior occurs

**Don't worry:**

- Database is reconstructible
- Can't lose data by rebuilding
- When in doubt, rebuild

### Updates

**Stay current:**

- Enable auto-updates
- Update promptly
- Read changelogs
- Report issues

**If unstable:**

- Switch from Canary to Stable
- Wait for next stable release
- Report bugs to help improve

### Theme

**Personal preference:**

- No right answer
- Try each option
- Consider lighting conditions
- Auto mode is convenient

**Dark mode benefits:**

- Reduced eye strain in low light
- Battery saving (OLED screens)
- Popular among developers

**Light mode benefits:**

- Better in bright environments
- Higher contrast
- Traditional reading experience

## Exporting Settings

**Future feature:**

Export your configuration:

```json
{
  "theme": "dark",
  "editor": {
    "lineNumbers": true,
    "wordWrap": false,
    "fontSize": 14
  },
  "ai": {
    "defaultModel": "claude-3-opus"
  }
}
```

Import on new machine or after reinstall.

## Resetting to Defaults

**If settings corrupted or want fresh start:**

**Manual reset:**

1. Quit Flint
2. Delete `{userData}/settings/app-settings.json`
3. Relaunch Flint
4. Settings reset to defaults

**Or future UI:**

- Settings → Advanced → Reset to Defaults
- Confirm action
- App restarts with default settings

**Doesn't affect:**

- Vaults
- Notes
- API keys (stored separately)
- Database

## Settings Files

**Where settings are stored:**

**macOS:**

```
~/Library/Application Support/Flint/
├── settings/
│   └── app-settings.json
└── vault-data/
    └── {vaultId}/
        ├── pinned-notes.json
        └── temporary-tabs.json
```

**Windows:**

```
%APPDATA%\Flint\
├── settings\
│   └── app-settings.json
└── vault-data\
    └── {vaultId}\
        ├── pinned-notes.json
        └── temporary-tabs.json
```

**Linux:**

```
~/.config/Flint/
├── settings/
│   └── app-settings.json
└── vault-data/
    └── {vaultId}/
        ├── pinned-notes.json
        └── temporary-tabs.json
```

**Vault registry:**

- Tracks all vaults
- Location: `{userData}/vaults.json`

## Next Steps

- **[Getting Started](/getting-started)** - Initial setup
- **[AI Agent](/features/agent)** - Configure AI models
- **[User Interface](/guides/interface)** - Customize your workspace

---

**Pro tip:** Start with defaults and adjust as you discover preferences. Most users only need to set theme and API key. The rest can stay default unless you have specific needs.
