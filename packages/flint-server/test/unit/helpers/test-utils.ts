/**
 * Shared test utilities for flint-note unit tests
 *
 * Provides common setup/teardown functions and test data creators
 * to reduce duplication across test files.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Workspace } from '../../../src/core/workspace.ts';
import { NoteManager } from '../../../src/core/notes.ts';
import { NoteTypeManager } from '../../../src/core/note-types.ts';
import { LinkManager } from '../../../src/core/links.ts';
import { ConfigManager } from '../../../src/utils/config.ts';
import { FlintNoteServer } from '../../../src/server.ts';
import { HybridSearchManager } from '../../../src/database/search-manager.ts';

/**
 * Test context containing all managers and workspace info
 */
export interface TestContext {
  tempDir: string;
  workspace: Workspace;
  noteManager: NoteManager;
  noteTypeManager: NoteTypeManager;
  searchManager: HybridSearchManager;
  linkManager: LinkManager;
  configManager: ConfigManager;
  hybridSearchManager: HybridSearchManager;
}

/**
 * Test context for server-related tests
 */
export interface ServerTestContext {
  tempDir: string;
  server: FlintNoteServer;
}

/**
 * Creates a unique temporary directory name for tests
 */
export function createTempDirName(prefix = 'flint-note-test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return join(tmpdir(), `${prefix}-${timestamp}-${random}`);
}

/**
 * Creates and initializes a test workspace with all managers
 */
export async function createTestWorkspace(prefix?: string): Promise<TestContext> {
  const tempDir = createTempDirName(prefix);
  await fs.mkdir(tempDir, { recursive: true });

  // Create basic workspace structure
  await fs.mkdir(join(tempDir, 'general'), { recursive: true });
  await fs.mkdir(join(tempDir, '.flint-note'), { recursive: true });

  const workspace = new Workspace(tempDir);
  await workspace.initialize();

  const hybridSearchManager = new HybridSearchManager(tempDir);
  const noteManager = new NoteManager(workspace, hybridSearchManager);
  const noteTypeManager = new NoteTypeManager(workspace);
  const searchManager = hybridSearchManager; // Alias for backward compatibility
  const linkManager = new LinkManager(workspace, noteManager);
  const configManager = new ConfigManager(tempDir);

  return {
    tempDir,
    workspace,
    noteManager,
    noteTypeManager,
    searchManager,
    linkManager,
    configManager,
    hybridSearchManager
  };
}

/**
 * Creates and initializes a test server with explicit workspace path
 */
export async function createTestServer(prefix?: string): Promise<ServerTestContext> {
  const tempDir = createTempDirName(prefix);
  await fs.mkdir(tempDir, { recursive: true });

  // Create basic workspace structure
  await fs.mkdir(join(tempDir, 'general'), { recursive: true });
  await fs.mkdir(join(tempDir, '.flint-note'), { recursive: true });

  const server = new FlintNoteServer({ workspacePath: tempDir, throwOnError: true });
  await server.initialize();

  return {
    tempDir,
    server
  };
}

/**
 * Cleans up a test server by removing the temporary directory
 */
