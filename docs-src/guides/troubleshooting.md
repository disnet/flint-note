# Troubleshooting

Common issues and solutions for Flint.

## Getting Help

### Before Troubleshooting

**Quick fixes to try first:**

1. Save your work (auto-save should handle this)
2. Restart Flint
3. Check for updates
4. Try again

**Many issues resolve with a restart.**

### Where to Get Help

**Documentation:**

- Search the docs (this site)
- Check relevant guide sections
- Review feature documentation
- Check the FAQ for common questions

## Installation Issues

### App Won't Install (macOS)

**Problem:** "Flint can't be opened because it is from an unidentified developer"

**Solution:**

```
1. Right-click Flint.app
2. Select "Open"
3. Click "Open" in dialog
4. Or: System Preferences → Security & Privacy
   → "Open Anyway"
```

**Cause:** macOS Gatekeeper protection.

### App Won't Install (Windows)

**Problem:** "Windows protected your PC" message

**Solution:**

```
1. Click "More info"
2. Click "Run anyway"
```

**Cause:** Windows SmartScreen protection.

### App Won't Launch

**Problem:** App opens then immediately closes.

**Solutions:**

1. **Check system requirements:**
   - macOS 10.15+ / Windows 10+ / Linux (recent)
   - 4GB RAM minimum
   - 500MB disk space

2. **Check logs:**

   ```
   macOS: ~/Library/Logs/Flint/
   Windows: %APPDATA%\Flint\logs\
   Linux: ~/.config/Flint/logs/
   ```

3. **Reset application data:**

   ```
   Quit Flint
   Rename/delete settings folder (backup first!)
   Relaunch Flint
   ```

4. **Reinstall:**
   ```
   Uninstall Flint
   Download latest version
   Install fresh
   ```

## Vault Issues

### Can't Open Vault

**Problem:** Vault won't open or shows error.

**Solutions:**

1. **Check folder permissions:**

   ```
   Ensure you have read/write access to vault folder
   macOS: Get Info → Sharing & Permissions
   Windows: Properties → Security
   ```

2. **Check folder exists:**

   ```
   Vault folder may have been moved or deleted
   Browse to expected location
   Restore from backup if needed
   ```

3. **Database corruption:**

   ```
   Settings → Database → Rebuild Database
   Reconstructs from markdown files
   ```

4. **Create new vault:**
   ```
   If vault unrecoverable, create new vault
   Copy markdown files from old vault to new
   ```

### Vault Shows No Notes

**Problem:** Vault opens but appears empty.

**Solutions:**

1. **Rebuild database:**

   ```
   Settings → Database → Rebuild Database
   Rescans all markdown files
   ```

2. **Check note type filters:**

   ```
   Ensure no filters hiding notes
   Click "All Notes" or "General"
   ```

3. **Check folder location:**
   ```
   Verify vault folder contains .md files
   May be looking at wrong folder
   ```

### Can't Create Vault

**Problem:** New vault creation fails.

**Solutions:**

1. **Check folder permissions:**

   ```
   Must have write access to parent folder
   Choose different location if needed
   ```

2. **Check disk space:**

   ```
   Ensure sufficient free space
   500MB minimum recommended
   ```

3. **Avoid special characters:**
   ```
   Vault name: Use letters, numbers, spaces
   Avoid: / \ : * ? " < > |
   ```

### Lost Vault

**Problem:** Vault disappeared from vault list.

**Solutions:**

1. **Re-add vault:**

   ```
   Vault selector → "Open Existing Vault"
   Browse to vault folder
   Select and open
   ```

2. **Search for vault:**

   ```
   Vault may have been moved
   Search computer for .flint folder
   Check recent locations
   ```

3. **Restore from backup:**
   ```
   If vault truly lost, restore from backup
   Cloud storage or Time Machine
   ```

## Note Issues

### Note Won't Save

**Problem:** Changes not saving or error message.

**Solutions:**

1. **Check auto-save:**

   ```
   Wait for "Saved" indicator
   May be temporary delay
   ```

2. **Check file permissions:**

   ```
   Ensure write access to note file
   Check folder permissions
   ```

3. **Check disk space:**

   ```
   Ensure free space available
   Clear space if needed
   ```

4. **Manual save attempt:**
   ```
   Cmd/Ctrl+S to force save
   See if error message appears
   ```

### Note Content Lost

**Problem:** Note content disappeared or corrupted.

**Solutions:**

1. **Check undo:**

   ```
   Cmd/Ctrl+Z to undo recent changes
   May recover content
   ```

2. **Check file directly:**

   ```
   Open .md file in text editor
   Content may be there but not showing in Flint
   ```

