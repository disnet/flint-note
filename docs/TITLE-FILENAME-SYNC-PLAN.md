# Title/Filename Synchronization with Wikilink Updates

## Overview

This document outlines the plan to enhance the note renaming functionality to automatically synchronize note titles with their filenames while properly updating all wikilinks that reference the renamed note.

## Problem Statement

Currently, when a note's title is updated via `renameNote()`, only the title field in the metadata is changed - the filename remains unchanged. This creates a disconnect between the note's title and its file system representation, making note management less intuitive and potentially causing confusion.

## Current State Analysis

### Existing Functionality
- **Title updates**: `renameNote()` method only updates the `title` field in frontmatter metadata
- **Wikilink updates**: Both `moveNote()` and `renameNote()` have sophisticated wikilink updating via:
  - `LinkExtractor.updateWikilinksForMovedNote()` - handles identifier changes
  - `LinkExtractor.updateWikilinksForRenamedNote()` - handles display text changes
- **Filename generation**: `generateFilename()` method creates filesystem-safe names from titles
- **File structure**: Notes store both `title` and `filename` in frontmatter

### Current Limitations
- Filename doesn't reflect title changes
- No automatic file system synchronization
- Potential confusion between display title and file identity

## Implementation Plan

### 1. Core Method Enhancement

#### Enhance `renameNote()` Method
**Location**: `src/server/core/notes.ts:1399`

**Current behavior**: Updates only title metadata  
**New behavior**: Update title + rename file + update all wikilinks

#### New `renameNoteWithFile()` Method
**Purpose**: Handle complete title/filename synchronization

**Implementation steps**:
1. **Validate inputs**
   - Check new title validity
   - Get current note data
   - Validate content hash for optimistic locking

2. **Generate new filename**
   - Use existing `generateFilename(newTitle)` method
   - Ensure filesystem safety and uniqueness

3. **Handle conflicts**
   - Check if new filename already exists in note type directory
   - Generate alternative names if conflicts exist (e.g., append numeric suffix)

4. **File system operations**
   - Use `fs.rename()` to move physical file
   - Update note path in all tracking systems

5. **Metadata updates**
   - Update both `title` and `filename` fields
   - Bypass protection for legitimate rename operations
   - Update `updated` timestamp

6. **Search index maintenance**
   - Remove old file path from search index
   - Add new file path to search index
   - Re-extract and store links for renamed note

7. **Wikilink updates**
   - Use existing `LinkExtractor.updateWikilinksForMovedNote()` for identifier changes
   - Use existing `LinkExtractor.updateWikilinksForRenamedNote()` for title changes
   - Update database link references

### 2. Wikilink Update Strategy

#### Leverage Existing Infrastructure
The codebase already has robust wikilink updating mechanisms that can be reused:

- `LinkExtractor.updateWikilinksForMovedNote()` - handles note identifier changes
- `LinkExtractor.updateWikilinksForRenamedNote()` - handles display text updates
- `WikilinkParser` - provides parsing and manipulation capabilities

#### Link Update Scenarios
Handle all common wikilink patterns:

```markdown
# Before rename (title: "Old Title" → "New Title", filename: old-title.md → new-title.md)

[[old-title]]                           → [[new-title]]
[[type/old-title]]                      → [[type/new-title]]  
[[Old Title]]                           → [[New Title]]
[[type/old-title|Old Title]]            → [[type/new-title|New Title]]
[[Old Title|Custom Display]]            → [[New Title|Custom Display]]
[[type/old-title|Custom Display]]       → [[type/new-title|Custom Display]]
```

### 3. Database and Search Index Updates

#### Requirements
- **Search index synchronization**: Update note path in hybrid search database
- **Link database updates**: Update all link references to use new identifier
- **Atomic operations**: Ensure database consistency during rename process
- **Re-indexing**: Extract and store links for renamed note with new path

