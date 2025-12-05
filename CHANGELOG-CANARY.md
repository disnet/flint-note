# Changelog - Canary

All notable changes to the Flint application canary builds will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.13.0-canary.6]

### Added

- ability to filter on blank props in decks

### Fixed

- fix confusing naming of props in editor chips
- fix != for select props
- various fixes to type notes
- fix positioning of emoji picker in new workspace dialog
- fix styling of deck view switcher
- fix decks forgetting selected views

## [0.13.0-canary.5]

### Fixed

- handle more yaml parsing for note types

## [0.13.0-canary.4]

### Changed

- better tabbing and handling of new notes in decks

## [0.13.0-canary.3]

### Changed

- rework note type definitions and editor
- improve deck editor

## [0.13.0-canary.2]

## Changed

- added decks (note queries)
- update metadata/props styling

## [0.13.0-canary.1]

## Changed

- Search bar is now the action bar (Cmd-K instead of Cmd-O)
- adds full text search
- add commands/actions search
- add agent search/messages

## [0.12.0-canary.19]

### Fixed

- Fixed issue with drag and drop importing of images

## [0.12.0-canary.18]

### Added

- Adjusted menu items for importing
- Add support for drag and drop importing of epub/pdf
- Add support for importing multiple epub/pdfs simultaneously

## [0.12.0-canary.17]

### Added

- Zoom adjustment for EPUB

## [0.12.0-canary.16]

### Added

- Support for saving web pages
- Agent tools for retrieving/searching documents (EPUB/PDF/Webpages)

## [0.12.0-canary.15]

## Fixed

- Restored broken image support

## [0.12.0-canary.12]

### Added

- experimental PDF support

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
