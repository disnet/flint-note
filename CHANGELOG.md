# Changelog

All notable changes to this project will be documented in this file.

## upcoming

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
