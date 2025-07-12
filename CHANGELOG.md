# Changelog

All notable changes to this project will be documented in this file.

## Upcoming

### Added
- Add separate API (`@flint-note/api`) in addition to the MCP server

## 0.7.1

### Added
- Improved validation for tool calls (#11)

## 0.7.0

## Added
- get_notes to fetch multiple notes in one tool call
- field filtering to allow agent to narrow relevant context

## 0.6.0

### Added
- Vault id as an optional parameter to most tools to allow cross-vault operation without switching vaults (#9)

## 0.5.0

### Added
- Added `rename_note` tool for safe title changes (#7)
- Protection against title/filename modifications via `update_note` metadata updates
- Better link handling (#8)
  - links are now automatically extracted from notes and stored in db
  - new tools for managing links: `get_note_links`, `get_backlinks`, `find_broken_links`, `search_by_links`, `migrate_links`

### Changed
- Dropped old link handling tools (#8)

## 0.4.1

### Fixed
- Prevent metadata corruption by validating schema in update_note_type (#6)

## 0.4.0

### Added

- much improved search backed by sqlite (search_advanced, search_sql) (#5)

## 0.3.0

### Added
- Content hash system for optimistic locking to prevent conflicts during note updates
- All update operations now include content_hash parameter for safe concurrent modifications
- Content hash conflict detection and resolution in batch operations
- Enhanced documentation and prompts covering content hash best practices

### Changed
- `get_note` and `get_note_type_info` operations now return content_hash for safe updates
- `update_note` and `update_note_type` operations now require content_hash parameter
- Batch update operations include content_hash validation for each individual update
- Updated all AI prompts to include content hash safety guidelines

### Removed
- remove initialize_vault tool (redundant)

## 0.2.1

### Fixed
- Automatic configuration upgrade for old vaults missing deletion settings
- Configuration schema updated to version 1.1.0 with deletion settings

### Removed
- `protect_builtin_types` configuration option - all note types can now be deleted equally

## 0.2.0

### Added
- Batch operations support for creating and updating multiple notes simultaneously (#1)
- Delete individual notes with `delete_note` tool requiring confirmation
- Delete note types with `delete_note_type` tool supporting error/migrate/delete modes
- Bulk delete operations with `bulk_delete_notes` tool for filtering by type, tags, or pattern
- Comprehensive test coverage for deletion and batch operations
- New batch operations examples and documentation

### Changed
- Separated server creation from server launching for better testability
- Updated documentation with batch operation instructions and examples
- Improved error handling and validation for all operations

### Fixed
- Resolved hanging tests by properly separating server concerns
- Multiple linting and code quality improvements