#### Implementation Details
```typescript
// Update search index
await this.removeFromSearchIndex(oldPath);
await this.updateSearchIndex(newPath, updatedContent);

// Update link database
const db = await this.#hybridSearchManager.getDatabaseConnection();
await LinkExtractor.updateWikilinksForMovedNote(oldId, newId, newTitle, db);
await LinkExtractor.updateWikilinksForRenamedNote(newId, oldTitle, newTitle, db);
```

### 4. Error Handling and Edge Cases

#### Critical Scenarios
- **Filename conflicts**: Generate unique filenames when titles produce duplicate names
- **Invalid characters**: Handle titles with filesystem-unsafe characters
- **Concurrent modifications**: Validate content hashes to prevent conflicts
- **Partial failures**: Implement rollback mechanisms for failed operations
- **Large reference counts**: Handle performance with many referencing notes

#### Conflict Resolution Strategy
```typescript
async generateUniqueFilename(baseName: string, typePath: string): Promise<string> {
  let counter = 1;
  let filename = baseName;
  
  while (await this.fileExists(path.join(typePath, filename))) {
    const nameWithoutExt = baseName.replace(/\.md$/, '');
    filename = `${nameWithoutExt}-${counter}.md`;
    counter++;
  }
  
  return filename;
}
```

### 5. Integration Points

#### API Compatibility
- Extend existing `rename_note` tool to support filename synchronization
- Add optional parameter to control sync behavior
- Maintain backward compatibility for title-only updates

#### System Integration
- Update `generateNoteId()` calls with new filename
- Ensure all caches reflect new filename
- Update file system watchers and monitors

### 6. Implementation Phases

#### Phase 1: Core Functionality
- Implement `renameNoteWithFile()` method
- Add filename conflict resolution
- Basic error handling

#### Phase 2: Wikilink Integration
- Integrate existing `LinkExtractor` methods
- Ensure comprehensive link updates
- Database consistency maintenance

#### Phase 3: Edge Case Handling
- Advanced conflict resolution
- Comprehensive error handling
- Transaction rollback capabilities

#### Phase 4: Testing and Optimization
- Comprehensive test coverage
- Performance optimization
- API integration and documentation

### 7. Testing Strategy

#### Test Coverage Areas
- **Basic functionality**: Title/filename sync with simple cases
- **Wikilink updates**: All link formats across multiple notes
- **Error scenarios**: Filename conflicts, invalid characters, concurrent access
- **Database consistency**: Link references and search index accuracy
- **File system integrity**: Physical file operations and cleanup
- **Performance**: Large-scale operations with many references

#### Test Structure
```
test/server/integration/rename-with-filename-sync/
├── basic-rename-sync.test.ts
├── wikilink-updates.test.ts
├── conflict-resolution.test.ts
├── error-handling.test.ts
├── database-consistency.test.ts
└── performance.test.ts
```

## Expected Outcomes

### User Benefits
- **Intuitive file management**: Filenames automatically reflect note titles
- **Consistent references**: All wikilinks remain valid after title changes
- **Improved navigation**: File system browsing matches note titles
- **Reduced maintenance**: No manual link fixing required

### System Benefits
- **Data consistency**: Synchronized title/filename relationship
- **Robust operations**: Comprehensive error handling and rollback
- **Performance**: Leverages existing optimized wikilink update mechanisms
- **Maintainability**: Builds on proven `LinkExtractor` infrastructure

## Migration Considerations

### Backward Compatibility
- Existing notes with mismatched titles/filenames will continue to work
- New rename operations will establish title/filename synchronization
- Optional migration tool could sync existing notes

### Deployment Strategy
- Feature can be deployed incrementally
- No breaking changes to existing functionality
- Enhanced behavior only applies to new rename operations

## Conclusion

This plan leverages the existing, well-tested wikilink update infrastructure while extending rename functionality to include filename synchronization. The result will be a more intuitive and consistent note management system where titles and filenames remain synchronized, and all references are automatically maintained.