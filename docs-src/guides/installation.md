# Installation

This guide will help you install Flint on your system.

## Download

Get the latest version of Flint from:

- [GitHub Releases](https://github.com/yourusername/flint/releases)
- Official website: [flint.example.com](https://flint.example.com)

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

#### AppImage (Universal)

1. Download the `.AppImage` file
2. Make it executable: `chmod +x Flint-*.AppImage`
3. Run: `./Flint-*.AppImage`

#### Debian/Ubuntu (.deb)

1. Download the `.deb` file
2. Install: `sudo dpkg -i flint_*.deb`
3. Launch from your applications menu or run `flint`

#### Fedora/RHEL (.rpm)

1. Download the `.rpm` file
2. Install: `sudo rpm -i flint-*.rpm`
3. Launch from your applications menu or run `flint`

**Requirements:**

- Modern Linux distribution (2020 or later)
- 200 MB disk space

## First Run

After installation:

1. Launch Flint
2. The app will create a default notes directory in your home folder
3. You can change this location in Settings if desired

## Data Location

By default, Flint stores your notes in:

- **Windows**: `%USERPROFILE%\Documents\Flint Notes`
- **macOS**: `~/Documents/Flint Notes`
- **Linux**: `~/Documents/Flint Notes`

You can change this location in Settings > General > Notes Directory.

## Updates

Flint will automatically check for updates and notify you when a new version is available. You can:

- Download and install updates automatically
- Disable automatic update checks in Settings

## Uninstallation

### Windows

Use "Add or Remove Programs" in Windows Settings.

### macOS

Drag Flint from Applications to the Trash.

### Linux

- AppImage: Delete the file
- Debian/Ubuntu: `sudo apt remove flint`
- Fedora/RHEL: `sudo rpm -e flint`

Your notes are stored separately and will not be deleted during uninstallation.

## Troubleshooting

### Application Won't Launch

(Documentation to be added)

### Database Errors

(Documentation to be added)

### Performance Issues

(Documentation to be added)
