/**
 * Debug test for hybrid search MCP communication
 *
 * A simplified test to debug issues with hybrid search tool communication
 * through the MCP server interface.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ChildProcess } from 'node:child_process';

import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  startServer,
  stopServer,
  type IntegrationTestContext
} from './helpers/integration-utils.js';

/**
 * Simple MCP client for debugging
 */
class DebugMCPClient {
  private serverProcess: ChildProcess;

  constructor(serverProcess: ChildProcess) {
    this.serverProcess = serverProcess;
  }

  async listTools(): Promise<any> {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    };

    return this.sendRequest(request);
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    const request = {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1000000),
      method: 'tools/call',
      params: { name, arguments: arguments_ }
    };

    return this.sendRequest(request);
  }

  private async sendRequest(request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let responseData = '';
      const _errorData = '';

      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for: ${JSON.stringify(request)}`));
      }, 10000); // 10 second timeout

      const onData = (data: Buffer) => {
        responseData += data.toString();
        const lines = responseData.split('\n');

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                clearTimeout(timeout);
                this.serverProcess.stdout?.off('data', onData);
                this.serverProcess.stderr?.off('data', onError);

                if (response.error) {
                  reject(new Error(`MCP Error: ${JSON.stringify(response.error)}`));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch {
              // Not JSON or not our response, continue
            }
          }
        }
      };

      const onError = (data: Buffer) => {
        console.error('Server stderr:', data.toString());
      };

      this.serverProcess.stdout?.on('data', onData);
      this.serverProcess.stderr?.on('data', onError);

      console.log('Sending request:', JSON.stringify(request));
      this.serverProcess.stdin?.write(JSON.stringify(request) + '\n');
    });
  }
}

describe('Hybrid Search Debug Tests', () => {
  let context: IntegrationTestContext;
  let client: DebugMCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('hybrid-search-debug');

    // Create a simple test note
    const testNote = `---
title: "Debug Test Note"
type: "general"
tags: ["debug", "test"]
created: "2024-01-01T00:00:00Z"
updated: "2024-01-01T00:00:00Z"
---

# Debug Test Note

This is a simple note for debugging hybrid search functionality.
`;

    await fs.writeFile(
      join(context.tempDir, 'general', 'debug-test.md'),
      testNote,
      'utf8'
    );

    const serverProcess = await startServer({
      workspacePath: context.tempDir,
      timeout: 15000
    });

    context.serverProcess = serverProcess;
    client = new DebugMCPClient(serverProcess);

    // Wait for server to be fully ready
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  afterEach(async () => {
    if (context.serverProcess) {
      try {
        await stopServer(context.serverProcess, 3000);
      } catch {
        // Ignore shutdown errors
      }
    }
    await cleanupIntegrationWorkspace(context);
  });

  test('should list available tools including hybrid search tools', async () => {
    console.log('Testing tool listing...');

    const result = await client.listTools();
    console.log('Tools response:', JSON.stringify(result, null, 2));

    assert(result.tools, 'Should return tools list');
    assert(Array.isArray(result.tools), 'Tools should be an array');

    const toolNames = result.tools.map((tool: any) => tool.name);
    console.log('Available tools:', toolNames);

    assert(toolNames.includes('search_notes'), 'Should include basic search_notes tool');
    assert(
      toolNames.includes('search_notes_advanced'),
      'Should include search_notes_advanced tool'
    );
    assert(
      toolNames.includes('search_notes_sql'),
      'Should include search_notes_sql tool'
    );
  });

  test('should call basic search_notes tool successfully', async () => {
    console.log('Testing basic search_notes...');

    const result = await client.callTool('search_notes', {
      query: 'debug'
    });

    console.log('Search result:', JSON.stringify(result, null, 2));

    assert(result, 'Should return a result');
    assert(result.content, 'Should have content property');
    assert(Array.isArray(result.content), 'Content should be an array');
    assert(result.content.length > 0, 'Should have content items');
    assert(result.content[0].text, 'Should have text content');

    const responseData = JSON.parse(result.content[0].text);
    console.log('Parsed response:', JSON.stringify(responseData, null, 2));

    // search_notes returns direct array, not object with results property
    assert(Array.isArray(responseData), 'Should return array of results');
  });

  test('should call search_notes_advanced tool successfully', async () => {
    console.log('Testing search_notes_advanced...');

    try {
      const result = await client.callTool('search_notes_advanced', {
        type: 'general'
      });

      console.log('Advanced search result:', JSON.stringify(result, null, 2));

      assert(result, 'Should return a result');
      assert(result.content, 'Should have content property');
      assert(Array.isArray(result.content), 'Content should be an array');

      if (result.content.length > 0) {
        const responseData = JSON.parse(result.content[0].text);
        console.log('Parsed advanced response:', JSON.stringify(responseData, null, 2));

        assert(responseData.results, 'Should have results property');
        assert(Array.isArray(responseData.results), 'Results should be an array');
      }
    } catch (error) {
      console.error('Advanced search error:', error);
      throw error;
    }
  });

  test('should call search_notes_sql tool successfully', async () => {
    console.log('Testing search_notes_sql...');

    try {
      const result = await client.callTool('search_notes_sql', {
        query: 'SELECT COUNT(*) as total FROM notes'
      });

      console.log('SQL search result:', JSON.stringify(result, null, 2));

      assert(result, 'Should return a result');
      assert(result.content, 'Should have content property');
      assert(Array.isArray(result.content), 'Content should be an array');

      if (result.content.length > 0) {
        const responseData = JSON.parse(result.content[0].text);
        console.log('Parsed SQL response:', JSON.stringify(responseData, null, 2));

        assert(responseData.results, 'Should have results property');
        assert(Array.isArray(responseData.results), 'Results should be an array');
      }
    } catch (error) {
      console.error('SQL search error:', error);
      throw error;
    }
  });

  test('should handle search_notes_advanced with metadata filters', async () => {
    console.log('Testing search_notes_advanced with metadata filters...');

    try {
      const result = await client.callTool('search_notes_advanced', {
        metadata_filters: [{ key: 'type', value: 'general' }]
      });

      console.log('Metadata filter result:', JSON.stringify(result, null, 2));

      assert(result, 'Should return a result');
      assert(result.content, 'Should have content property');

      if (result.content && result.content.length > 0) {
        const responseData = JSON.parse(result.content[0].text);
        console.log(
          'Parsed metadata filter response:',
          JSON.stringify(responseData, null, 2)
        );

        assert(responseData.results !== undefined, 'Should have results property');
        assert(Array.isArray(responseData.results), 'Results should be an array');
      }
    } catch (error) {
      console.error('Metadata filter error:', error);
      throw error;
    }
  });

  test('should handle empty search results gracefully', async () => {
    console.log('Testing empty search results...');

    const result = await client.callTool('search_notes', {
      query: 'nonexistentterm12345'
    });

    console.log('Empty search result:', JSON.stringify(result, null, 2));

    assert(result, 'Should return a result');
    assert(result.content, 'Should have content property');

    const responseData = JSON.parse(result.content[0].text);
    console.log('Parsed empty response:', JSON.stringify(responseData, null, 2));

    // search_notes returns direct array, not object with results property
    assert(Array.isArray(responseData), 'Should return array of results');
    assert(responseData.length === 0, 'Should have no results');
  });
});
