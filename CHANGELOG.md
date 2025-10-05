# Changelog - Release

All notable changes to the Flint application will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.3.0]

### Added

- Can now see this changelog
- Hovering over a wikilink will now show a popup so you can edit the display text
- Pressing 'Enter' when the cursor is next to a wikilink will open the link
- Backlinks: now each note shows a list of notes that link to it with the linking context

### Changed

- Made titles optional, new notes are created with empty titles
- Made better placeholder text in title and note editor

### Fixed

- only change update time on actual content change
- fix bug that would erase frontmatter when updating link references when a note was renamed
