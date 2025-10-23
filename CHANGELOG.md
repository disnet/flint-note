# Changelog - Release

All notable changes to the Flint application will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.7.1]

### Fixed

- Fixed an issue where you could not change any note title

## [0.7.0]

### Added

**AI Assistant Routines**

Flint now supports creating automated routines that the AI assistant can execute on your behalf. Routines can be triggered on a recurring schedule or run on-demand:

- **Create custom routines**: Define multi-step tasks in plain language that the assistant will execute automatically (e.g., "Find all notes tagged 'reading' from the past week and create a weekly digest")
- **Scheduled execution**: Set up routines to run daily, weekly, monthly, or on custom schedules at specific times
- **On-demand workflows**: Create routines that you can trigger manually whenever needed
- **Supplementary materials**: Attach reference notes, templates, and examples to help the assistant execute routines effectively
- **Routine management UI**: New "Routines" view in the left sidebar for creating, editing, and managing your automated workflows
- **Backlog discovery**: The assistant can transparently create routine suggestions based on patterns it notices while working (e.g., duplicate notes, stale project statuses, missing tags)

Example use cases include weekly note digests, monthly goal reviews, meeting preparation, content creation pipelines, and knowledge base maintenance tasks.

**Better AI Assistant tool integration**

The AI assistant now has enhanced capabilities for working with your notes:

- **Check and move notes**: The assistant can check if notes exist and move them between folders while preserving links and metadata
- **Larger message input**: The message input field can now grow taller to accommodate longer requests

**External file change detection**

Flint now watches for changes made to your notes outside the application:

- **Automatic sync**: Changes made in external text editors are automatically detected and synced
- **Conflict prevention**: The app prevents accidental overwrites when files are modified externally
- **Index synchronization**: The search index automatically updates when external changes are detected
- **Missing note detection**: Notes added to vault folders outside Flint are automatically discovered and indexed

### Changed

- Improved context estimation to account for tool calls in the AI assistant
- Note editor is now reactive to edits made by the AI assistant
- Enhanced styling for the routines/workflows UI

### Fixed

- Fixed infinite loop when sidebar had zero notes
- Fixed issue with AI assistant threads not saving correctly during vault switching
- Fixed reading notes with missing title or frontmatter
- Fixed rename events not properly updating the active note

## [0.6.0]

### Added

**AI Assistant improvements**

The AI assistant has received significant improvements to make it more powerful and easier to use:

- **Task planning system**: The assistant now creates and tracks structured task lists for complex multi-step requests, showing you exactly what it's working on and what's left to do
- **Agent activity monitoring**: A new widget displays real-time information about what the assistant is doing, including tool calls and their results, with copy-to-clipboard functionality for easy reference
- **Context usage tracking**: A visual indicator shows how much of the model's context window is being used, helping you understand when you might need to start a new conversation
- **Message cancellation**: You can now cancel in-progress assistant messages if they're taking too long or going in the wrong direction
- **Model selector improvements**: Simplified interface for switching between AI models, with better organization and descriptions
- **Better models**: Now using Haiku 4.5 by default (it's sooo fast and good), with a toggle for Sonnet when you need more thinking

**Resizable sidebars**

Both the left and right sidebars can now be resized by dragging their edges, allowing you to customize the layout to your preferences.

**Shift+click to add to sidebar**

You can now Shift+click on wikilinks to quickly add the linked note to the sidebar without opening it, making it easier to collect reference notes.

### Changed

- Improved full-text search performance and accuracy
- Better pagination and context limiting for AI assistant responses
- Enhanced scrolling behavior in sidebar notes with sticky titles
- Improved activity widget display during AI assistant steps

### Fixed

- Fixed link text alignment in rendered notes

## [0.5.0]

### Added

**Note type switcher in editor header**

Added a convenient dropdown in the note editor header that allows you to quickly change a note's type without opening the metadata panel. The type switcher displays the current note type and provides a searchable dropdown of all available note types in your vault.

**Clickable file paths in metadata**

File paths displayed in the metadata view are now clickable, allowing you to quickly reveal notes in your system's file browser. This makes it easier to locate and work with note files outside of Flint.

### Changed

- Wikilink navigation now requires Cmd/Ctrl+Enter instead of just Enter when the cursor is next to a wikilink, reducing accidental navigation while typing
- Improved wikilink positioning and styling for better visual clarity
- Metadata view enhanced to handle duplicate fields more robustly
- Popovers now automatically hide when the editor loses focus for a cleaner interface

### Fixed

- Fixed race condition when creating and immediately renaming daily notes
- Fixed wikilink updates not propagating correctly in sidebar notes
- Fixed sidebar notes not being properly scoped to the current vault
- Improved system field protection in metadata to prevent unintended modifications

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
