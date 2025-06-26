# Changelog

All notable changes to this project will be documented in this file.

## upcoming

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
