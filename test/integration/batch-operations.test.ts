/**
 * Batch Operations Integration Tests
 *
 * Tests for batch note creation and update functionality through MCP server
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  startServer,
  stopServer,
  waitFor,
  INTEGRATION_CONSTANTS,
  type IntegrationTestContext
} from './helpers/integration-utils.js';

describe('Batch Operations Integration', () => {
  let context: IntegrationTestContext;
  let serverProcess: ChildProcess;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('batch-ops-integration');
    serverProcess = await startServer({ workspacePath: context.tempDir });
  });

  afterEach(async () => {
    await stopServer(serverProcess);
    await cleanupIntegrationWorkspace(context);
  });

  describe('MCP Server Batch Create Notes', () => {
    test('should handle batch_create_notes tool call', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'create_note',
          arguments: {
            notes: [
              {
                type: 'general',
                title: 'Batch Integration Test 1',
                content: 'First note in integration test batch'
              },
              {
                type: 'general',
                title: 'Batch Integration Test 2',
                content: 'Second note in integration test batch',
                metadata: {
                  priority: 'high',
                  tags: ['integration', 'test']
                }
              },
              {
                type: 'general',
                title: 'Batch Integration Test 3',
                content: 'Third note in integration test batch'
              }
            ]
          }
        }
      };

      let response = '';
      let resolved = false;

      serverProcess.stdin!.write(JSON.stringify(request) + '\n');

      const responsePromise = new Promise<void>(resolve => {
        const onData = (data: Buffer) => {
          if (resolved) return;

          response += data.toString();
          const lines = response.split('\n');

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 1 && parsed.result) {
                  resolved = true;
                  serverProcess.stdout!.off('data', onData);
                  resolve();
                  break;
                }
              } catch {
                // Continue processing
              }
            }
          }
        };

        serverProcess.stdout!.on('data', onData);
      });

      await waitFor(
        () => Promise.resolve(resolved),
        INTEGRATION_CONSTANTS.DEFAULT_TIMEOUT
      );

      // Parse the response
      const lines = response.split('\n');
      let result: any = null;

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 1 && parsed.result) {
              result = parsed.result;
              break;
            }
          } catch {
            // Continue processing
          }
        }
      }

      assert(result, 'Should receive response from server');
      assert(result.content, 'Response should have content');
      assert(result.content[0], 'Response should have content array');

      const batchResult = JSON.parse(result.content[0].text);
      assert.strictEqual(batchResult.total, 3);
      assert.strictEqual(batchResult.successful, 3);
      assert.strictEqual(batchResult.failed, 0);
      assert.strictEqual(batchResult.results.length, 3);

      // Verify each result
      for (let i = 0; i < batchResult.results.length; i++) {
        const itemResult = batchResult.results[i];
        assert.strictEqual(itemResult.success, true);
        assert(itemResult.result);
        assert.strictEqual(itemResult.result.title, `Batch Integration Test ${i + 1}`);
        assert.strictEqual(itemResult.result.type, 'general');
        assert(!itemResult.error);
      }
    });

    test('should handle batch creation with partial failures', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'create_note',
          arguments: {
            notes: [
              {
                type: 'general',
                title: 'Valid Note',
                content: 'This should succeed'
              },
              {
                type: 'invalid/type',
                title: 'Invalid Note',
                content: 'This should fail'
              },
              {
                type: 'general',
                title: '',
                content: 'This should fail due to empty title'
              }
            ]
          }
        }
      };

      let response = '';
      let resolved = false;

      serverProcess.stdin!.write(JSON.stringify(request) + '\n');

      const responsePromise = new Promise<void>(resolve => {
        const onData = (data: Buffer) => {
          if (resolved) return;

          response += data.toString();
          const lines = response.split('\n');

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 2 && parsed.result) {
                  resolved = true;
                  serverProcess.stdout!.off('data', onData);
                  resolve();
                  break;
                }
              } catch {
                // Continue processing
              }
            }
          }
        };

        serverProcess.stdout!.on('data', onData);
      });

      await waitFor(
        () => Promise.resolve(resolved),
        INTEGRATION_CONSTANTS.DEFAULT_TIMEOUT
      );

      // Parse the response
      const lines = response.split('\n');
      let result: any = null;

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 2 && parsed.result) {
              result = parsed.result;
              break;
            }
          } catch {
            // Continue processing
          }
        }
      }

      assert(result, 'Should receive response from server');

      const batchResult = JSON.parse(result.content[0].text);
      assert.strictEqual(batchResult.total, 3);
      assert.strictEqual(batchResult.successful, 1);
      assert.strictEqual(batchResult.failed, 2);

      // Check that one succeeded and two failed
      const successfulResults = batchResult.results.filter((r: any) => r.success);
      const failedResults = batchResult.results.filter((r: any) => !r.success);

      assert.strictEqual(successfulResults.length, 1);
      assert.strictEqual(failedResults.length, 2);

      assert.strictEqual(successfulResults[0].result.title, 'Valid Note');
      assert(failedResults[0].error);
      assert(failedResults[1].error);
    });

    test('should reject empty batch', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'create_note',
          arguments: {
            notes: []
          }
        }
      };

      let response = '';
      let resolved = false;

      serverProcess.stdin!.write(JSON.stringify(request) + '\n');

      const responsePromise = new Promise<void>(resolve => {
        const onData = (data: Buffer) => {
          if (resolved) return;

          response += data.toString();
          const lines = response.split('\n');

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 3 && parsed.result) {
                  resolved = true;
                  serverProcess.stdout!.off('data', onData);
                  resolve();
                  break;
                }
              } catch {
                // Continue processing
              }
            }
          }
        };

        serverProcess.stdout!.on('data', onData);
      });

      await waitFor(
        () => Promise.resolve(resolved),
        INTEGRATION_CONSTANTS.DEFAULT_TIMEOUT
      );

      // Parse the response
      const lines = response.split('\n');
      let result: any = null;

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 3 && parsed.result) {
              result = parsed.result;
              break;
            }
          } catch {
            // Continue processing
          }
        }
      }

      assert(result, 'Should receive response from server');

      const batchResult = JSON.parse(result.content[0].text);
      assert.strictEqual(batchResult.total, 0);
      assert.strictEqual(batchResult.successful, 0);
      assert.strictEqual(batchResult.failed, 0);
      assert.strictEqual(batchResult.results.length, 0);
    });
  });

  describe('MCP Server Batch Update Notes', () => {
    test('should handle batch_update_notes tool call', async () => {
      // First create some notes to update
      const createRequest = {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'create_note',
          arguments: {
            notes: [
              {
                type: 'general',
                title: 'Update Target 1',
                content: 'Original content 1'
              },
              {
                type: 'general',
                title: 'Update Target 2',
                content: 'Original content 2'
              }
            ]
          }
        }
      };

      let createResponse = '';
      let createResolved = false;

      serverProcess.stdin!.write(JSON.stringify(createRequest) + '\n');

      const createResponsePromise = new Promise<void>(resolve => {
        const onData = (data: Buffer) => {
          if (createResolved) return;

          createResponse += data.toString();
          const lines = createResponse.split('\n');

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 10 && parsed.result) {
                  createResolved = true;
                  serverProcess.stdout!.off('data', onData);
                  resolve();
                  break;
                }
              } catch {
                // Continue processing
              }
            }
          }
        };

        serverProcess.stdout!.on('data', onData);
      });

      await waitFor(
        () => Promise.resolve(createResolved),
        INTEGRATION_CONSTANTS.DEFAULT_TIMEOUT
      );

      // Parse created note IDs
      const createLines = createResponse.split('\n');
      let createResult: any = null;

      for (const line of createLines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 10 && parsed.result) {
              createResult = parsed.result;
              break;
            }
          } catch {
            // Continue processing
          }
        }
      }

      const createBatchResult = JSON.parse(createResult.content[0].text);
      const noteIds = createBatchResult.results.map((r: any) => r.result.id);

      // Now update the notes
      const updateRequest = {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'update_note',
          arguments: {
            updates: [
              {
                identifier: noteIds[0],
                content: 'Updated content 1'
              },
              {
                identifier: noteIds[1],
                content: 'Updated content 2',
                metadata: {
                  updated_by: 'integration-test',
                  priority: 'high'
                }
              }
            ]
          }
        }
      };

      let updateResponse = '';
      let updateResolved = false;

      serverProcess.stdin!.write(JSON.stringify(updateRequest) + '\n');

      const updateResponsePromise = new Promise<void>(resolve => {
        const onData = (data: Buffer) => {
          if (updateResolved) return;

          updateResponse += data.toString();
          const lines = updateResponse.split('\n');

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 11 && parsed.result) {
                  updateResolved = true;
                  serverProcess.stdout!.off('data', onData);
                  resolve();
                  break;
                }
              } catch {
                // Continue processing
              }
            }
          }
        };

        serverProcess.stdout!.on('data', onData);
      });

      await waitFor(
        () => Promise.resolve(updateResolved),
        INTEGRATION_CONSTANTS.DEFAULT_TIMEOUT
      );

      // Parse the update response
      const updateLines = updateResponse.split('\n');
      let updateResult: any = null;

      for (const line of updateLines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 11 && parsed.result) {
              updateResult = parsed.result;
              break;
            }
          } catch {
            // Continue processing
          }
        }
      }

      assert(updateResult, 'Should receive update response from server');

      const updateBatchResult = JSON.parse(updateResult.content[0].text);
      assert.strictEqual(updateBatchResult.total, 2);
      assert.strictEqual(updateBatchResult.successful, 2);
      assert.strictEqual(updateBatchResult.failed, 0);

      // Verify each update result
      for (const itemResult of updateBatchResult.results) {
        assert.strictEqual(itemResult.success, true);
        assert(itemResult.result);
        assert.strictEqual(itemResult.result.updated, true);
        assert(itemResult.result.timestamp);
        assert(!itemResult.error);
      }
    });

    test('should handle batch updates with partial failures', async () => {
      // Create one valid note
      const createRequest = {
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'create_note',
          arguments: {
            type: 'general',
            title: 'Valid Update Target',
            content: 'Content to update'
          }
        }
      };

      let createResponse = '';
      let createResolved = false;

      serverProcess.stdin!.write(JSON.stringify(createRequest) + '\n');

      const createResponsePromise = new Promise<void>(resolve => {
        const onData = (data: Buffer) => {
          if (createResolved) return;

          createResponse += data.toString();
          const lines = createResponse.split('\n');

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 20 && parsed.result) {
                  createResolved = true;
                  serverProcess.stdout!.off('data', onData);
                  resolve();
                  break;
                }
              } catch {
                // Continue processing
              }
            }
          }
        };

        serverProcess.stdout!.on('data', onData);
      });

      await waitFor(
        () => Promise.resolve(createResolved),
        INTEGRATION_CONSTANTS.DEFAULT_TIMEOUT
      );

      // Get the created note ID
      const createLines = createResponse.split('\n');
      let createResult: any = null;

      for (const line of createLines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 20 && parsed.result) {
              createResult = parsed.result;
              break;
            }
          } catch {
            // Continue processing
          }
        }
      }

      const createdNote = JSON.parse(createResult.content[0].text);
      const validNoteId = createdNote.id;

      // Now try batch update with mixed valid/invalid notes
      const updateRequest = {
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'update_note',
          arguments: {
            updates: [
              {
                identifier: validNoteId,
                content: 'Successfully updated content'
              },
              {
                identifier: 'nonexistent/note.md',
                content: 'This should fail'
              },
              {
                identifier: 'general/another-nonexistent.md'
                // No content or metadata - should fail
              }
            ]
          }
        }
      };

      let updateResponse = '';
      let updateResolved = false;

      serverProcess.stdin!.write(JSON.stringify(updateRequest) + '\n');

      const updateResponsePromise = new Promise<void>(resolve => {
        const onData = (data: Buffer) => {
          if (updateResolved) return;

          updateResponse += data.toString();
          const lines = updateResponse.split('\n');

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 21 && parsed.result) {
                  updateResolved = true;
                  serverProcess.stdout!.off('data', onData);
                  resolve();
                  break;
                }
              } catch {
                // Continue processing
              }
            }
          }
        };

        serverProcess.stdout!.on('data', onData);
      });

      await waitFor(
        () => Promise.resolve(updateResolved),
        INTEGRATION_CONSTANTS.DEFAULT_TIMEOUT
      );

      // Parse the update response
      const updateLines = updateResponse.split('\n');
      let updateResult: any = null;

      for (const line of updateLines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 21 && parsed.result) {
              updateResult = parsed.result;
              break;
            }
          } catch {
            // Continue processing
          }
        }
      }

      assert(updateResult, 'Should receive update response from server');

      const updateBatchResult = JSON.parse(updateResult.content[0].text);
      assert.strictEqual(updateBatchResult.total, 3);
      assert.strictEqual(updateBatchResult.successful, 1);
      assert.strictEqual(updateBatchResult.failed, 2);

      const successfulResults = updateBatchResult.results.filter((r: any) => r.success);
      const failedResults = updateBatchResult.results.filter((r: any) => !r.success);

      assert.strictEqual(successfulResults.length, 1);
      assert.strictEqual(failedResults.length, 2);

      assert.strictEqual(successfulResults[0].input.identifier, validNoteId);
      assert(failedResults[0].error);
      assert(failedResults[1].error);
    });
  });

  describe('Tool Schema Validation', () => {
    test('should list batch tools in available tools', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/list'
      };

      let response = '';
      let resolved = false;

      serverProcess.stdin!.write(JSON.stringify(request) + '\n');

      const responsePromise = new Promise<void>(resolve => {
        const onData = (data: Buffer) => {
          if (resolved) return;

          response += data.toString();
          const lines = response.split('\n');

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 30 && parsed.result) {
                  resolved = true;
                  serverProcess.stdout!.off('data', onData);
                  resolve();
                  break;
                }
              } catch {
                // Continue processing
              }
            }
          }
        };

        serverProcess.stdout!.on('data', onData);
      });

      await waitFor(
        () => Promise.resolve(resolved),
        INTEGRATION_CONSTANTS.DEFAULT_TIMEOUT
      );

      // Parse the response
      const lines = response.split('\n');
      let result: any = null;

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 30 && parsed.result) {
              result = parsed.result;
              break;
            }
          } catch {
            // Continue processing
          }
        }
      }

      assert(result, 'Should receive tools list from server');
      assert(result.tools, 'Response should have tools array');

      const toolNames = result.tools.map((tool: any) => tool.name);
      assert(toolNames.includes('create_note'), 'Should include create_note tool');
      assert(toolNames.includes('update_note'), 'Should include update_note tool');

      // Check create_note schema supports both single and batch
      const createNoteTool = result.tools.find(
        (tool: any) => tool.name === 'create_note'
      );
      assert(createNoteTool, 'Should have create_note tool');
      assert(createNoteTool.description, 'Should have description');
      assert(createNoteTool.inputSchema, 'Should have input schema');
      assert(
        createNoteTool.inputSchema.oneOf,
        'Should have oneOf for single/batch support'
      );

      // Check update_note schema supports both single and batch
      const updateNoteTool = result.tools.find(
        (tool: any) => tool.name === 'update_note'
      );
      assert(updateNoteTool, 'Should have update_note tool');
      assert(updateNoteTool.description, 'Should have description');
      assert(updateNoteTool.inputSchema, 'Should have input schema');
      assert(
        updateNoteTool.inputSchema.oneOf,
        'Should have oneOf for single/batch support'
      );
    });
  });
});