3. **Restore from backup:**

   ```
   Time Machine / File History
   Cloud storage previous versions
   Git history if using version control
   ```

4. **Check for conflict files:**
   ```
   If syncing, check for conflict copies
   CloudProvider might have saved backup
   ```

### Can't Delete Note

**Problem:** Delete note option doesn't work.

**Solutions:**

1. **Check file permissions:**

   ```
   May not have delete permissions
   Check folder permissions
   ```

2. **File may be open elsewhere:**

   ```
   Close other editors
   Close Flint and reopen
   ```

3. **Delete file manually:**
   ```
   Open vault folder
   Delete .md file directly
   Rebuild database in Flint
   ```

### Note Appears Twice

**Problem:** Duplicate note entries in list.

**Solutions:**

1. **Rebuild database:**

   ```
   Settings → Database → Rebuild Database
   Resolves index issues
   ```

2. **Check for actual duplicates:**
   ```
   May have created same note twice
   Check content, delete one if duplicate
   ```

## Search Issues

### Search Returns No Results

**Problem:** Search doesn't find notes you know exist.

**Solutions:**

1. **Rebuild database:**

   ```
   Settings → Database → Rebuild Database
   Rebuilds search index
   ```

2. **Check search syntax:**

   ```
   Ensure using correct operators
   type:general not types:general
   ```

3. **Check note type filter:**

   ```
   May be filtering to wrong type
   Click "All Notes"
   ```

4. **Try different search terms:**
   ```
   Try exact phrase: "full phrase"
   Try single words
   Try title vs content
   ```

### Search Too Slow

**Problem:** Search takes long time to return results.

**Solutions:**

1. **Rebuild database:**

   ```
   Settings → Database → Rebuild Database
   Optimizes search index
   ```

2. **Check vault size:**

   ```
   Very large vaults (10,000+ notes) slower
   Consider splitting into multiple vaults
   ```

3. **Restart Flint:**
   ```
   Clears caches
   Resets search state
   ```

## AI Agent Issues

### AI Not Responding

**Problem:** AI agent doesn't respond to messages.

**Solutions:**

1. **Check API key:**

   ```
   Settings → API Keys
   Verify key is entered and valid
   Green checkmark indicates valid
   ```

2. **Check internet connection:**

   ```
   AI requires internet connection
   Test connection in browser
   ```

3. **Check API provider status:**

   ```
   Visit openrouter.ai or provider website
   Check for outages
   ```

4. **Try new conversation:**

   ```
   Close current conversation
   Start new one
   May resolve stuck state
   ```

5. **Check API credits:**
   ```
   Visit provider website
   Ensure account has credits
   ```

### AI Responses Cut Off

**Problem:** AI responses incomplete or truncated.

**Causes:**

- Model token limit reached
- Connection interrupted
- Provider timeout

**Solutions:**

1. **Ask to continue:**

   ```
   "Please continue"
   AI will resume from where it stopped
   ```

2. **Shorter context:**

   ```
   Start new conversation
   Provide less context
   ```

3. **Different model:**
   ```
   Try different model
   Some have longer context windows
   ```

### AI Errors or Failures

**Problem:** AI returns error messages.

**Common errors:**

**"Invalid API key":**

```
Solution:
1. Settings → API Keys
2. Re-enter API key
3. Verify from provider website
```

**"Rate limit exceeded":**

```
Solution:
1. Wait a few minutes
2. Try again
3. Consider upgrading provider plan
```

**"Context too long":**

```
Solution:
1. Start new conversation
2. Provide less context
3. Reference fewer notes
```

**"Model not available":**

```
Solution:
1. Try different model
2. Check provider website
3. Model may be temporarily down
```

### API Key Issues

**Problem:** API key won't save or validate.

**Solutions:**

1. **Check key format:**

   ```
   Copy entire key from provider
   No extra spaces or newlines
   ```

2. **Keychain access (macOS):**

   ```
   Click "Always Allow" when prompted
   Grants Flint keychain access
   ```

3. **Generate new key:**

   ```
   Visit provider website
   Generate fresh API key
   Enter in Flint
   ```

4. **Check provider account:**
   ```
   Ensure account active
   Verify key hasn't been revoked
   Check payment status
   ```

## Editor Issues

### Cursor Jumping

**Problem:** Cursor moves while typing.

**Causes:**

- Auto-save during typing
- External file changes
- Sync conflict

**Solutions:**

1. **Wait for auto-save:**

   ```
   Pause typing briefly
   Wait for "Saved" indicator
   Resume typing
   ```

