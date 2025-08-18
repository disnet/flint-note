/**
 * Integration tests for rename_note functionality
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import { Workspace } from '../../../src/core/workspace.js';
import { NoteManager } from '../../../src/core/notes.js';
import { HybridSearchManager } from '../../../src/database/search-manager.js';

describe('rename_note with automatic wikilink updates', () => {
  let tempDir: string;
  let workspace: Workspace;
  let noteManager: NoteManager;
  let searchManager: HybridSearchManager;

  before(async () => {
    // Create temporary directory for testing
    tempDir = await mkdtemp(join(tmpdir(), 'flint-note-wikilinks-test-'));

    // Initialize workspace and managers
    workspace = new Workspace(tempDir);
    await workspace.initialize();

    searchManager = new HybridSearchManager(tempDir);
    noteManager = new NoteManager(workspace, searchManager);
  });

  after(async () => {
    // Clean up temporary directory
    await searchManager?.close();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should update wikilinks automatically', async () => {
    // Create the target note to be renamed
    const targetNote = await noteManager.createNote(
      'reading',
      'Original Book Title',
      '# Original Book Title\n\nThis is a book about something important.',
      {
        author: 'Test Author',
        rating: 5
      }
    );

    // Create linking notes with different wikilink patterns
    const linkingNote1 = await noteManager.createNote(
      'daily',
      'Daily Note 1',
      `# Daily Note 1

Here are some references:
- I read [[Original Book Title]] today
- The insights from [[reading/${targetNote.filename}|Original Book Title]] were amazing
- Also mentioned in [[Original Book Title|this great book]]

Some other content here.`,
      {}
    );

    const linkingNote2 = await noteManager.createNote(
      'projects',
      'Research Project',
      `# Research Project

Bibliography:
- [[Original Book Title]] - primary source
- [[reading/${targetNote.filename}|Custom Display Text]] - should not change

Notes about [[Original Book Title]]:
- Very insightful`,
      {}
    );

    // Get content hashes
    const targetNoteWithHash = await noteManager.getNote(
      `reading/${targetNote.filename}`
    );
    assert(targetNoteWithHash);

    // Rename the note (wikilinks updated automatically)
    const renameResult = await noteManager.renameNote(
      `reading/${targetNote.filename}`,
      'New Book Title',
      targetNoteWithHash.content_hash
    );

    assert(renameResult.success);

    // Verify the target note was renamed
    const renamedNote = await noteManager.getNote(`reading/${targetNote.filename}`);
    assert(renamedNote);
    assert.strictEqual(renamedNote.title, 'New Book Title');

    // Verify linking notes were updated correctly
    const updatedLinkingNote1 = await noteManager.getNote(
      `daily/${linkingNote1.filename}`
    );
    assert(updatedLinkingNote1);

    const expectedContent1 = `# Daily Note 1

Here are some references:
- I read [[New Book Title]] today
- The insights from [[reading/${targetNote.filename}|New Book Title]] were amazing
- Also mentioned in [[New Book Title|this great book]]

Some other content here.`;

    assert.strictEqual(updatedLinkingNote1.content, expectedContent1);

    const updatedLinkingNote2 = await noteManager.getNote(
      `projects/${linkingNote2.filename}`
    );
    assert(updatedLinkingNote2);

    const expectedContent2 = `# Research Project

Bibliography:
- [[New Book Title]] - primary source
- [[reading/${targetNote.filename}|Custom Display Text]] - should not change

Notes about [[New Book Title]]:
- Very insightful`;

    assert.strictEqual(updatedLinkingNote2.content, expectedContent2);

    // Verify link extraction was updated in database
    const db = await searchManager.getDatabaseConnection();
    const links = await db.all(
      'SELECT * FROM note_links WHERE target_title = ? OR target_title = ?',
      ['Original Book Title', 'New Book Title']
    );

    // Should have links pointing to the new title
    const newTitleLinks = links.filter(
      (link: any) => link.target_title === 'New Book Title'
    );
    assert(newTitleLinks.length > 0, 'Should have links with new title');

    // Should not have any links with the old title
    const oldTitleLinks = links.filter(
      (link: any) => link.target_title === 'Original Book Title'
    );
    assert.strictEqual(oldTitleLinks.length, 0, 'Should not have links with old title');
  });

  it('should update all wikilinks automatically (no opt-out)', async () => {
    // Create the target note to be renamed
    const targetNote = await noteManager.createNote(
      'reading',
      'Another Original Title',
      '# Another Original Title\n\nAnother book content.',
      {}
    );

    // Create linking note
    const linkingNote = await noteManager.createNote(
      'daily',
      'Daily Note 2',
      `# Daily Note 2

Reference to [[Another Original Title]] in my notes.`,
      {}
    );

    // Get content hash
    const targetNoteWithHash = await noteManager.getNote(
      `reading/${targetNote.filename}`
    );
    assert(targetNoteWithHash);

    // Rename the note (wikilinks updated automatically)
    const renameResult = await noteManager.renameNote(
      `reading/${targetNote.filename}`,
      'Another New Title',
      targetNoteWithHash.content_hash
    );

    assert(renameResult.success);

    // Verify the target note was renamed
    const renamedNote = await noteManager.getNote(`reading/${targetNote.filename}`);
    assert(renamedNote);
    assert.strictEqual(renamedNote.title, 'Another New Title');

    // Verify linking note was updated
    const updatedLinkingNote = await noteManager.getNote(`daily/${linkingNote.filename}`);
    assert(updatedLinkingNote);

    const expectedContent = `# Daily Note 2

Reference to [[Another New Title]] in my notes.`;
    assert.strictEqual(updatedLinkingNote.content, expectedContent);
  });

  it('should handle edge cases in wikilink patterns', async () => {
    // Create target note
    const targetNote = await noteManager.createNote(
      'reading',
      'Edge Case Book',
      '# Edge Case Book\n\nContent here.',
      {}
    );

    // Create note with various edge cases
    const edgeCaseNote = await noteManager.createNote(
      'daily',
      'Edge Cases',
      `# Edge Cases

Different patterns:
- [[Edge Case Book]] - simple reference
- [[reading/${targetNote.filename}|Edge Case Book]] - with type and same display
- [[Edge Case Book|Different Display]] - with different display
- [[reading/${targetNote.filename}|Keep This Custom]] - custom display should be preserved for type/filename format
- [[Some Other Note|Edge Case Book]] - reference to different note with matching display text (should not change)

Not a wikilink: Edge Case Book in plain text.`,
      {}
    );

    // Get content hash
    const targetNoteWithHash = await noteManager.getNote(
      `reading/${targetNote.filename}`
    );
    assert(targetNoteWithHash);

    // Rename (wikilinks updated automatically)
    await noteManager.renameNote(
      `reading/${targetNote.filename}`,
      'Updated Edge Case',
      targetNoteWithHash.content_hash
    );

    // Check updated content
    const updatedNote = await noteManager.getNote(`daily/${edgeCaseNote.filename}`);
    assert(updatedNote);

    const expectedContent = `# Edge Cases

Different patterns:
- [[Updated Edge Case]] - simple reference
- [[reading/${targetNote.filename}|Updated Edge Case]] - with type and same display
- [[Updated Edge Case|Different Display]] - with different display
- [[reading/${targetNote.filename}|Keep This Custom]] - custom display should be preserved for type/filename format
- [[Some Other Note|Edge Case Book]] - reference to different note with matching display text (should not change)

Not a wikilink: Edge Case Book in plain text.`;

    assert.strictEqual(updatedNote.content, expectedContent);
  });

  it('should handle rename operations within transactions safely', async () => {
    // Create multiple notes that reference the same target
    const targetNote = await noteManager.createNote(
      'reading',
      'Transaction Test Book',
      '# Transaction Test Book\n\nContent.',
      {}
    );

    const referencingNotes = [];
    for (let i = 0; i < 5; i++) {
      const note = await noteManager.createNote(
        'daily',
        `Reference Note ${i}`,
        `# Reference Note ${i}\n\nMentions [[Transaction Test Book]] here.`,
        {}
      );
      referencingNotes.push(note);
    }

    // Get content hash
    const targetNoteWithHash = await noteManager.getNote(
      `reading/${targetNote.filename}`
    );
    assert(targetNoteWithHash);

    // Rename (should handle multiple note updates safely)
    const renameResult = await noteManager.renameNote(
      `reading/${targetNote.filename}`,
      'Transaction Safe Title',
      targetNoteWithHash.content_hash
    );

    assert(renameResult.success);

    // Verify all referencing notes were updated
    for (let i = 0; i < 5; i++) {
      const updatedNote = await noteManager.getNote(
        `daily/${referencingNotes[i].filename}`
      );
      assert(updatedNote);
      assert(updatedNote.content.includes('[[Transaction Safe Title]]'));
      assert(!updatedNote.content.includes('[[Transaction Test Book]]'));
    }

    // Verify database consistency
    const db = await searchManager.getDatabaseConnection();
    const remainingOldLinks = await db.all(
      'SELECT * FROM note_links WHERE target_title = ?',
      ['Transaction Test Book']
    );
    assert.strictEqual(remainingOldLinks.length, 0, 'No old title links should remain');

    const newLinks = await db.all('SELECT * FROM note_links WHERE target_title = ?', [
      'Transaction Safe Title'
    ]);
    assert(newLinks.length >= 5, 'Should have links with new title');
  });
});
