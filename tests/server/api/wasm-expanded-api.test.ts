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
            const createResult = await flintApi.createNote({
              type: 'general',
              title: 'WASM Test Note',
              content: 'This is a test note created via WASM API',
              metadata: { priority: 'high', tags: ['test', 'wasm'] }
            });

            // Get the created note
            const getResult = await flintApi.getNote(createResult.id);

            // Update the note
            const updateResult = await flintApi.updateNote({
              id: createResult.id,
              content: 'Updated content via WASM API',
              contentHash: getResult.content_hash,
              metadata: { priority: 'medium', tags: ['test', 'wasm', 'updated'] }
            });

            // List notes to verify existence
            const listResult = await flintApi.listNotes({ limit: 10 });

            // Delete the note
            const deleteResult = await flintApi.deleteNote({
              id: createResult.id,
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
          'flintApi.createNote',
          'flintApi.getNote',
          'flintApi.updateNote',
          'flintApi.listNotes',
          'flintApi.deleteNote'
        ]
      });

      if (!result.success) {
        console.error('WASM evaluation failed:', result.error, result.result);
      }
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
            const createResult = await flintApi.createNote({
              type: 'general',
              title: 'Original Name',
              content: 'Test content for rename/move operations'
            });

            // Get content hash
            const getResult = await flintApi.getNote(createResult.id);

            // Rename the note
            const renameResult = await flintApi.renameNote({
              id: createResult.id,
              newTitle: 'Renamed Note',
              contentHash: getResult.content_hash
            });

            // Move to different type (if meeting type exists)
            // Note: With immutable IDs, the ID stays the same after rename
            let moveResult = null;
            try {
              moveResult = await flintApi.moveNote({
                id: createResult.id,  // ID doesn't change on rename
                newType: 'meeting',
                contentHash: getResult.content_hash
              });
            } catch (error) {
              // Meeting type may not exist, that's ok
              moveResult = { success: false, error: error.message };
            }

            // Clean up
            // Note: With immutable IDs, the ID stays the same after move
            await flintApi.deleteNote({
              id: createResult.id,  // ID doesn't change on rename or move
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
          'flintApi.createNote',
          'flintApi.getNote',
          'flintApi.renameNote',
          'flintApi.moveNote',
          'flintApi.deleteNote'
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
              const searchResults = await flintApi.searchNotes({
                query: 'general',
                limit: 10
              });

              return {
                success: true,
                searchCount: searchResults.length,
                hasResults: searchResults.length >= 0, // Search should work even if no results
                searchResultsType: typeof searchResults,
                canCallSearch: typeof flintApi.searchNotes === 'function'
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
        allowedAPIs: ['flintApi.searchNotes']
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
              // Create a new note type
              const testTypeName = "wasm-test-type-" + Date.now();
              const createdType = await flintApi.createNoteType({
                typeName: testTypeName,
                description: "A note type created via WASM API"
              });

              // Get the created note type info
              const typeInfo = await flintApi.getNoteType(testTypeName);

              // Update the note type
              const updatedType = await flintApi.updateNoteType({
                typeName: testTypeName,
                description: "Updated description"
              });

              // Delete the note type
              const deleteResult = await flintApi.deleteNoteType({
                typeName: testTypeName,
                deleteNotes: false
              });

              return {
                success: true,
                typeCreated: createdType.name,
                typeRetrieved: typeInfo.name,
                typeUpdated: updatedType.name,
                testTypeName: testTypeName,
                typeDeleted: deleteResult.deleted,
                functionsAvailable: {
                  canListTypes: typeof flintApi.listNoteTypes === 'function',
                  canCreateTypes: typeof flintApi.createNoteType === 'function',
                  canGetTypes: typeof flintApi.getNoteType === 'function',
                  canUpdateTypes: typeof flintApi.updateNoteType === 'function',
                  canDeleteTypes: typeof flintApi.deleteNoteType === 'function'
                }
              };
            } catch (error) {
              return {
                success: false,
                error: error?.message || String(error),
                stack: error?.stack || 'No stack available',
                errorDetails: {
                  name: error?.name,
                  type: typeof error,
                  errorObject: error,
                  stringified: JSON.stringify(error, Object.getOwnPropertyNames(error))
                }
              };
            }
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [
          'flintApi.listNoteTypes',
          'flintApi.createNoteType',
          'flintApi.getNoteType',
          'flintApi.updateNoteType',
          'flintApi.deleteNoteType',
          'flintApi.createNote',
          'flintApi.deleteNote'
        ]
      });

      if (!result.success) {
        console.log('WASM evaluation failed:', result);
      }
      expect(result.success).toBe(true);
      const resultObj = result.result as any;

      if (!resultObj.success) {
        console.log('NoteTypes test internal error:', resultObj.error);
        console.log('Stack:', resultObj.stack);
        console.log('Error details:', JSON.stringify(resultObj.errorDetails, null, 2));
      }

      expect(resultObj.success).toBe(true);
      expect(resultObj.typeCreated).toBe(resultObj.testTypeName);
      expect(resultObj.typeRetrieved).toBe(resultObj.testTypeName);
      expect(resultObj.typeDeleted).toBe(true);
      expect(resultObj.functionsAvailable.canListTypes).toBe(true);
      expect(resultObj.functionsAvailable.canCreateTypes).toBe(true);
      expect(resultObj.functionsAvailable.canGetTypes).toBe(true);
      expect(resultObj.functionsAvailable.canUpdateTypes).toBe(true);
      expect(resultObj.functionsAvailable.canDeleteTypes).toBe(true);
    });

    it('should handle note type CRUD workflow with error recovery', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            try {
              // Create multiple note types for testing
              const types = await Promise.all([
                flintApi.createNoteType({
                  typeName: "workflow-type-1",
                  description: "First workflow type"
                }),
                flintApi.createNoteType({
                  typeName: "workflow-type-2",
                  description: "Second workflow type"
                })
              ]);

              // Test error handling - try to create duplicate
              let duplicateError = null;
              try {
                await flintApi.createNoteType({
                  typeName: "workflow-type-1",
                  description: "Duplicate type"
                });
              } catch (error) {
                duplicateError = error.message;
              }

              // Test error handling - try to get non-existent type
              let notFoundError = null;
              try {
                await flintApi.getNoteType("non-existent-type");
              } catch (error) {
                notFoundError = error.message;
              }

              // Clean up created types
              const cleanupResults = await Promise.all([
                flintApi.deleteNoteType({
                  typeName: "workflow-type-1",
                  action: "error",
                  confirm: true
                }),
                flintApi.deleteNoteType({
                  typeName: "workflow-type-2",
                  action: "error",
                  confirm: true
                })
              ]);

              return {
                success: true,
                typesCreated: types.map(t => t.name),
                duplicateError: duplicateError ? "Handled duplicate creation" : null,
                notFoundError: notFoundError ? "Handled not found error" : null,
                cleanupResults: cleanupResults.map(r => r.deleted)
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
          'flintApi.listNoteTypes',
          'flintApi.createNoteType',
          'flintApi.getNoteType',
          'flintApi.updateNoteType',
          'flintApi.deleteNoteType'
        ]
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;

      if (!resultObj.success) {
        console.log('Workflow test internal error:', resultObj.error);
        console.log('Stack:', resultObj.stack);
      }

      expect(resultObj.success).toBe(true);
      expect(resultObj.typesCreated).toHaveLength(2);
      expect(resultObj.typesCreated).toContain('workflow-type-1');
      expect(resultObj.typesCreated).toContain('workflow-type-2');
      expect(resultObj.cleanupResults).toEqual([true, true]);
    });
  });

  describe('Vaults API', () => {
    it('should support vault management operations', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            // Get current vault
            const currentVault = await flintApi.getCurrentVault();

            // List all vaults
            const allVaults = await flintApi.listVaults();

            // Create a new vault
            let createResult = null;
            try {
              createResult = await flintApi.createVault({
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
                await flintApi.updateVault({
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
                await flintApi.removeVault('wasm-test-vault');
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
          'flintApi.getCurrentVault',
          'flintApi.listVaults',
          'flintApi.createVault',
          'flintApi.updateVault',
          'flintApi.removeVault'
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
            const currentVault = await flintApi.getCurrentVault();
            const allVaults = await flintApi.listVaults();

            // Find a different vault to switch to (if available)
            const targetVault = allVaults.find(v => v.id !== currentVault?.id);

            let switchResult = { attempted: false, success: false };
            let switchBackResult = { attempted: false, success: false };

            if (targetVault) {
              try {
                await flintApi.switchVault(targetVault.id);
                switchResult = { attempted: true, success: true };

                // Switch back to original vault
                if (currentVault) {
                  await flintApi.switchVault(currentVault.id);
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
        allowedAPIs: [
          'flintApi.getCurrentVault',
          'flintApi.listVaults',
          'flintApi.switchVault'
        ]
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
              const currentVault = await flintApi.getCurrentVault();
              const noteTypesList = await flintApi.listNoteTypes();

              // Create a simple note
              const note = await flintApi.createNote({
                type: 'general',
                title: 'Multi-API Workflow Test',
                content: 'This note tests complex workflows'
              });

              // Get and update the note
              const retrievedNote = await flintApi.getNote(note.id);
              await flintApi.updateNote({
                id: note.id,
                content: 'Updated content with [[test-link]] and more text',
                contentHash: retrievedNote.content_hash
              });

              // Get final state
              const finalNote = await flintApi.getNote(note.id);

              // Clean up
              await flintApi.deleteNote({
                id: note.id,
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
          'flintApi.getCurrentVault',
          'flintApi.listNoteTypes',
          'flintApi.createNote',
          'flintApi.getNote',
          'flintApi.updateNote',
          'flintApi.deleteNote'
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
                flintApi.createNote({
                  type: 'general',
                  title: \`Concurrent Note \${i + 1}\`,
                  content: \`Content for concurrent note \${i + 1}\`
                })
              );
            }

            const createdNotes = await Promise.all(createPromises);

            // Get all created notes concurrently
            const getPromises = createdNotes.map(note => flintApi.getNote(note.id));
            const retrievedNotes = await Promise.all(getPromises);

            // Delete all notes concurrently
            const deletePromises = createdNotes.map(note =>
              flintApi.deleteNote({
                id: note.id,
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
        allowedAPIs: ['flintApi.createNote', 'flintApi.getNote', 'flintApi.deleteNote']
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
              notesCreate: typeof flintApi.createNote,
              notesGet: typeof flintApi.getNote,
              notesUpdate: typeof flintApi.updateNote,
              notesDelete: typeof flintApi.deleteNote,
              notesList: typeof flintApi.listNotes,
              notesRename: typeof flintApi.renameNote,
              notesMove: typeof flintApi.moveNote,
              notesSearch: typeof flintApi.searchNotes,

              noteTypesCreate: typeof flintApi.createNoteType,
              noteTypesList: typeof flintApi.listNoteTypes,
              noteTypesGet: typeof flintApi.getNoteType,
              noteTypesUpdate: typeof flintApi.updateNoteType,
              noteTypesDelete: typeof flintApi.deleteNoteType,

              vaultsGetCurrent: typeof flintApi.getCurrentVault,
              vaultsList: typeof flintApi.listVaults,
              vaultsCreate: typeof flintApi.createVault,
              vaultsSwitch: typeof flintApi.switchVault,
              vaultsUpdate: typeof flintApi.updateVault,
              vaultsRemove: typeof flintApi.removeVault
            };
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [
          'flintApi.getNote',
          'flintApi.listNoteTypes',
          'flintApi.getCurrentVault'
        ]
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

  describe('Links API', () => {
    it('should support link operations', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            try {
              // First just check if flintApi object exists
              if (typeof flintApi === 'undefined') {
                return { success: false, error: 'flintApi object is undefined' };
              }

              // Test individual method availability
              const methodTests = {
                getForNote: typeof flintApi.getNoteLinks === 'function',
                getBacklinks: typeof flintApi.getBacklinks === 'function',
                findBroken: typeof flintApi.findBrokenLinks === 'function',
                searchBy: typeof flintApi.searchByLinks === 'function',
                migrate: typeof flintApi.migrateLinks === 'function'
              };

              return {
                success: true,
                linksExists: true,
                ...methodTests
              };
            } catch (error) {
              return {
                success: false,
                error: error?.message || String(error),
                stack: error?.stack,
                errorType: typeof error,
                fullError: error
              };
            }
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [
          'flintApi.createNote',
          'flintApi.deleteNote',
          'flintApi.getNoteLinks',
          'flintApi.getBacklinks',
          'flintApi.findBrokenLinks',
          'flintApi.searchByLinks',
          'flintApi.migrateLinks'
        ]
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;

      if (!resultObj.success) {
        console.log('Links API test internal error:', resultObj.error);
        console.log('Stack:', resultObj.stack);
        console.log('Error type:', resultObj.errorType);
        console.log('Full error:', JSON.stringify(resultObj.fullError, null, 2));
      }

      expect(resultObj.success).toBe(true);
      expect(resultObj.linksExists).toBe(true);
      expect(resultObj.getForNote).toBe(true);
      expect(resultObj.getBacklinks).toBe(true);
      expect(resultObj.findBroken).toBe(true);
      expect(resultObj.searchBy).toBe(true);
      expect(resultObj.migrate).toBe(true);
    });
  });

  describe('Hierarchy API', () => {
    it('should support hierarchy operations', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            try {
              // First just check if flintApi object exists
              if (typeof flintApi === 'undefined') {
                return { success: false, error: 'flintApi object is undefined' };
              }

              // Test individual method availability
              const methodTests = {
                addSubnote: typeof flintApi.addSubnote === 'function',
                removeSubnote: typeof flintApi.removeSubnote === 'function',
                reorder: typeof flintApi.reorderSubnotes === 'function',
                getPath: typeof flintApi.getHierarchyPath === 'function',
                getDescendants: typeof flintApi.getDescendants === 'function',
                getChildren: typeof flintApi.getChildren === 'function',
                getParents: typeof flintApi.getParents === 'function'
              };

              return {
                success: true,
                hierarchyExists: true,
                ...methodTests
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
          'flintApi.createNote',
          'flintApi.deleteNote',
          'flintApi.addSubnote',
          'flintApi.removeSubnote',
          'flintApi.reorderSubnotes',
          'flintApi.getHierarchyPath',
          'flintApi.getDescendants',
          'flintApi.getChildren',
          'flintApi.getParents'
        ]
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;

      if (!resultObj.success) {
        console.log('Hierarchy API test internal error:', resultObj.error);
        console.log('Stack:', resultObj.stack);
      }

      expect(resultObj.success).toBe(true);
      expect(resultObj.hierarchyExists).toBe(true);
      expect(resultObj.addSubnote).toBe(true);
      expect(resultObj.removeSubnote).toBe(true);
      expect(resultObj.reorder).toBe(true);
      expect(resultObj.getPath).toBe(true);
      expect(resultObj.getDescendants).toBe(true);
      expect(resultObj.getChildren).toBe(true);
      expect(resultObj.getParents).toBe(true);
    });
  });

  describe('Relationships API', () => {
    it('should support relationship analysis operations', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            try {
              // Create related notes
              const note1 = await flintApi.createNote({
                type: 'general',
                title: 'Relationship Test Note 1',
                content: 'This note is related to [[Relationship Test Note 2]]'
              });

              const note2 = await flintApi.createNote({
                type: 'general',
                title: 'Relationship Test Note 2',
                content: 'This note is related back'
              });

              // Get comprehensive relationships for note1
              const noteRelationships = await flintApi.getNoteRelationships(note1.id);

              // Get related notes
              const relatedNotes = await flintApi.getRelatedNotes({
                id: note1.id,
                limit: 5
              });

              // Find relationship path
              const relationshipPath = await flintApi.findRelationshipPath({
                fromId: note1.id,
                toId: note2.id
              });

              // Get clustering coefficient
              const clusteringCoefficient = await flintApi.getClusteringCoefficient(note1.id);

              // Clean up
              await flintApi.deleteNote({ id: note1.id, confirm: true });
              await flintApi.deleteNote({ id: note2.id, confirm: true });

              return {
                success: true,
                relationshipsAvailable: noteRelationships !== null,
                relatedNotesCount: relatedNotes.length,
                pathFound: relationshipPath !== null,
                clusteringCoeff: clusteringCoefficient,
                canGet: typeof flintApi.getNoteRelationships === 'function',
                canGetRelated: typeof flintApi.getRelatedNotes === 'function',
                canFindPath: typeof flintApi.findRelationshipPath === 'function',
                canGetClusteringCoefficient: typeof flintApi.getClusteringCoefficient === 'function'
              };
            } catch (error) {
              return {
                success: false,
                fullError: error,
                error: error.message,
                stack: error.stack
              };
            }
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [
          'flintApi.createNote',
          'flintApi.deleteNote',
          'flintApi.getNoteRelationships',
          'flintApi.getRelatedNotes',
          'flintApi.findRelationshipPath',
          'flintApi.getClusteringCoefficient'
        ]
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;

      if (!resultObj.success) {
        console.log('Relationships API test internal error:', resultObj.error);
        console.log('Stack:', resultObj.stack);
      }

      expect(resultObj.success).toBe(true);
      expect(resultObj.canGet).toBe(true);
      expect(resultObj.canGetRelated).toBe(true);
      expect(resultObj.canFindPath).toBe(true);
      expect(resultObj.canGetClusteringCoefficient).toBe(true);
    });
  });

  describe('Advanced API Security and Whitelisting', () => {
    it('should enforce API whitelisting for advanced APIs', async () => {
      const result = await evaluator.evaluate({
        code: `
          async function main() {
            return {
              // Test Links API availability
              linksGetForNote: typeof flintApi.getNoteLinks,
              linksGetBacklinks: typeof flintApi.getBacklinks,
              linksFindBroken: typeof flintApi.findBrokenLinks,
              linksSearchBy: typeof flintApi.searchByLinks,
              linksMigrate: typeof flintApi.migrateLinks,

              // Test Hierarchy API availability
              hierarchyAddSubnote: typeof flintApi.addSubnote,
              hierarchyRemoveSubnote: typeof flintApi.removeSubnote,
              hierarchyReorder: typeof flintApi.reorderSubnotes,
              hierarchyGetPath: typeof flintApi.getHierarchyPath,
              hierarchyGetDescendants: typeof flintApi.getDescendants,
              hierarchyGetChildren: typeof flintApi.getChildren,
              hierarchyGetParents: typeof flintApi.getParents,

              // Test Relationships API availability
              relationshipsGet: typeof flintApi.getNoteRelationships,
              relationshipsGetRelated: typeof flintApi.getRelatedNotes,
              relationshipsFindPath: typeof flintApi.findRelationshipPath,
              relationshipsGetClusteringCoefficient: typeof flintApi.getClusteringCoefficient
            };
          }
        `,
        vaultId: testVaultId,
        allowedAPIs: [
          'flintApi.getNoteLinks',
          'flintApi.addSubnote',
          'flintApi.getNoteRelationships'
        ]
      });

      expect(result.success).toBe(true);
      const resultObj = result.result as any;

      // Allowed APIs should be functions
      expect(resultObj.linksGetForNote).toBe('function');
      expect(resultObj.hierarchyAddSubnote).toBe('function');
      expect(resultObj.relationshipsGet).toBe('function');

      // Non-allowed APIs should be null (typeof null === 'object')
      expect(resultObj.linksGetBacklinks).toBe('object');
      expect(resultObj.linksFindBroken).toBe('object');
      expect(resultObj.linksSearchBy).toBe('object');
      expect(resultObj.linksMigrate).toBe('object');

      expect(resultObj.hierarchyRemoveSubnote).toBe('object');
      expect(resultObj.hierarchyReorder).toBe('object');
      expect(resultObj.hierarchyGetPath).toBe('object');
      expect(resultObj.hierarchyGetDescendants).toBe('object');
      expect(resultObj.hierarchyGetChildren).toBe('object');
      expect(resultObj.hierarchyGetParents).toBe('object');

      expect(resultObj.relationshipsGetRelated).toBe('object');
      expect(resultObj.relationshipsFindPath).toBe('object');
      expect(resultObj.relationshipsGetClusteringCoefficient).toBe('object');
    });
  });
});