2. **Close external editors:**

   ```
   Don't edit note in multiple places
   Close other text editors
   ```

3. **Disable sync temporarily:**
   ```
   If using cloud sync
   Pause sync while editing
   ```

### Slow Editor Performance

**Problem:** Typing lag or slow scrolling.

**Solutions:**

1. **Check note size:**

   ```
   Very large notes (2,000+ lines) may be slow
   Consider splitting note
   ```

2. **Restart Flint:**

   ```
   Clears editor cache
   Resets state
   ```

3. **Check system resources:**

   ```
   Close other applications
   Free up RAM
   Check CPU usage
   ```

4. **Simplify note:**
   ```
   Remove very large code blocks
   Link to separate files instead
   ```

### Wikilinks Not Working

**Problem:** Wikilinks not clickable or don't navigate.

**Solutions:**

1. **Check syntax:**

   ```
   [[Note Title]]  ✓ Correct
   [ [Note Title]]  ❌ Space
   [Note Title]  ❌ Single brackets
   ```

2. **Refresh note:**

   ```
   Close and reopen note
   Cmd/Ctrl+R to reload
   ```

3. **Rebuild database:**

   ```
   Settings → Database → Rebuild Database
   Refreshes wikilink index
   ```

4. **Check note exists:**
   ```
   Red/orange wikilink = note doesn't exist
   Create note or fix link
   ```

### Formatting Not Showing

**Problem:** Markdown formatting not appearing.

**Solutions:**

1. **Check syntax:**

   ```
   Ensure proper markdown syntax
   **bold** not *bold*
   ```

2. **Restart editor:**

   ```
   Close and reopen note
   Refreshes rendering
   ```

3. **Check theme:**
   ```
   Try switching light/dark theme
   Settings → Appearance
   ```

## Sync Issues

### Cloud Sync Conflicts

**Problem:** Multiple versions of note after syncing.

**Causes:**

- Edited on multiple devices simultaneously
- Sync conflict

**Solutions:**

1. **Manually merge:**

   ```
   Open conflict files
   Copy content to main note
   Delete conflict files
   ```

2. **Choose one version:**

   ```
   Decide which is correct
   Delete other version
   ```

3. **Prevent future conflicts:**
   ```
   Close Flint before switching devices
   Wait for sync to complete
   Don't edit simultaneously
   ```

### Database Sync Issues

**Problem:** Database out of sync across devices.

**Solutions:**

1. **Don't sync database:**

   ```
   Add .flint/ to sync ignore
   Let each device rebuild own database
   ```

2. **Rebuild on all devices:**

   ```
   Settings → Database → Rebuild Database
   Do this on each device
   ```

3. **Use Git instead:**
   ```
   Git handles merge better
   Database .gitignored by default
   ```

## Performance Issues

### High Memory Usage

**Problem:** Flint using excessive RAM.

**Solutions:**

1. **Restart Flint:**

   ```
   Closes all notes
   Clears caches
   Frees memory
   ```

2. **Close unused notes:**

   ```
   Close temporary tabs
   Close notes not actively editing
   ```

3. **Check note size:**

   ```
   Large notes use more memory
   Split if needed
   ```

4. **Check vault size:**
   ```
   Very large vaults require more memory
   Consider splitting vaults
   ```

### High CPU Usage

**Problem:** Flint consuming CPU constantly.

**Solutions:**

1. **Check for loops:**

   ```
   AI conversation stuck?
   Workflow running continuously?
   Close and restart
   ```

2. **Rebuild database:**

   ```
   Database indexing may be stuck
   Settings → Database → Rebuild
   ```

3. **Restart Flint:**
   ```
   Clears stuck processes
   Resets state
   ```

### Slow Startup

**Problem:** Flint takes long time to launch.

**Solutions:**

1. **Check vault size:**

   ```
   Large vaults slower to load
   Normal for 5,000+ notes
   ```

2. **Check auto-open notes:**

   ```
   Many open tabs slow startup
   Close tabs before quitting
   ```

3. **Rebuild database:**

   ```
   Corrupted database slows startup
   Settings → Database → Rebuild
   ```

4. **Check system:**
   ```
   Disk full?
   Other apps using resources?
   Restart computer
   ```

## Platform-Specific Issues

### macOS Issues

**Keychain Access Prompts:**

```
Problem: Repeated keychain password requests

Solution:
Click "Always Allow" instead of "Allow"
Grants permanent access to Flint
```

**App Not in Applications:**

```
Problem: Downloaded app not installing

Solution:
Drag Flint.app to Applications folder
Don't run from Downloads
```

**Spotlight Not Finding Flint:**

