# Changelog - Canary

All notable changes to the Flint application canary builds will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.12.0-canary.7]

### Added

- Experimental EPUB support

## [0.12.0-canary.2]

### fixed

- fixed renaming of wikilinks on new note creation

## [0.12.0-canary.1]

### fixed

- handling of empty titles is better (show preview in sidebar)

## [0.9.0-canary.2]

### fixed

- reworked external change detection, should be fewer spurious "external edit detected" messages

## [0.9.0-canary.1]

### Added

- Note linting for agents
- Broken link validation warnings to agent updates
- Skip validation option to note updates
- Note type icons
- Scroll to open note in sidebar

### Changed

- Redesigned all notes view to note types using card layout
- Improved autocomplete info details
- Improved directory ignoring for file watcher

### Fixed

- Autocomplete using wrong link format
- Broken wikilinks on first load
- Daily view entries losing focus when window loses focus
- Mutation errors on teardown
- Migration tests

## [0.3.1-canary.3]

### Changed

- improved performance of wikilink popover
- improved styling of wikilinks

## [0.3.1-canary.1]

### Added

- Inbox view

### Changed

- focus on title when creating a new note

### Fixed

- daily view switches when vault switches

## [0.2.6-canary.5]

### Added

- added backlinks control
- added icons in wikilink popover
- add button in settings to rebuild the index

### Fixed

- only change update time on actual content change
- fix bug that would erase frontmatter when updating link references when a note was renamed

## [0.2.6-canary.4]

- Made titles optional, new notes are created with empty titles
- Made better placeholder text in title and note editor

## [0.2.5-canary.3]

### Added

- Add link in setting to view changelog
- Added ability to press enter to follow links when cursor is on a link

### Changed

- Removed excessive tooltip on links

## [0.2.5-canary.2]

### Added

- Changelog display
- Wikilink editor popup
