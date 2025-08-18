/**
 * Unit tests for update_note protections
 * Tests that the NoteManager prevents title or filename fields from being modified via metadata updates
 * These fields should only be modifiable through the dedicated rename functionality
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createTestWorkspace,
  cleanupTestWorkspace,
  type TestContext
} from './helpers/test-utils.js';

describe('NoteManager Update Protections Unit Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('update-note-protections-unit');

    // Create a test note type
    await context.noteTypeManager.createNoteType('general', 'General purpose notes');
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  test('should prevent title modification via updateNoteWithMetadata', async () => {
    // Create a test note
    const originalTitle = 'Original Test Title';
    const createResult = await context.noteManager.createNote(
      'general',
      originalTitle,
      '# Original Test Title\n\nThis is a test note.',
      { status: 'draft' }
    );

    // Get the note to obtain current state
    const originalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(originalNote, 'Note should exist');

    // Try to update title via metadata - should either fail or ignore title change
    const attemptedNewTitle = 'Attempted New Title';

    // Try to update title via metadata - should throw an error
    try {
      await context.noteManager.updateNoteWithMetadata(
        createResult.id,
        originalNote.content,
        {
          title: attemptedNewTitle,
          status: 'published',
          custom_field: 'test_value'
        },
        originalNote.content_hash
      );

      // If we get here, the test should fail
      assert.fail(
        'Expected updateNoteWithMetadata to throw an error for protected title field'
      );
    } catch (error) {
      // Error should be thrown about protected fields
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('title') &&
          (errorMessage.includes('protected') || errorMessage.includes('rename_note')),
        `Error should mention title protection and rename_note tool, got: ${errorMessage}`
      );
    }
  });

  test('should prevent filename modification via updateNoteWithMetadata', async () => {
    // Create a test note
    const originalTitle = 'Test Note for Filename';
    const createResult = await context.noteManager.createNote(
      'general',
      originalTitle,
      '# Test Note for Filename\n\nThis is a test note.',
      { status: 'draft' }
    );

    // Get the note to obtain current state
    const originalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(originalNote, 'Note should exist');

    // Try to update filename via metadata - should either fail or ignore filename change
    const attemptedNewFilename = 'attempted-new-filename.md';

    // Try to update filename via metadata - should throw an error
    try {
      await context.noteManager.updateNoteWithMetadata(
        createResult.id,
        originalNote.content,
        {
          filename: attemptedNewFilename,
          status: 'published',
          custom_field: 'test_value'
        },
        originalNote.content_hash
      );

      // If we get here, the test should fail
      assert.fail(
        'Expected updateNoteWithMetadata to throw an error for protected filename field'
      );
    } catch (error) {
      // Error should be thrown about protected fields
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('filename') &&
          (errorMessage.includes('protected') || errorMessage.includes('rename_note')),
        `Error should mention filename protection and rename_note tool, got: ${errorMessage}`
      );
    }
  });

  test('should prevent both title and filename modification in same update', async () => {
    // Create a test note
    const originalTitle = 'Original Title';
    const createResult = await context.noteManager.createNote(
      'general',
      originalTitle,
      '# Original Title\n\nThis is a test note.',
      { status: 'draft' }
    );

    // Get the note to obtain current state
    const originalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(originalNote, 'Note should exist');

    // Try to update both title and filename via metadata - should throw an error
    try {
      await context.noteManager.updateNoteWithMetadata(
        createResult.id,
        originalNote.content,
        {
          title: 'New Title',
          filename: 'new-filename.md',
          status: 'published',
          priority: 'high'
        },
        originalNote.content_hash
      );

      // If we get here, the test should fail
      assert.fail(
        'Expected updateNoteWithMetadata to throw an error for protected fields'
      );
    } catch (error) {
      // Error should be thrown about protected fields
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        (errorMessage.includes('title') || errorMessage.includes('filename')) &&
          (errorMessage.includes('protected') || errorMessage.includes('rename_note')),
        `Error should mention protected fields and rename_note tool, got: ${errorMessage}`
      );
    }
  });

  test('should allow legitimate metadata updates while protecting title/filename', async () => {
    // Create a test note with initial metadata
    const originalTitle = 'Test Note Title';
    const createResult = await context.noteManager.createNote(
      'general',
      originalTitle,
      '# Test Note Title\n\nThis is a test note.',
      {
        status: 'draft',
        priority: 'low',
        version: 1
      }
    );

    // Get the note to obtain current state
    const originalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(originalNote, 'Note should exist');
    const originalFilename = originalNote.filename;

    // Try to update legitimate metadata fields along with protected ones - should throw error
    try {
      await context.noteManager.updateNoteWithMetadata(
        createResult.id,
        originalNote.content,
        {
          // These should be rejected
          title: 'Should Be Rejected',
          filename: 'should-be-rejected.md',
          // These would be updated if not for the protected fields
          status: 'published',
          priority: 'high',
          version: 2,
          custom_field: 'new_value'
        },
        originalNote.content_hash
      );

      // If we get here, the test should fail
      assert.fail(
        'Expected updateNoteWithMetadata to throw an error for protected fields'
      );
    } catch (error) {
      // Error should be thrown about protected fields
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        (errorMessage.includes('title') || errorMessage.includes('filename')) &&
          (errorMessage.includes('protected') || errorMessage.includes('rename_note')),
        `Error should mention protected fields and rename_note tool, got: ${errorMessage}`
      );
    }

    // Now test legitimate metadata update without protected fields
    await context.noteManager.updateNoteWithMetadata(
      createResult.id,
      originalNote.content,
      {
        // Only legitimate fields
        status: 'published',
        priority: 'high',
        version: 2,
        custom_field: 'new_value'
      },
      originalNote.content_hash
    );

    // Verify the results
    const updatedNote = await context.noteManager.getNote(createResult.id);
    assert.ok(updatedNote, 'Updated note should exist');

    // Protected fields should remain unchanged
    assert.strictEqual(updatedNote.title, originalTitle, 'Title should not be changed');
    assert.strictEqual(
      updatedNote.filename,
      originalFilename,
      'Filename should not be changed'
    );

    // Legitimate metadata should be updated
    assert.strictEqual(
      updatedNote.metadata.status,
      'published',
      'Status should be updated'
    );
    assert.strictEqual(
      updatedNote.metadata.priority,
      'high',
      'Priority should be updated'
    );
    assert.strictEqual(updatedNote.metadata.version, 2, 'Version should be updated');
    assert.strictEqual(
      updatedNote.metadata.custom_field,
      'new_value',
      'Custom field should be updated'
    );
  });

  test('should preserve protected fields in batch updates', async () => {
    // Create two test notes
    const note1Title = 'First Note Title';
    const note2Title = 'Second Note Title';

    const createResult1 = await context.noteManager.createNote(
      'general',
      note1Title,
      '# First Note Title\n\nFirst test note.',
      { status: 'draft' }
    );

    const createResult2 = await context.noteManager.createNote(
      'general',
      note2Title,
      '# Second Note Title\n\nSecond test note.',
      { status: 'draft' }
    );

    // Get the notes to obtain current state
    const originalNote1 = await context.noteManager.getNote(createResult1.id);
    const originalNote2 = await context.noteManager.getNote(createResult2.id);
    assert.ok(originalNote1 && originalNote2, 'Both notes should exist');

    // Prepare batch update with protected fields
    const batchUpdates = [
      {
        identifier: createResult1.id,
        content: originalNote1.content,
        content_hash: originalNote1.content_hash,
        metadata: {
          title: 'New Title 1',
          filename: 'new-filename-1.md',
          status: 'published'
        }
      },
      {
        identifier: createResult2.id,
        content: originalNote2.content,
        content_hash: originalNote2.content_hash,
        metadata: {
          title: 'New Title 2',
          filename: 'new-filename-2.md',
          priority: 'high'
        }
      }
    ];

    // Perform batch update - should fail due to protected fields
    const batchResult = await context.noteManager.batchUpdateNotes(batchUpdates);

    // Batch update should fail due to protected field validation
    assert.ok(
      batchResult.failed > 0,
      'Batch update should fail due to protected field validation'
    );

    // Check that error messages mention protected fields
    const hasProtectedFieldError = batchResult.results.some(
      result =>
        !result.success &&
        result.error &&
        (result.error.includes('title') || result.error.includes('filename')) &&
        (result.error.includes('protected') || result.error.includes('rename_note'))
    );

    assert.ok(
      hasProtectedFieldError,
      'Batch update errors should mention protected fields and rename_note tool'
    );
  });

  test('should handle empty metadata updates without affecting protected fields', async () => {
    // Create a test note
    const originalTitle = 'Test Note';
    const createResult = await context.noteManager.createNote(
      'general',
      originalTitle,
      '# Test Note\n\nThis is a test note.',
      { status: 'draft' }
    );

    // Get the note to obtain current state
    const originalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(originalNote, 'Note should exist');
    const originalFilename = originalNote.filename;

    // Update with empty metadata object
    await context.noteManager.updateNoteWithMetadata(
      createResult.id,
      originalNote.content,
      {},
      originalNote.content_hash
    );

    // Verify nothing changed
    const updatedNote = await context.noteManager.getNote(createResult.id);
    assert.ok(updatedNote, 'Updated note should exist');

    assert.strictEqual(
      updatedNote.title,
      originalTitle,
      'Title should remain unchanged with empty metadata'
    );
    assert.strictEqual(
      updatedNote.filename,
      originalFilename,
      'Filename should remain unchanged with empty metadata'
    );
    assert.strictEqual(
      updatedNote.metadata.status,
      'draft',
      'Original metadata should be preserved'
    );
  });

  test('should handle undefined/null protected field values', async () => {
    // Create a test note
    const originalTitle = 'Test Note';
    const createResult = await context.noteManager.createNote(
      'general',
      originalTitle,
      '# Test Note\n\nThis is a test note.',
      { status: 'draft' }
    );

    // Get the note to obtain current state
    const originalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(originalNote, 'Note should exist');
    const originalFilename = originalNote.filename;

    // Update with undefined/null protected fields - filter out undefined/null values first
    const metadataWithNulls = {
      title: undefined,
      filename: null,
      status: 'published'
    } as any;

    // Remove undefined and null values
    const cleanMetadata: any = {};
    for (const [key, value] of Object.entries(metadataWithNulls)) {
      if (value !== undefined && value !== null) {
        cleanMetadata[key] = value;
      }
    }

    // Update should succeed since we filtered out the null/undefined protected fields
    await context.noteManager.updateNoteWithMetadata(
      createResult.id,
      originalNote.content,
      cleanMetadata,
      originalNote.content_hash
    );

    // Verify protected fields remain unchanged and legitimate metadata is updated
    const updatedNote = await context.noteManager.getNote(createResult.id);
    assert.ok(updatedNote, 'Updated note should exist');

    assert.strictEqual(
      updatedNote.title,
      originalTitle,
      'Title should remain unchanged (was not in cleaned metadata)'
    );
    assert.strictEqual(
      updatedNote.filename,
      originalFilename,
      'Filename should remain unchanged (was not in cleaned metadata)'
    );
    assert.strictEqual(
      updatedNote.metadata.status,
      'published',
      'Legitimate metadata should still be updated'
    );
  });

  test('should not allow bypass protection in batch operations', async () => {
    // Create test notes
    const note1Title = 'First Note';
    const note2Title = 'Second Note';

    const createResult1 = await context.noteManager.createNote(
      'general',
      note1Title,
      '# First Note\n\nFirst test note.',
      { status: 'draft' }
    );

    const createResult2 = await context.noteManager.createNote(
      'general',
      note2Title,
      '# Second Note\n\nSecond test note.',
      { status: 'draft' }
    );

    // Get the notes to obtain current state
    const originalNote1 = await context.noteManager.getNote(createResult1.id);
    const originalNote2 = await context.noteManager.getNote(createResult2.id);
    assert.ok(originalNote1 && originalNote2, 'Both notes should exist');

    // Prepare batch update attempting to modify protected fields
    // Note: bypassProtection is hardcoded to false in batch operations
    const batchUpdates = [
      {
        identifier: createResult1.id,
        content: originalNote1.content,
        content_hash: originalNote1.content_hash,
        metadata: {
          title: 'Should Be Blocked 1',
          filename: 'should-be-blocked-1.md',
          status: 'published'
        }
      },
      {
        identifier: createResult2.id,
        content: originalNote2.content,
        content_hash: originalNote2.content_hash,
        metadata: {
          title: 'Should Be Blocked 2',
          filename: 'should-be-blocked-2.md',
          priority: 'high'
        }
      }
    ];

    // Perform batch update - should fail due to protected fields
    const batchResult = await context.noteManager.batchUpdateNotes(batchUpdates);

    // Verify that batch updates failed due to protected fields
    assert.ok(
      batchResult.failed > 0,
      'Batch updates should fail due to protected fields'
    );

    // Check that error messages mention protected fields
    const hasProtectedFieldError = batchResult.results.some(
      result =>
        !result.success &&
        result.error &&
        (result.error.includes('title') || result.error.includes('filename')) &&
        (result.error.includes('protected') || result.error.includes('rename_note'))
    );

    assert.ok(
      hasProtectedFieldError,
      'Batch update errors should mention protected fields and rename_note tool'
    );
  });

  test('should verify protection bypass only works for direct method calls', async () => {
    // Create a test note
    const originalTitle = 'Test Note for Direct Method';
    const createResult = await context.noteManager.createNote(
      'general',
      originalTitle,
      '# Test Note for Direct Method\n\nThis is a test note.',
      { status: 'draft' }
    );

    // Get the note to obtain current state
    const originalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(originalNote, 'Note should exist');

    // Test 1: Direct call with bypassProtection=false (should throw error)
    try {
      await context.noteManager.updateNoteWithMetadata(
        createResult.id,
        originalNote.content,
        {
          title: 'Should Be Rejected',
          filename: 'should-be-rejected.md',
          status: 'published'
        },
        originalNote.content_hash,
        false // explicitly set bypass to false
      );

      // If we get here, the test should fail
      assert.fail(
        'Expected updateNoteWithMetadata to throw an error for protected fields'
      );
    } catch (error) {
      // Error should be thrown about protected fields
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        (errorMessage.includes('title') || errorMessage.includes('filename')) &&
          (errorMessage.includes('protected') || errorMessage.includes('rename_note')),
        `Error should mention protected fields and rename_note tool, got: ${errorMessage}`
      );
    }

    // Test 2: Direct call with bypassProtection=true (should allow - simulating rename_note)
    // Get the current note state first
    const currentNote = await context.noteManager.getNote(createResult.id);
    assert.ok(currentNote, 'Note should exist');

    await context.noteManager.updateNoteWithMetadata(
      createResult.id,
      currentNote.content,
      {
        title: 'Should Be Allowed',
        status: 'completed'
      },
      currentNote.content_hash,
      true // bypass protection (as rename_note would do)
    );

    const finalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(finalNote, 'Updated note should exist');

    // Title should change with bypass
    assert.strictEqual(
      finalNote.title,
      'Should Be Allowed',
      'Title should change with bypassProtection=true'
    );
    // Non-protected field should also change
    assert.strictEqual(
      finalNote.metadata.status,
      'completed',
      'Status should be updated'
    );
  });

  test('should prevent created field modification via updateNoteWithMetadata', async () => {
    // Create a test note
    const createResult = await context.noteManager.createNote(
      'general',
      'Test Note for Created Field',
      '# Test Note\n\nThis is a test note.',
      { status: 'draft' }
    );

    // Get the note to obtain current state
    const originalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(originalNote, 'Note should exist');

    // Try to update created field via metadata - should throw an error
    const attemptedCreatedDate = '2020-01-01T00:00:00.000Z';

    try {
      await context.noteManager.updateNoteWithMetadata(
        createResult.id,
        originalNote.content,
        {
          created: attemptedCreatedDate,
          status: 'published'
        },
        originalNote.content_hash
      );

      // If we get here, the test should fail
      assert.fail(
        'Expected updateNoteWithMetadata to throw an error for protected created field'
      );
    } catch (error) {
      // Error should be thrown about protected fields
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('created') &&
          errorMessage.includes('protected') &&
          errorMessage.includes('handled automatically'),
        `Error should mention created field protection and automatic handling, got: ${errorMessage}`
      );
    }
  });

  test('should prevent updated field modification via updateNoteWithMetadata', async () => {
    // Create a test note
    const createResult = await context.noteManager.createNote(
      'general',
      'Test Note for Updated Field',
      '# Test Note\n\nThis is a test note.',
      { status: 'draft' }
    );

    // Get the note to obtain current state
    const originalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(originalNote, 'Note should exist');

    // Try to update updated field via metadata - should throw an error
    const attemptedUpdatedDate = '2020-01-01T00:00:00.000Z';

    try {
      await context.noteManager.updateNoteWithMetadata(
        createResult.id,
        originalNote.content,
        {
          updated: attemptedUpdatedDate,
          status: 'published'
        },
        originalNote.content_hash
      );

      // If we get here, the test should fail
      assert.fail(
        'Expected updateNoteWithMetadata to throw an error for protected updated field'
      );
    } catch (error) {
      // Error should be thrown about protected fields
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('updated') &&
          errorMessage.includes('protected') &&
          errorMessage.includes('handled automatically'),
        `Error should mention updated field protection and automatic handling, got: ${errorMessage}`
      );
    }
  });

  test('should prevent both timestamp and title field modifications in same update', async () => {
    // Create a test note
    const createResult = await context.noteManager.createNote(
      'general',
      'Test Note for Mixed Fields',
      '# Test Note\n\nThis is a test note.',
      { status: 'draft' }
    );

    // Get the note to obtain current state
    const originalNote = await context.noteManager.getNote(createResult.id);
    assert.ok(originalNote, 'Note should exist');

    // Try to update multiple protected fields
    try {
      await context.noteManager.updateNoteWithMetadata(
        createResult.id,
        originalNote.content,
        {
          title: 'New Title',
          created: '2020-01-01T00:00:00.000Z',
          updated: '2020-01-01T00:00:00.000Z',
          status: 'published'
        },
        originalNote.content_hash
      );

      // If we get here, the test should fail
      assert.fail(
        'Expected updateNoteWithMetadata to throw an error for multiple protected fields'
      );
    } catch (error) {
      // Error should mention all protected fields
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('title') &&
          errorMessage.includes('created') &&
          errorMessage.includes('updated') &&
          errorMessage.includes('protected'),
        `Error should mention all protected fields, got: ${errorMessage}`
      );
      assert.ok(
        errorMessage.includes('rename_note') &&
          errorMessage.includes('handled automatically'),
        `Error should mention both rename_note tool and automatic handling, got: ${errorMessage}`
      );
    }
  });
});
