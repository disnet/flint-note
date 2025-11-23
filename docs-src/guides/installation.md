# Installation

This guide will help you install Flint on your system.

## Download

Get the latest version of Flint from:

- Official website: [flintnote.com](https://www.flintnote.com/#download)

Choose the appropriate installer for your platform.

## Platform-Specific Installation

### Windows

1. Download the `.exe` installer
2. Double-click the installer file
3. Follow the installation wizard
4. Launch Flint from the Start Menu or Desktop shortcut

**Requirements:**

- Windows 10 or later
- 200 MB disk space

### macOS

1. Download the `.dmg` file
2. Open the `.dmg` file
3. Drag Flint to your Applications folder
4. Launch Flint from Applications or Spotlight

**Requirements:**

- macOS 10.13 (High Sierra) or later
- 200 MB disk space

**First Launch:**
On first launch, you may see a security warning. To allow Flint to run:

1. Right-click (or Control+click) the Flint app
2. Select "Open" from the menu
3. Click "Open" in the security dialog

### Linux

Flint for Linux is distributed as an **AppImage**, a universal format that works on all modern Linux distributions.

1. Download the `.AppImage` file from the website
2. Make it executable: `chmod +x Flint-*.AppImage`
3. Run: `./Flint-*.AppImage`

**Optional - Integrate with your system:**

```bash
# Move to a standard location
mkdir -p ~/.local/bin
mv Flint-*.AppImage ~/.local/bin/flint
chmod +x ~/.local/bin/flint

# Now you can run 'flint' from anywhere
```

**Optional - Create desktop entry:**

Create `~/.local/share/applications/flint.desktop`:

```desktop
[Desktop Entry]
Name=Flint
Exec=/home/YOUR_USERNAME/.local/bin/flint
Type=Application
Categories=Utility;
```

Replace `YOUR_USERNAME` with your actual username.

**Requirements:**

- Modern Linux distribution (Ubuntu 18.04 or later, or equivalent)
- 200 MB disk space

## Updates

Flint will automatically check for updates and notify you when a new version is available.

## Uninstallation

### Windows

Use "Add or Remove Programs" in Windows Settings.

### macOS

Drag Flint from Applications to the Trash.

### Linux

Delete the AppImage file and any desktop integration you created:

- Remove the AppImage: `rm ~/.local/bin/flint` (or wherever you placed it)
- Remove desktop entry: `rm ~/.local/share/applications/flint.desktop` (if created)

Your notes are stored separately and will not be deleted during uninstallation.
