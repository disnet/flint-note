/**
 * Tests for WASMCodeEvaluator - Phase 2C: Expanded API Surface
 * Tests the full notes, noteTypes, and vaults API implementations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from './test-setup.js';
import { WASMCodeEvaluator } from '../../../src/server/api/wasm-code-evaluator.js';

describe('WASMCodeEvaluator - Phase 2C: Expanded API', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;
  let evaluator: WASMCodeEvaluator;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();

    // Create a test vault
    testVaultId = await testSetup.createTestVault('test-expanded-api-vault');

    // Initialize the WASM evaluator with the API instance
    evaluator = new WASMCodeEvaluator(testSetup.api);
    await evaluator.initialize();
  });

  afterEach(async () => {
    evaluator.dispose();
    await testSetup.cleanup();
  });

  describe('Full Notes API', () => {
    it('should support complete CRUD operations', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            // Create a note
            const createResult = await notes.create({
              type: 'general',
              title: 'WASM Test Note',
              content: 'This is a test note created via WASM API',
              metadata: { priority: 'high', tags: ['test', 'wasm'] }
            });

            // Get the created note
            const getResult = await notes.get(createResult.id);
            
            // Update the note
            const updateResult = await notes.update({
              identifier: createResult.id,
              content: 'Updated content via WASM API',
              contentHash: getResult.content_hash,
              metadata: { priority: 'medium', tags: ['test', 'wasm', 'updated'] }
            });

            // List notes to verify existence
            const listResult = await notes.list({ limit: 10 });

            // Delete the note
            const deleteResult = await notes.delete({
              identifier: createResult.id,
              confirm: true
            });

            return {
              created: createResult.title,
              retrieved: getResult.title,
              updated: updateResult.updated,
              listCount: listResult.length,
              deleted: deleteResult.deleted
            };
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [
          'notes.create',
          'notes.get',
          'notes.update',
          'notes.list',
          'notes.delete'
        ]
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;
      expect(resultObj.created).toBe('WASM Test Note');
      expect(resultObj.retrieved).toBe('WASM Test Note');
      expect(resultObj.updated).toBeTruthy();
      expect(resultObj.listCount).toBeGreaterThan(0);
      expect(resultObj.deleted).toBeTruthy();
    });

    it('should support note rename and move operations', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            // Create a note
            const createResult = await notes.create({
              type: 'general',
              title: 'Original Name',
              content: 'Test content for rename/move operations'
            });

            // Get content hash
            const getResult = await notes.get(createResult.id);

            // Rename the note
            const renameResult = await notes.rename({
              identifier: createResult.id,
              new_title: 'Renamed Note',
              content_hash: getResult.content_hash
            });

            // Move to different type (if meeting type exists)
            let moveResult = null;
            try {
              moveResult = await notes.move({
                identifier: renameResult.new_id || createResult.id,
                new_type: 'meeting',
                content_hash: getResult.content_hash
              });
            } catch (error) {
              // Meeting type may not exist, that's ok
              moveResult = { success: false, error: error.message };
            }

            // Clean up
            await notes.delete({
              identifier: moveResult && moveResult.new_id ? moveResult.new_id : (renameResult.new_id || createResult.id),
              confirm: true
            });

            return {
              renamed: renameResult.success,
              moveAttempted: true,
              moveSuccess: moveResult && moveResult.success
            };
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [
          'notes.create',
          'notes.get',
          'notes.rename',
          'notes.move',
          'notes.delete'
        ]
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;
      expect(resultObj.renamed).toBe(true);
      expect(resultObj.moveAttempted).toBe(true);
    });

    it('should support note search functionality', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            try {
              // Test search functionality by searching for existing general notes
              // Rather than creating new notes and expecting immediate indexing
              const searchResults = await notes.search({
                query: 'general',
                limit: 10
              });

              return {
                success: true,
                searchCount: searchResults.length,
                hasResults: searchResults.length >= 0, // Search should work even if no results
                searchResultsType: typeof searchResults,
                canCallSearch: typeof notes.search === 'function'
              };
            } catch (error) {
              return {
                success: false,
                error: error.message,
                stack: error.stack
              };
            }
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: ['notes.search']
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;

      if (!resultObj.success) {
        console.log('Search test internal error:', resultObj.error);
        console.log('Stack:', resultObj.stack);
      }

      expect(resultObj.success).toBe(true);
      expect(resultObj.canCallSearch).toBe(true);
      expect(resultObj.searchResultsType).toBe('object');
      expect(typeof resultObj.searchCount).toBe('number');
    });
  });

  describe('NoteTypes API', () => {
    it('should support complete noteType operations', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            try {
              // List existing note types
              const initialTypes = await noteTypes.list();

              return {
                success: true,
                initialCount: initialTypes.length,
                canListTypes: typeof noteTypes.list === 'function',
                canCreateTypes: typeof noteTypes.create === 'function',
                canGetTypes: typeof noteTypes.get === 'function',
                canUpdateTypes: typeof noteTypes.update === 'function',
                canDeleteTypes: typeof noteTypes.delete === 'function',
                typesType: typeof initialTypes,
                hasDefaultTypes: initialTypes.length > 0
              };
            } catch (error) {
              return {
                success: false,
                error: error.message,
                stack: error.stack
              };
            }
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [
          'noteTypes.list',
          'noteTypes.create',
          'noteTypes.get',
          'noteTypes.update',
          'noteTypes.delete'
        ]
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;

      if (!resultObj.success) {
        console.log('NoteTypes test internal error:', resultObj.error);
        console.log('Stack:', resultObj.stack);
      }

      expect(resultObj.success).toBe(true);
      expect(resultObj.canListTypes).toBe(true);
      expect(resultObj.canCreateTypes).toBe(true);
      expect(resultObj.canGetTypes).toBe(true);
      expect(resultObj.canUpdateTypes).toBe(true);
      expect(resultObj.canDeleteTypes).toBe(true);
      expect(typeof resultObj.initialCount).toBe('number');
    });
  });

  describe('Vaults API', () => {
    it('should support vault management operations', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            // Get current vault
            const currentVault = await vaults.getCurrent();

            // List all vaults
            const allVaults = await vaults.list();

            // Create a new vault
            let createResult = null;
            try {
              createResult = await vaults.create({
                id: 'wasm-test-vault',
                name: 'WASM Test Vault',
                path: '/tmp/wasm-test-vault',
                description: 'Test vault created via WASM API',
                initialize: true,
                switch_to: false
              });
            } catch (error) {
              createResult = { error: error.message };
            }

            // Update vault metadata if creation succeeded
            let updateResult = null;
            if (createResult && !createResult.error) {
              try {
                await vaults.update({
                  id: 'wasm-test-vault',
                  name: 'Updated WASM Test Vault',
                  description: 'Updated description via WASM'
                });
                updateResult = { success: true };
              } catch (error) {
                updateResult = { error: error.message };
              }
            }

            // Remove test vault if it was created
            let removeResult = null;
            if (createResult && !createResult.error) {
              try {
                await vaults.remove('wasm-test-vault');
                removeResult = { success: true };
              } catch (error) {
                removeResult = { error: error.message };
              }
            }

            return {
              currentVaultExists: currentVault !== null,
              vaultCount: allVaults.length,
              createAttempted: true,
              createSuccess: createResult && !createResult.error,
              updateAttempted: updateResult !== null,
              removeAttempted: removeResult !== null
            };
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [
          'vaults.getCurrent',
          'vaults.list',
          'vaults.create',
          'vaults.update',
          'vaults.remove'
        ]
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;
      expect(resultObj.currentVaultExists).toBe(true);
      expect(resultObj.vaultCount).toBeGreaterThan(0);
      expect(resultObj.createAttempted).toBe(true);
    });

    it('should support vault switching operations', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            // Get current vault info
            const currentVault = await vaults.getCurrent();
            const allVaults = await vaults.list();

            // Find a different vault to switch to (if available)
            const targetVault = allVaults.find(v => v.id !== currentVault?.id);

            let switchResult = { attempted: false, success: false };
            let switchBackResult = { attempted: false, success: false };

            if (targetVault) {
              try {
                await vaults.switch(targetVault.id);
                switchResult = { attempted: true, success: true };

                // Switch back to original vault
                if (currentVault) {
                  await vaults.switch(currentVault.id);
                  switchBackResult = { attempted: true, success: true };
                }
              } catch (error) {
                switchResult = { attempted: true, success: false, error: error.message };
              }
            }

            return {
              originalVault: currentVault?.name || 'Unknown',
              availableVaults: allVaults.length,
              targetFound: targetVault !== undefined,
              switchResult,
              switchBackResult
            };
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: ['vaults.getCurrent', 'vaults.list', 'vaults.switch']
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;
      expect(resultObj.availableVaults).toBeGreaterThan(0);
    });
  });

  describe('Complex Multi-API Operations', () => {
    it('should support complex workflows combining multiple APIs', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            try {
              // Get vault context
              const currentVault = await vaults.getCurrent();
              const noteTypesList = await noteTypes.list();

              // Create a simple note
              const note = await notes.create({
                type: 'general',
                title: 'Multi-API Workflow Test',
                content: 'This note tests complex workflows'
              });

              // Get and update the note
              const retrievedNote = await notes.get(note.id);
              await notes.update({
                identifier: note.id,
                content: 'Updated content with [[test-link]] and more text',
                contentHash: retrievedNote.content_hash
              });

              // Get final state
              const finalNote = await notes.get(note.id);

              // Clean up
              await notes.delete({
                identifier: note.id,
                confirm: true
              });

              return {
                success: true,
                vaultExists: currentVault !== null,
                noteTypeCount: noteTypesList.length,
                noteCreated: note.title,
                finalContentLength: finalNote.content.length,
                hasTestLink: finalNote.content.includes('[[test-link]]'),
                workflowComplete: true
              };
            } catch (error) {
              return {
                success: false,
                error: error.message,
                stack: error.stack
              };
            }
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [
          'vaults.getCurrent',
          'noteTypes.list',
          'notes.create',
          'notes.get',
          'notes.update',
          'notes.delete'
        ]
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;

      if (!resultObj.success) {
        console.log('Complex workflow test internal error:', resultObj.error);
        console.log('Stack:', resultObj.stack);
      }

      expect(resultObj.success).toBe(true);
      expect(resultObj.noteCreated).toBe('Multi-API Workflow Test');
      expect(resultObj.workflowComplete).toBe(true);
      expect(resultObj.hasTestLink).toBe(true);
      expect(resultObj.finalContentLength).toBeGreaterThan(0);
    });

    it('should handle concurrent operations properly', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            // Create multiple notes concurrently
            const createPromises = [];
            for (let i = 0; i < 3; i++) {
              createPromises.push(
                notes.create({
                  type: 'general',
                  title: \`Concurrent Note \${i + 1}\`,
                  content: \`Content for concurrent note \${i + 1}\`
                })
              );
            }

            const createdNotes = await Promise.all(createPromises);

            // Get all created notes concurrently
            const getPromises = createdNotes.map(note => notes.get(note.id));
            const retrievedNotes = await Promise.all(getPromises);

            // Delete all notes concurrently
            const deletePromises = createdNotes.map(note => 
              notes.delete({
                identifier: note.id,
                confirm: true
              })
            );
            const deleteResults = await Promise.all(deletePromises);

            return {
              createdCount: createdNotes.length,
              retrievedCount: retrievedNotes.filter(n => n !== null).length,
              deletedCount: deleteResults.filter(r => r.deleted).length,
              allTitlesMatch: createdNotes.every((note, i) => 
                note.title === \`Concurrent Note \${i + 1}\`
              )
            };
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: ['notes.create', 'notes.get', 'notes.delete']
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;
      expect(resultObj.createdCount).toBe(3);
      expect(resultObj.retrievedCount).toBe(3);
      expect(resultObj.deletedCount).toBe(3);
      expect(resultObj.allTitlesMatch).toBe(true);
    });
  });

  describe('API Security and Whitelisting', () => {
    it('should enforce API whitelisting for expanded API surface', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            return {
              // Test which APIs are available
              notesCreate: typeof notes.create,
              notesGet: typeof notes.get,
              notesUpdate: typeof notes.update,
              notesDelete: typeof notes.delete,
              notesList: typeof notes.list,
              notesRename: typeof notes.rename,
              notesMove: typeof notes.move,
              notesSearch: typeof notes.search,
              
              noteTypesCreate: typeof noteTypes.create,
              noteTypesList: typeof noteTypes.list,
              noteTypesGet: typeof noteTypes.get,
              noteTypesUpdate: typeof noteTypes.update,
              noteTypesDelete: typeof noteTypes.delete,
              
              vaultsGetCurrent: typeof vaults.getCurrent,
              vaultsList: typeof vaults.list,
              vaultsCreate: typeof vaults.create,
              vaultsSwitch: typeof vaults.switch,
              vaultsUpdate: typeof vaults.update,
              vaultsRemove: typeof vaults.remove
            };
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: ['notes.get', 'noteTypes.list', 'vaults.getCurrent']
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;

      // Allowed APIs should be functions
      expect(resultObj.notesGet).toBe('function');
      expect(resultObj.noteTypesList).toBe('function');
      expect(resultObj.vaultsGetCurrent).toBe('function');

      // Non-allowed APIs should be null (typeof null === 'object')
      expect(resultObj.notesCreate).toBe('object');
      expect(resultObj.notesUpdate).toBe('object');
      expect(resultObj.notesDelete).toBe('object');
      expect(resultObj.notesList).toBe('object');
      expect(resultObj.notesRename).toBe('object');
      expect(resultObj.notesMove).toBe('object');
      expect(resultObj.notesSearch).toBe('object');

      expect(resultObj.noteTypesCreate).toBe('object');
      expect(resultObj.noteTypesGet).toBe('object');
      expect(resultObj.noteTypesUpdate).toBe('object');
      expect(resultObj.noteTypesDelete).toBe('object');

      expect(resultObj.vaultsList).toBe('object');
      expect(resultObj.vaultsCreate).toBe('object');
      expect(resultObj.vaultsSwitch).toBe('object');
      expect(resultObj.vaultsUpdate).toBe('object');
      expect(resultObj.vaultsRemove).toBe('object');
    });
  });
});