export async function cleanupTestServer(context: ServerTestContext): Promise<void> {
  try {
    await fs.rm(context.tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Cleans up a test workspace by removing the temporary directory
 */
export async function cleanupTestWorkspace(context: TestContext): Promise<void> {
  try {
    await fs.rm(context.tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Creates standard test notes for testing purposes
 */
export async function createTestNotes(context: TestContext): Promise<void> {
  const { noteManager } = context;

  // Create basic test notes
  await noteManager.createNote(
    'general',
    'Test Note 1',
    'This is the first test note content.'
  );

  await noteManager.createNote(
    'general',
    'Test Note 2',
    'This is the second test note content with some keywords.'
  );

  await noteManager.createNote(
    'general',
    'Sample Document',
    'A sample document for testing search functionality.'
  );
}

/**
 * Creates and initializes a hybrid search manager for testing
 */
export async function createHybridSearchManager(
  context: TestContext
): Promise<HybridSearchManager> {
  const hybridSearch = new HybridSearchManager(context.tempDir);
  context.hybridSearchManager = hybridSearch;
  return hybridSearch;
}

/**
 * Creates test notes optimized for hybrid search testing
 */
export async function createTestNotesForHybridSearch(
  context: TestContext
): Promise<void> {
  const { workspace } = context;

  // Ensure directories exist
  await fs.mkdir(workspace.getNoteTypePath('general'), { recursive: true });
  await fs.mkdir(workspace.getNoteTypePath('book-reviews'), { recursive: true });
  await fs.mkdir(workspace.getNoteTypePath('projects'), { recursive: true });

  // Create notes with rich metadata for advanced search testing
  const bookReviewNote = `---
title: "The Pragmatic Programmer"
author: "Andy Hunt, Dave Thomas"
rating: 5
status: "completed"
genre: "programming"
pages: 352
read_date: "2024-01-10"
tags: ["programming", "best-practices", "career"]
type: "book-review"
created: "2024-01-10T10:00:00Z"
updated: "2024-01-10T10:00:00Z"
---

# The Pragmatic Programmer Review

Essential reading for any software developer.

## Key Takeaways
- Don't repeat yourself (DRY)
- Write code that writes code
- Fix broken windows
- Be a catalyst for change

## Rating: 5/5 stars
This book shaped my programming philosophy.
`;

  const projectNote = `---
title: "Authentication System"
status: "in-progress"
priority: 5
assignee: "Development Team"
start_date: "2024-01-15"
deadline: "2024-02-15"
tags: ["backend", "security", "authentication"]
type: "project"
created: "2024-01-15T09:00:00Z"
updated: "2024-01-22T16:30:00Z"
---

# Authentication System Implementation

Building secure user authentication for the application.

## Requirements
- JWT token-based authentication
- Multi-factor authentication support
- Password strength validation
- Session management

## Progress
Currently implementing the JWT token system.
`;

  const meetingNote = `---
title: "Architecture Review Meeting"
date: "2024-01-20"
attendees: ["Alice", "Bob", "Charlie", "Diana"]
meeting_type: "review"
duration: 90
status: "completed"
tags: ["architecture", "review", "team"]
type: "meeting"
created: "2024-01-20T14:00:00Z"
updated: "2024-01-20T15:30:00Z"
---

# Architecture Review Meeting

## Decisions Made
- Adopt microservices architecture
- Use PostgreSQL for primary database
- Implement event-driven communication

## Action Items
- Create service boundaries document
- Set up development environment
- Schedule follow-up meeting
`;

  await fs.writeFile(
    workspace.getNotePath('book-reviews', 'pragmatic-programmer.md'),
    bookReviewNote,
    'utf8'
  );
  await fs.writeFile(
    workspace.getNotePath('projects', 'auth-system-project.md'),
    projectNote,
    'utf8'
  );
  await fs.writeFile(
    workspace.getNotePath('general', 'architecture-meeting.md'),
    meetingNote,
    'utf8'
  );
}

/**
 * Creates test notes with metadata for testing metadata functionality
 */
export async function createTestNotesWithMetadata(context: TestContext): Promise<void> {
  const { workspace } = context;

  // Ensure directories exist
  await fs.mkdir(workspace.getNoteTypePath('general'), { recursive: true });
  await fs.mkdir(workspace.getNoteTypePath('book-reviews'), { recursive: true });

  // Create a note with YAML frontmatter
  const noteWithMetadata = `---
title: "Book Review: Atomic Habits"
author: "James Clear"
rating: 5
status: "completed"
tags: ["productivity", "habits", "self-improvement"]
type: "book-review"
created: "2024-01-15T10:30:00Z"
updated: "2024-01-15T10:30:00Z"
---

# Atomic Habits Review

This book provides excellent insights into habit formation and breaking bad habits.

## Key Takeaways
- Small changes compound over time
- Focus on systems, not goals
- Environment design is crucial
`;

  const notePath = workspace.getNotePath('book-reviews', 'atomic-habits-review.md');
  await fs.writeFile(notePath, noteWithMetadata, 'utf8');

  // Create a todo note with different metadata structure
  const todoNote = `---
title: "Complete Project Setup"
type: "todo"
status: "in-progress"
priority: 3
assignee: "Alice"
due_date: "2024-02-01"
tags: ["setup", "project", "urgent"]
created: "2024-01-10T08:00:00Z"
updated: "2024-01-20T12:00:00Z"
---

# Project Setup Tasks

High priority project setup tasks that need completion.

## Checklist
- [x] Initialize repository
- [x] Set up development environment
- [ ] Configure CI/CD pipeline
- [ ] Write initial documentation
- [ ] Set up testing framework

## Notes
This is critical for the project launch timeline.
`;

  const todoNotePath = workspace.getNotePath('general', 'project-setup-todo.md');
  await fs.writeFile(todoNotePath, todoNote, 'utf8');

  // Create another note with different metadata
  const anotherNoteWithMetadata = `---
title: "Project Planning Notes"
project: "flint-note"
priority: "high"
status: "in-progress"
tags: ["planning", "development"]
type: "project-note"
created: "2024-01-16T09:00:00Z"
updated: "2024-01-16T09:00:00Z"
---

# Project Planning

Planning notes for the flint-note project development.

## Next Steps
- Implement search functionality
- Add metadata validation
- Create comprehensive tests
`;

  const projectNotePath = workspace.getNotePath('general', 'project-planning.md');
  await fs.writeFile(projectNotePath, anotherNoteWithMetadata, 'utf8');
}

/**
 * Creates test note types with descriptions and schemas
 */
export async function createTestNoteTypes(context: TestContext): Promise<void> {
  const { workspace } = context;

  // Ensure additional note types exist
  await workspace.ensureNoteType('projects');
  await workspace.ensureNoteType('meetings');
  await workspace.ensureNoteType('book-reviews');

  // Create book-reviews note type with schema
  const bookReviewDescription = `# Book Reviews

## Purpose
Track and review books I've read with structured metadata.

## Agent Instructions
- Always include rating and key takeaways
- Categorize by genre when possible
- Note actionable insights

## Metadata Schema
Expected frontmatter or metadata fields for this note type:
- title: Book title (required, string)
- author: Author name (required, string)
- rating: Personal rating (required, number, min: 1, max: 5)
- status: Reading status (required, string, enum: ["to-read", "reading", "completed"])
- genre: Book genre (optional, string)
- isbn: ISBN number (optional, string, pattern: "^[0-9-]{10,17}$")
- tags: Topic tags (optional, array)
- notes: Personal notes (optional, string)


`;

  const bookReviewPath = workspace.getNoteTypePath('book-reviews');
  const descriptionPath = join(bookReviewPath, '_description.md');
  await fs.writeFile(descriptionPath, bookReviewDescription, 'utf8');
}

/**
 * Common assertions for testing core classes
 */
export class TestAssertions {
  /**
   * Assert that all core classes can be imported and instantiated
   */
  static assertCoreClassesImportable(context: TestContext): void {
    const {
      workspace,
      noteManager,
      noteTypeManager,
      searchManager,
      linkManager,
      configManager
    } = context;

    if (!(workspace instanceof Workspace)) {
      throw new Error('Workspace should be importable and instantiable');
    }
    if (!(noteManager instanceof NoteManager)) {
      throw new Error('NoteManager should be importable and instantiable');
    }
    if (!(noteTypeManager instanceof NoteTypeManager)) {
      throw new Error('NoteTypeManager should be importable and instantiable');
    }
    if (!(searchManager instanceof HybridSearchManager)) {
      throw new Error('HybridSearchManager should be importable and instantiable');
    }
    if (!(linkManager instanceof LinkManager)) {
      throw new Error('LinkManager should be importable and instantiable');
    }
    if (!(configManager instanceof ConfigManager)) {
      throw new Error('ConfigManager should be importable and instantiable');
    }
  }

  /**
   * Assert workspace paths are created correctly
   */
  static assertWorkspacePaths(workspace: Workspace): void {
    const typePath = workspace.getNoteTypePath('general');
    if (!typePath.includes('general')) {
      throw new Error('Should create correct note type path');
    }

    const notePath = workspace.getNotePath('general', 'test.md');
    if (!notePath.includes('general') || !notePath.includes('test.md')) {
      throw new Error('Should create correct note path with filename');
    }
  }

  /**
   * Assert workspace path validation works correctly
   */
  static assertWorkspacePathValidation(workspace: Workspace, tempDir: string): void {
    const validPath = join(tempDir, 'general', 'note.md');
    if (!workspace.isPathInWorkspace(validPath)) {
      throw new Error('Should accept path in workspace');
    }

    if (workspace.isPathInWorkspace('/etc/passwd')) {
      throw new Error('Should reject path outside workspace');
    }
  }
}

/**
 * Test data constants
 */
export const TEST_CONSTANTS = {
  SAMPLE_NOTES: {
    BASIC: {
      title: 'Sample Note',
      content: 'This is a sample note for testing purposes.'
    },
    WITH_METADATA: {
      title: 'Note with Metadata',
      content: `---
title: "Test Note"
tags: ["test", "sample"]
created: "2024-01-01T00:00:00Z"
---

# Test Note

This note has metadata in the frontmatter.`
    }
  },

  NOTE_TYPES: {
    DEFAULT: 'general',
    PROJECT: 'projects',
    MEETING: 'meetings',
    BOOK_REVIEW: 'book-reviews'
  },

  SEARCH_TERMS: {
    SIMPLE: 'test',
    REGEX: '\\b(test|sample)\\b',
    PARTIAL: 'sam'
  },

  HYBRID_SEARCH: {
    METADATA_FILTERS: {
      STATUS_COMPLETED: { key: 'status', value: 'completed' },
      HIGH_PRIORITY: { key: 'priority', operator: '>=', value: '4' },
      RECENT_UPDATES: '7d',
      BOOK_REVIEWS: { key: 'type', value: 'book-review' }
    },

    SQL_QUERIES: {
      BASIC_SELECT: 'SELECT * FROM notes WHERE type = ?',
      JOIN_METADATA: `
        SELECT n.*, m.value as metadata_value
        FROM notes n
        JOIN note_metadata m ON n.id = m.note_id
        WHERE m.key = ? AND m.value = ?
      `,
      AGGREGATION: `
        SELECT type, COUNT(*) as count, AVG(CAST(m.value AS REAL)) as avg_rating
        FROM notes n
        LEFT JOIN note_metadata m ON n.id = m.note_id AND m.key = 'rating'
        GROUP BY type
      `
    }
  }
} as const;
