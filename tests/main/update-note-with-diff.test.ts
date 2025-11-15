import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolService } from '../../src/main/tool-service';
import { NoteService } from '../../src/main/note-service';
import { TestApiSetup } from '../server/api/test-setup.js';

// Mock the logger to avoid console output in tests
vi.mock('../../src/main/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('update_note_with_diff tool', () => {
  let toolService: ToolService;
  let noteService: NoteService;
  let testSetup: TestApiSetup;
  let testVaultId: string;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();

    // Create a test vault
    testVaultId = await testSetup.createTestVault('test-diff-update-vault');

    // Create the 'general' note type that tests will use
    await testSetup.api.createNoteType({
      type_name: 'general',
      description: 'General notes',
      agent_instructions: [],
      metadata_schema: { fields: [] },
      vault_id: testVaultId
    });

    // Create a real note service that wraps the test API
    noteService = {
      getFlintNoteApi: () => testSetup.api,
      getCurrentVault: async () => ({
        id: testVaultId,
        name: 'Test Vault',
        path: '',
        created: new Date().toISOString(),
        last_accessed: new Date().toISOString()
      })
    } as any;

    toolService = new ToolService(noteService);
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('basic functionality', () => {
    it('should apply a single patch to note content', async () => {
      const tools = toolService.getTools();

      // Create a note
      const createResult = await tools!.create_note.execute({
        title: 'Test Note',
        content: 'This is the original content that needs updating.',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Apply a single patch
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: 'original content',
            new_string: 'updated content'
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toBe('This is the updated content that needs updating.');
      expect(updateResult.message).toContain('Applied 1 patch');
    });

    it('should apply multiple patches in sequence', async () => {
      const tools = toolService.getTools();

      // Create a note with structured content
      const createResult = await tools!.create_note.execute({
        title: 'Multi-Patch Test',
        content: `# Section 1
First paragraph with old data.

# Section 2
Second paragraph with more old data.`,
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Apply multiple patches
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: 'Section 1',
            new_string: 'Introduction'
          },
          {
            old_string: 'Section 2',
            new_string: 'Details'
          },
          {
            old_string: 'old data',
            new_string: 'new data'
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toBe(`# Introduction
First paragraph with new data.

# Details
Second paragraph with more old data.`);
      expect(updateResult.message).toContain('Applied 3 patch');
    });

    it('should support deleting text with empty string replacement', async () => {
      const tools = toolService.getTools();

      // Create a note
      const createResult = await tools!.create_note.execute({
        title: 'Delete Test',
        content: 'This text has REMOVE_THIS some unwanted content.',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Delete text by replacing with empty string
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: 'REMOVE_THIS ',
            new_string: ''
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toBe('This text has some unwanted content.');
    });

    it('should update content and title simultaneously', async () => {
      const tools = toolService.getTools();

      // Create a note
      const createResult = await tools!.create_note.execute({
        title: 'Old Title',
        content: 'Content with old term.',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Update both content and title
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        title: 'New Title',
        patches: [
          {
            old_string: 'old term',
            new_string: 'new term'
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.title).toBe('New Title');
      expect(updatedNote.content).toBe('Content with new term.');
    });

    it('should update content and metadata simultaneously', async () => {
      const tools = toolService.getTools();

      // Create a note with metadata
      const createResult = await tools!.create_note.execute({
        title: 'Metadata Test',
        content: 'Original status: pending',
        noteType: 'general',
        metadata: { status: 'pending', priority: 'low' }
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Update content and metadata
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        metadata: { status: 'complete', priority: 'high' },
        patches: [
          {
            old_string: 'pending',
            new_string: 'complete'
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toBe('Original status: complete');
      expect(updatedNote.metadata.status).toBe('complete');
      expect(updatedNote.metadata.priority).toBe('high');
    });
  });

  describe('error handling', () => {
    it('should fail when note is not found', async () => {
      const tools = toolService.getTools();

      const result = await tools!.update_note_with_diff.execute({
        id: 'nonexistent/note',
        contentHash: 'dummy-hash',
        patches: [
          {
            old_string: 'old',
            new_string: 'new'
          }
        ]
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOTE_NOT_FOUND');
      expect(result.message).toContain('not found');
    });

    it('should fail when content hash does not match', async () => {
      const tools = toolService.getTools();

      // Create a note
      const createResult = await tools!.create_note.execute({
        title: 'Hash Test',
        content: 'Original content',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Try to update with wrong hash
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: 'wrong-hash-value',
        patches: [
          {
            old_string: 'Original',
            new_string: 'Updated'
          }
        ]
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBe('CONTENT_HASH_MISMATCH');
      expect(updateResult.message).toContain('hash mismatch');
    });

    it('should fail when old_string is not found in content', async () => {
      const tools = toolService.getTools();

      // Create a note
      const createResult = await tools!.create_note.execute({
        title: 'Patch Not Found Test',
        content: 'This content does not contain the target text.',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Try to replace non-existent text
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: 'nonexistent text',
            new_string: 'replacement'
          }
        ]
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBe('PATCH_NOT_FOUND');
      expect(updateResult.message).toContain('Could not find text to replace');
    });

    it('should fail when old_string appears multiple times (ambiguous)', async () => {
      const tools = toolService.getTools();

      // Create a note with duplicate text
      const createResult = await tools!.create_note.execute({
        title: 'Ambiguous Patch Test',
        content: 'The word test appears here. The word test appears here again.',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Try to replace ambiguous text
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: 'test',
            new_string: 'example'
          }
        ]
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBe('PATCH_AMBIGUOUS');
      expect(updateResult.message).toContain('appears');
      expect(updateResult.message).toContain('times');
    });

    it('should fail on later patches if earlier patches create ambiguity', async () => {
      const tools = toolService.getTools();

      // Create a note
      const createResult = await tools!.create_note.execute({
        title: 'Sequential Patch Test',
        content: 'First occurrence. Second item.',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Apply patches where second patch becomes ambiguous after first
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: 'Second item',
            new_string: 'First occurrence'
          },
          {
            old_string: 'First occurrence',
            new_string: 'Updated text'
          }
        ]
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBe('PATCH_AMBIGUOUS');
      expect(updateResult.message).toContain('Patch 2');
    });

    it('should provide helpful error message when patch not found due to previous patch', async () => {
      const tools = toolService.getTools();

      // Create a note
      const createResult = await tools!.create_note.execute({
        title: 'Sequential Error Test',
        content: 'Original text here.',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Apply patches where second patch targets text modified by first
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: 'Original text',
            new_string: 'Modified text'
          },
          {
            old_string: 'Original text', // This no longer exists
            new_string: 'Another change'
          }
        ]
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBe('PATCH_NOT_FOUND');
      expect(updateResult.message).toContain('Patch 2');
      expect(updateResult.message).toContain('previous patch');
    });

    it('should handle missing note service gracefully', async () => {
      const toolServiceWithoutNoteService = new ToolService(null);
      const tools = toolServiceWithoutNoteService.getTools();

      expect(tools).toBeUndefined();
    });

    it('should handle no active vault gracefully', async () => {
      const failingNoteService = {
        getFlintNoteApi: () => testSetup.api,
        getCurrentVault: async () => null
      } as any;

      const failingToolService = new ToolService(failingNoteService);
      const tools = failingToolService.getTools();

      const result = await tools!.update_note_with_diff.execute({
        id: 'any/note',
        contentHash: 'any-hash',
        patches: [{ old_string: 'old', new_string: 'new' }]
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_ACTIVE_VAULT');
    });
  });

  describe('edge cases', () => {
    it('should handle patches with special characters', async () => {
      const tools = toolService.getTools();

      // Create a note with special characters
      const createResult = await tools!.create_note.execute({
        title: 'Special Chars Test',
        content: 'Code snippet: const regex = /[a-z]+/gi;',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Replace text containing regex-like patterns
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: '/[a-z]+/gi',
            new_string: '/[A-Z]+/g'
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toBe('Code snippet: const regex = /[A-Z]+/g;');
    });

    it('should handle patches with newlines', async () => {
      const tools = toolService.getTools();

      // Create a note with multi-line content
      const createResult = await tools!.create_note.execute({
        title: 'Newline Test',
        content: `Line 1
Line 2
Line 3`,
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Replace text spanning multiple lines
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: `Line 2
Line 3`,
            new_string: `Line 2 - Modified
Line 3 - Modified`
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toBe(`Line 1
Line 2 - Modified
Line 3 - Modified`);
    });

    it('should handle empty patches array', async () => {
      const tools = toolService.getTools();

      // Create a note
      const createResult = await tools!.create_note.execute({
        title: 'Empty Patches Test',
        content: 'Original content',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Apply empty patches array (should succeed but not change content)
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: []
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toBe('Original content');
      expect(updateResult.message).toContain('Applied 0 patch');
    });

    it('should handle very long content efficiently', async () => {
      const tools = toolService.getTools();

      // Create a note with long content
      const longContent = 'Start of document.\n' + 'Middle section.\n'.repeat(1000) + 'End of document.';
      const createResult = await tools!.create_note.execute({
        title: 'Long Content Test',
        content: longContent,
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Apply a targeted patch (not replacing entire content)
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: 'Start of document.',
            new_string: 'Beginning of document.'
          },
          {
            old_string: 'End of document.',
            new_string: 'Conclusion of document.'
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toContain('Beginning of document.');
      expect(updatedNote.content).toContain('Conclusion of document.');
      expect(updatedNote.content).toContain('Middle section.');
    });

    it('should allow making text unique by providing longer context', async () => {
      const tools = toolService.getTools();

      // Create a note with repeated words
      const createResult = await tools!.create_note.execute({
        title: 'Uniqueness Test',
        content: 'First item. Second item. Third item.',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // 'item' appears 3 times, so just 'item' would be ambiguous
      // But 'Second item' is unique
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: 'Second item',
            new_string: 'Second entry'
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toBe('First item. Second entry. Third item.');
    });
  });

  describe('integration with existing update_note tool', () => {
    it('should work alongside traditional update_note tool', async () => {
      const tools = toolService.getTools();

      // Create a note
      const createResult = await tools!.create_note.execute({
        title: 'Integration Test',
        content: 'Initial content.',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Update with traditional tool
      const traditionalUpdate = await tools!.update_note.execute({
        id: note.id,
        contentHash: note.content_hash,
        content: 'Content updated traditionally.'
      });
      expect(traditionalUpdate.success).toBe(true);
      const traditionalNote = traditionalUpdate.data as any;

      // Update with diff tool
      const diffUpdate = await tools!.update_note_with_diff.execute({
        id: traditionalNote.id,
        contentHash: traditionalNote.content_hash,
        patches: [
          {
            old_string: 'traditionally',
            new_string: 'via diff'
          }
        ]
      });

      expect(diffUpdate.success).toBe(true);
      const finalNote = diffUpdate.data as any;
      expect(finalNote.content).toBe('Content updated via diff.');
    });

    it('should respect content hash validation like update_note', async () => {
      const tools = toolService.getTools();

      // Create a note
      const createResult = await tools!.create_note.execute({
        title: 'Hash Validation Test',
        content: 'Original content',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;
      const originalHash = note.content_hash;

      // Update with traditional tool
      const firstUpdate = await tools!.update_note.execute({
        id: note.id,
        contentHash: originalHash,
        content: 'Modified content'
      });
      expect(firstUpdate.success).toBe(true);

      // Try to update with diff tool using stale hash
      const staleUpdate = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: originalHash, // This is now stale
        patches: [
          {
            old_string: 'Original',
            new_string: 'Updated'
          }
        ]
      });

      expect(staleUpdate.success).toBe(false);
      expect(staleUpdate.error).toBe('CONTENT_HASH_MISMATCH');
    });
  });

  describe('practical scenarios', () => {
    it('should efficiently update large notes with small changes', async () => {
      const tools = toolService.getTools();

      // Simulate a large note (like meeting notes)
      const largeNote = `# Meeting Notes - Project Review

## Attendees
- Alice
- Bob
- Charlie

## Action Items
1. Review documentation - Status: pending
2. Update tests - Status: pending
3. Deploy to staging - Status: pending

## Discussion
${Array(50).fill('Detailed discussion paragraph.').join('\n')}

## Next Steps
Schedule follow-up meeting.`;

      const createResult = await tools!.create_note.execute({
        title: 'Project Review Meeting',
        content: largeNote,
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Update just the status of action items using targeted patches
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: '1. Review documentation - Status: pending',
            new_string: '1. Review documentation - Status: complete'
          },
          {
            old_string: '2. Update tests - Status: pending',
            new_string: '2. Update tests - Status: in progress'
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toContain('Status: complete');
      expect(updatedNote.content).toContain('Status: in progress');
      expect(updatedNote.content).toContain('3. Deploy to staging - Status: pending');
      expect(updatedNote.content).toContain('Detailed discussion paragraph.');
    });

    it('should support refactoring variable names in code snippets', async () => {
      const tools = toolService.getTools();

      const codeNote = `# Code Review Notes

## Function to refactor

\`\`\`javascript
function processUserData(userData) {
  const userName = userData.name;
  const userEmail = userData.email;
  return { userName, userEmail };
}
\`\`\`

The userData parameter needs better naming.`;

      const createResult = await tools!.create_note.execute({
        title: 'Code Review',
        content: codeNote,
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Refactor function signature
      const updateResult = await tools!.update_note_with_diff.execute({
        id: note.id,
        contentHash: note.content_hash,
        patches: [
          {
            old_string: 'function processUserData(userData)',
            new_string: 'function processUserData(user)'
          },
          {
            old_string: 'const userName = userData.name;',
            new_string: 'const userName = user.name;'
          },
          {
            old_string: 'const userEmail = userData.email;',
            new_string: 'const userEmail = user.email;'
          }
        ]
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toContain('function processUserData(user)');
      expect(updatedNote.content).toContain('user.name');
      expect(updatedNote.content).toContain('user.email');
    });
  });
});
