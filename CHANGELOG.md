# Changelog - Release

All notable changes to the Flint application will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.4.0]

**NOTE**: This release involved a significant overhaul of how Flint manages UI state and as such your opened and pinned notes were reset. I'll try not to do that again.

### Added

**Vault templates**

When you create a new vault, you can choose from a set of vault templates that will create a set of note templates and example notes. The current vault templates are:

- **Default**: Just Daily and Note types with a basic getting started guide.
- **Research**: A template tailored for an academic research project.
- **Zettelkasten**: A vault optimized for the Zettelkasten method of knowledge development and atomic note-taking

**Markdown preview mode**

Added a button to toggle between Markdown and HTML preview modes.

**Inbox view**

A new dedicated inbox view provides a streamlined workflow for managing unprocessed notes. The inbox features quick note creation via a single-input field, allowing users to rapidly capture ideas by entering a title and pressing Enter. Notes are displayed with creation date and type metadata, and can be marked as processed or unprocessed with a single click. Users can toggle between viewing unprocessed and processed notes, with bulk actions available to mark all notes at once. Each note in the inbox is clickable to open the full editor, making it easy to triage new notes, process them, and maintain a clean workspace. The inbox automatically updates when notes are created elsewhere in the application, serving as a central hub for managing your note workflow.

**Sidebar notes**

A collapsible sidebar panel allows users to keep multiple notes accessible for quick reference and editing without leaving their current context. Notes can be added to the sidebar via the "Add to Sidebar" action in the note editor, creating a persistent workspace of frequently referenced notes. Sidebar notes can be easily removed when no longer needed, and the sidebar maintains its state across sessions, making it ideal for keeping research notes, reference material, or works-in-progress readily available during writing and research workflows.


### Changed

- Styling of wikilinks improved
- Improved styling and behavior of wikilink popover

### Fixed

- Notes in the daily view update when switching vaults

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
