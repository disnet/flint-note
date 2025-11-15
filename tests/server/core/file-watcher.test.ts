/**
 * Tests for VaultFileWatcher - Internal vs External Change Detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from '../api/test-setup.js';
import fs from 'fs/promises';
import path from 'path';
import type { FileWatcherEvent } from '../../../src/server/core/file-watcher.js';

describe('VaultFileWatcher - Internal vs External Change Detection', () => {
  let testSetup: TestApiSetup;
  let vaultId: string;
  let vaultPath: string;
  let unsubscribe: (() => void) | null = null;
  const capturedEvents: FileWatcherEvent[] = [];

  beforeEach(async () => {
    testSetup = new TestApiSetup();

    // Set up with a direct vault path (single-vault mode)
    // This ensures the API's workspace, database, and file watcher all point to the same location
    vaultId = 'file-watcher-test';
    await testSetup.setupWithVault(vaultId);
    vaultPath = testSetup.testWorkspacePath; // In single-vault mode, workspace = vault

    // Subscribe to file watcher events and save the unsubscribe function
    capturedEvents.length = 0;
    unsubscribe = testSetup.api.onFileWatcherEvent((event) => {
      capturedEvents.push(event);
    });

    // Give file watcher time to start and settle
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Clear any initialization events
    capturedEvents.length = 0;
  });

  afterEach(async () => {
    // Unsubscribe from events BEFORE cleanup to avoid cross-test contamination
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    // Clean up and wait for file watcher to fully stop
    await testSetup.cleanup();

    // Give extra time for file watcher to fully stop before next test
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  describe('Internal Changes (should be ignored)', () => {
    it('should NOT trigger external-change event when Flint creates a note', async () => {
      // Create a note through Flint's API
      const note = await testSetup.api.createNote({
        type: 'general',
        title: 'Internal Create Test',
        content: 'Created by Flint',
        vaultId: vaultId
      });

      // Wait for any file watcher events to fire
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should NOT have any external change events
      const externalEvents = capturedEvents.filter((e) => e.type.startsWith('external-'));
      expect(externalEvents).toHaveLength(0);

      // Verify note was created
      const retrieved = await testSetup.api.getNote(vaultId, note.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('Internal Create Test');
    });

    it('should NOT trigger external-change event when Flint updates a note', async () => {
      // Create a note
      const note = await testSetup.api.createNote({
        type: 'general',
        title: 'Internal Update Test',
        content: 'Original content',
        vaultId: vaultId
      });

      // Clear events from creation
      await new Promise((resolve) => setTimeout(resolve, 300));
      capturedEvents.length = 0;

      // Get the note to obtain content hash
      const fullNote = await testSetup.api.getNote(vaultId, note.id);

      // Update the note through Flint's API
      await testSetup.api.updateNote({
        identifier: note.id,
        content: 'Updated content by Flint',
        contentHash: fullNote!.content_hash,
        vaultId: vaultId
      });

      // Wait for any file watcher events
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should NOT have any external change events
      const externalEvents = capturedEvents.filter((e) => e.type.startsWith('external-'));
      expect(externalEvents).toHaveLength(0);

      // Verify note was updated
      const retrieved = await testSetup.api.getNote(vaultId, note.id);
      expect(retrieved?.content).toBe('Updated content by Flint');
    });

    it('should NOT trigger external-change event when Flint updates metadata', async () => {
      // Create a note
      const note = await testSetup.api.createNote({
        type: 'general',
        title: 'Metadata Test',
        content: 'Test content',
        vaultId: vaultId
      });

      // Clear events from creation
      await new Promise((resolve) => setTimeout(resolve, 300));
      capturedEvents.length = 0;

      // Get the note to obtain content hash
      const fullNote = await testSetup.api.getNote(vaultId, note.id);

      // Update note through Flint's API (which updates both content and metadata)
      await testSetup.api.updateNote({
        identifier: note.id,
        content: 'Test content with updated metadata',
        contentHash: fullNote!.content_hash,
        metadata: {
          tags: ['test', 'internal']
        },
        vaultId: vaultId
      });

      // Wait for any file watcher events
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should NOT have any external change events
      const externalEvents = capturedEvents.filter((e) => e.type.startsWith('external-'));
      expect(externalEvents).toHaveLength(0);
    });
  });

  describe('External Changes (should be detected)', () => {
    it('should trigger external-change event when file is modified externally', async () => {
      // Create a note through Flint
      const note = await testSetup.api.createNote({
        type: 'general',
        title: 'External Edit Test',
        content: 'Original content',
        vaultId: vaultId
      });

      // Clear events from creation and wait for expected content hash to clear
      // FileWriteQueue cleanup timer is 1000ms (expectedContentTTL)
      // Write happens after 1000ms default delay, then 1000ms cleanup = 2000ms total
      await new Promise((resolve) => setTimeout(resolve, 2500));
      capturedEvents.length = 0;

      // Get the note's file path
      const notePath = path.join(vaultPath, 'general', 'external-edit-test.md');

      // Modify the file EXTERNALLY (direct file write, bypassing Flint)
      const externalContent = `---
id: ${note.id}
type: general
title: External Edit Test
---

Modified externally in VSCode!`;

      await fs.writeFile(notePath, externalContent, 'utf-8');

      // Wait for file watcher to detect the change
      // Need to wait for: awaitWriteFinish (200ms) + debounce (100ms) + processing time
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should have detected an external change
      const externalChangeEvents = capturedEvents.filter(
        (e) => e.type === 'external-change'
      );
      expect(externalChangeEvents.length).toBeGreaterThan(0);

      // Verify the change was synced to the database
      const retrieved = await testSetup.api.getNote(vaultId, note.id);
      expect(retrieved?.content).toContain('Modified externally');
    });

    it('should trigger external-add event when file is created externally', async () => {
      // Clear any initial events
      capturedEvents.length = 0;

      // Ensure the general directory exists
      const generalDir = path.join(vaultPath, 'general');
      await fs.mkdir(generalDir, { recursive: true });

      // Create a new file EXTERNALLY (bypassing Flint)
      const externalNotePath = path.join(generalDir, 'external-new.md');
      const externalContent = `---
type: general
title: Externally Created
---

This note was created outside of Flint.`;

      await fs.writeFile(externalNotePath, externalContent, 'utf-8');

      // Wait for file watcher to detect the new file
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should have detected an external add
      const externalAddEvents = capturedEvents.filter((e) => e.type === 'external-add');
      expect(externalAddEvents.length).toBeGreaterThan(0);
    });

    it('should trigger external-delete event when file is deleted externally', async () => {
      // Create a note through Flint
      const note = await testSetup.api.createNote({
        type: 'general',
        title: 'Delete Test',
        content: 'Will be deleted',
        vaultId: vaultId
      });

      // Clear events from creation and wait for expected content hash to clear
      // FileWriteQueue cleanup timer is 1000ms (expectedContentTTL)
      // Write happens after 1000ms default delay, then 1000ms cleanup = 2000ms total
      await new Promise((resolve) => setTimeout(resolve, 2500));
      capturedEvents.length = 0;

      // Get the note's file path
      const notePath = path.join(vaultPath, 'general', 'delete-test.md');

      // Delete the file EXTERNALLY
      await fs.unlink(notePath);

      // Poll for the external-delete event with a timeout
      // This is more reliable than a fixed wait time
      const maxWaitMs = 2000;
      const pollIntervalMs = 100;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitMs) {
        const externalDeleteEvents = capturedEvents.filter(
          (e) => e.type === 'external-delete'
        );
        if (externalDeleteEvents.length > 0) {
          // Event detected!
          expect(externalDeleteEvents.length).toBeGreaterThan(0);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      // Timeout - event was not detected
      const externalDeleteEvents = capturedEvents.filter(
        (e) => e.type === 'external-delete'
      );
      expect(externalDeleteEvents.length).toBeGreaterThan(0);

      // Note: We can't reliably verify the note was removed from DB in this test
      // because the sync might not have completed yet. The important part is
      // that the external-delete event was detected.
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid successive Flint updates without false positives', async () => {
      // Create a note
      const note = await testSetup.api.createNote({
        type: 'general',
        title: 'Rapid Update Test',
        content: 'Original',
        vaultId: vaultId
      });

      // Clear events from creation
      await new Promise((resolve) => setTimeout(resolve, 300));
      capturedEvents.length = 0;

      // Perform multiple rapid updates through Flint
      let currentNote = await testSetup.api.getNote(vaultId, note.id);
      await testSetup.api.updateNote({
        identifier: note.id,
        content: 'Update 1',
        contentHash: currentNote!.content_hash,
        vaultId: vaultId
      });

      currentNote = await testSetup.api.getNote(vaultId, note.id);
      await testSetup.api.updateNote({
        identifier: note.id,
        content: 'Update 2',
        contentHash: currentNote!.content_hash,
        vaultId: vaultId
      });

      currentNote = await testSetup.api.getNote(vaultId, note.id);
      await testSetup.api.updateNote({
        identifier: note.id,
        content: 'Update 3',
        contentHash: currentNote!.content_hash,
        vaultId: vaultId
      });

      // Wait for any file watcher events
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should NOT have any external change events
      const externalEvents = capturedEvents.filter((e) => e.type.startsWith('external-'));
      expect(externalEvents).toHaveLength(0);
    });

    it('should handle rapid typing pattern without false external change events', async () => {
      // This test mimics the real-world typing pattern that triggers the race condition:
      // - Autosave triggers every 500ms during active typing
      // - Write flag cleanup is 1000ms
      // - Multiple saves occur within the cleanup window, causing flag interference

      const note = await testSetup.api.createNote({
        type: 'general',
        title: 'Rapid Typing Test',
        content: 'Initial',
        vaultId: vaultId
      });

      // Wait for creation to settle and clear events
      await new Promise((resolve) => setTimeout(resolve, 300));
      capturedEvents.length = 0;

      // Simulate typing pattern: 5 rapid edits with 400ms intervals
      // 400ms interval is more aggressive and closer to real typing patterns
      // This creates multiple overlapping cleanup windows
      for (let i = 0; i < 5; i++) {
        const fullNote = await testSetup.api.getNote(vaultId, note.id);
        await testSetup.api.updateNote({
          identifier: note.id,
          content: `Edit ${i + 1} - simulating active typing`,
          contentHash: fullNote!.content_hash,
          vaultId: vaultId
        });

        // Wait 400ms (much less than 1000ms cleanup window) to create more overlap
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      // Wait for all file watcher events to settle
      // Need extra time to ensure any delayed chokidar events have fired
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Should have ZERO external change events - all edits were internal
      const externalEvents = capturedEvents.filter((e) => e.type.startsWith('external-'));

      if (externalEvents.length > 0) {
        console.error('[Test] FALSE POSITIVE external events detected:', externalEvents);
      }

      expect(externalEvents).toHaveLength(0);

      // Verify final content was saved correctly (should be Edit 5, which is index 4)
      const retrieved = await testSetup.api.getNote(vaultId, note.id);
      expect(retrieved?.content).toBe('Edit 5 - simulating active typing');
    });
  });
});