```
Problem: Cmd+Space doesn't show Flint

Solution:
Rebuild Spotlight index
Or launch from Applications folder once
```

### Windows Issues

**App Won't Uninstall:**

```
Problem: Uninstaller doesn't work

Solution:
Settings → Apps → Flint → Uninstall
Or use third-party uninstaller
```

**Missing DLL Errors:**

```
Problem: "VCRUNTIME140.dll missing"

Solution:
Install Visual C++ Redistributable
Download from Microsoft
```

**Antivirus Blocking:**

```
Problem: Antivirus quarantines Flint

Solution:
Add Flint to antivirus exceptions
Whitelist application
```

### Linux Issues

**Permission Denied:**

```
Problem: Can't launch after installation

Solution:
chmod +x Flint.AppImage
Make executable
```

**Missing Dependencies:**

```
Problem: Library errors on launch

Solution:
Install required libraries
Check error message for specifics
```

## Data Recovery

### Recovering Lost Notes

**Strategies:**

1. **Check backups:**

   ```
   Time Machine (macOS)
   File History (Windows)
   Cloud storage versions
   ```

2. **Check trash/recycle bin:**

   ```
   May have been deleted
   Can restore if recent
   ```

3. **Check vault folder directly:**

   ```
   Open in file browser
   Look for .md files
   May be there but not indexed
   ```

4. **Git history:**
   ```
   If using Git:
   git log -- path/to/note.md
   git checkout <commit> -- path/to/note.md
   ```

### Recovering Corrupted Vault

**Steps:**

1. **Copy vault folder:**

   ```
   Make backup before trying fixes
   Copy entire folder elsewhere
   ```

2. **Try rebuilding database:**

   ```
   Delete .flint/database.db
   Open vault in Flint
   Rebuilds automatically
   ```

3. **Create new vault:**

   ```
   Create fresh vault
   Copy .md files from old vault
   Rebuild database
   ```

4. **Restore from backup:**
   ```
   Last resort: restore entire vault folder
   From most recent backup
   ```

## Getting More Help

### Information to Include

**When reporting issues:**

```
1. Flint version (Help → About)
2. Operating system and version
3. Steps to reproduce
4. Error messages (exact text)
5. Screenshots if relevant
6. Vault size (number of notes)
```

**More detail = faster resolution.**

### Logs and Diagnostics

**Log locations:**

```
macOS: ~/Library/Logs/Flint/
Windows: %APPDATA%\Flint\logs\
Linux: ~/.config/Flint/logs/
```

**Include logs when reporting:**

- main.log - Application logs
- renderer.log - UI logs
- error.log - Error details

### Creating Minimal Reproduction

**For complex bugs:**

1. **Create test vault:**

   ```
   New vault with minimal content
   Try to reproduce issue
   ```

2. **Eliminate variables:**

   ```
   Disable custom functions
   Remove workflows
   Simplify to core issue
   ```

3. **Document steps:**
   ```
   Write exact steps to reproduce
   1. Open vault
   2. Create note
   3. Do action X
   4. Bug occurs
   ```

## Emergency Procedures

### Flint Won't Start at All

**Nuclear options:**

1. **Reset all settings:**

   ```
   Quit Flint
   Rename settings folder (backup first)
   Launch Flint
   Reconfigure
   ```

2. **Reinstall:**

   ```
   Uninstall Flint completely
   Delete application data (backup first)
   Fresh install
   Re-add vaults
   ```

3. **Access notes directly:**
   ```
   Notes are markdown files
   Open in any text editor
   Flint not required to read
   ```

### Corrupted Database

**Recovery:**

```
1. Close Flint
2. Navigate to vault/.flint/
3. Delete database.db
4. Reopen vault in Flint
5. Flint rebuilds from markdown files
```

**Safe - notes are in .md files, not database.**

## Prevention

### Best Practices

**Prevent issues:**

- ✓ Regular backups
- ✓ Close Flint before syncing
- ✓ Don't edit notes externally while Flint open
- ✓ Keep Flint updated
- ✓ Monitor disk space
- ✓ Use version control (Git)

**Avoid:**

- ❌ Editing on multiple devices simultaneously
- ❌ Moving vault folder while Flint open
- ❌ Running out of disk space
- ❌ Ignoring update notifications

## Next Steps

- **[Best Practices](/guides/best-practices)** - Avoid issues
- **[Privacy & Security](/guides/privacy-security)** - Protect data
- **[FAQ](/guides/faq)** - Common questions

---

**Remember:** Most issues resolve with restart and rebuild database. When in doubt, your notes are safe in .md files - Flint can always rebuild its index from them.
