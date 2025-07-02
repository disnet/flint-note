/**
 * Integration tests for new link management MCP tools
 *
 * Tests the complete MCP interface for link management including:
 * - get_note_links
 * - get_backlinks
 * - find_broken_links
 * - search_by_links
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  startServer,
  createTestNoteType,
  type IntegrationTestContext,
  INTEGRATION_CONSTANTS
} from './helpers/integration-utils.js';

/**
 * MCP client simulation for sending requests to the server
 */
class MCPClient {
  #serverProcess: any;

  constructor(serverProcess: any) {
    this.#serverProcess = serverProcess;
  }

  async sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2);
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      let responseData = '';
      let hasResponded = false;

      const timeout = setTimeout(() => {
        if (!hasResponded) {
          reject(new Error(`Request timeout after 5000ms: ${method}`));
        }
      }, 5000);

      // Listen for response on stdout
      const onData = (data: Buffer) => {
        responseData += data.toString();

        // Look for complete JSON-RPC response
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim() && line.includes(`"id":"${id}"`)) {
            try {
              const response = JSON.parse(line.trim());
              if (response.id === id) {
                hasResponded = true;
                clearTimeout(timeout);
                this.#serverProcess.stdout.off('data', onData);

                if (response.error) {
                  reject(new Error(`MCP Error: ${response.error.message}`));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch {
              // Continue looking for valid response
            }
          }
        }
      };

      this.#serverProcess.stdout.on('data', onData);
      this.#serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }

  async expectSuccess(toolName: string, args: any): Promise<any> {
    const result = await this.callTool(toolName, args);
    if (result.isError) {
      throw new Error(
        `Expected ${toolName} to succeed but got error: ${result.content[0].text}`
      );
    }
    return JSON.parse(result.content[0].text);
  }
}

describe('Link Management Tools Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('link-management-tools');

    // Create test note types
    await createTestNoteType(context.tempDir, 'general', 'General purpose notes');
    await createTestNoteType(context.tempDir, 'projects', 'Project tracking notes');
    await createTestNoteType(context.tempDir, 'research', 'Research notes');

    // Start server and store in context for cleanup
    context.serverProcess = await startServer({
      workspacePath: context.tempDir,
      timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
    });
    client = new MCPClient(context.serverProcess);

    // Wait for server initialization
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterEach(async () => {
    await cleanupIntegrationWorkspace(context);
  });

  describe('get_note_links tool', () => {
    test('should get all links for a note with various link types', async () => {
      // Create target notes
      const targetResult1 = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Target Project',
        content: 'This is a target project.'
      });

      const targetResult2 = await client.expectSuccess('create_note', {
        type: 'research',
        title: 'Research Topic',
        content: 'Research content here.'
      });

      // Create source note with various link types
      const sourceContent = `# Source Note

This note references [[${targetResult1.id}|Target Project]] and [[${targetResult2.id}]].

Also contains [external link](https://example.com) and ![image](https://test.com/image.png).

Plain URL: https://github.com/example/repo

Broken link: [[non-existent-note]]`;

      const sourceResult = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Source Note',
        content: sourceContent
      });

      // Wait a moment for link extraction to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get links for the source note
      const linksData = await client.expectSuccess('get_note_links', {
        identifier: sourceResult.id
      });

      assert.ok(linksData.success);
      assert.strictEqual(linksData.note_id, sourceResult.id);

      // Check outgoing internal links (wikilinks)
      assert.strictEqual(linksData.links.outgoing_internal.length, 3);

      const validLinks = linksData.links.outgoing_internal.filter(
        (link: any) => link.target_note_id !== null
      );
      const brokenLinks = linksData.links.outgoing_internal.filter(
        (link: any) => link.target_note_id === null
      );

      assert.strictEqual(validLinks.length, 2);
      assert.strictEqual(brokenLinks.length, 1);
      assert.strictEqual(brokenLinks[0].target_title, 'non-existent-note');

      // Check outgoing external links (may be more due to multiple pattern matching)
      assert.ok(linksData.links.outgoing_external.length >= 3);

      const urls = linksData.links.outgoing_external.map((link: any) => link.url);
      assert.ok(urls.includes('https://example.com'));
      assert.ok(urls.includes('https://test.com/image.png'));
      assert.ok(urls.includes('https://github.com/example/repo'));

      // Check link types
      const linkTypes = linksData.links.outgoing_external.map(
        (link: any) => link.link_type
      );
      assert.ok(linkTypes.includes('url'));
      assert.ok(linkTypes.includes('image'));
    });

    test('should get incoming links for a target note', async () => {
      // Create target note
      const targetResult = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Popular Target',
        content: 'This note will be linked to by others.'
      });

      // Create source notes that link to the target
      await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Source 1',
        content: `Links to [[${targetResult.id}|Popular Target]].`
      });

      await client.expectSuccess('create_note', {
        type: 'research',
        title: 'Source 2',
        content: `Also references [[${targetResult.id}]].`
      });

      // Wait for link extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get links for the target note
      const linksData = await client.expectSuccess('get_note_links', {
        identifier: targetResult.id
      });

      // Should have 2 incoming links
      assert.strictEqual(linksData.links.incoming.length, 2);

      const sourceIds = linksData.links.incoming.map((link: any) => link.source_note_id);
      assert.strictEqual(sourceIds.length, 2);
    });

    test('should handle note with no links', async () => {
      const noteResult = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Isolated Note',
        content: 'This note has no links at all.'
      });

      const linksData = await client.expectSuccess('get_note_links', {
        identifier: noteResult.id
      });

      assert.ok(linksData.success);
      assert.strictEqual(linksData.links.outgoing_internal.length, 0);
      assert.strictEqual(linksData.links.outgoing_external.length, 0);
      assert.strictEqual(linksData.links.incoming.length, 0);
    });
  });

  describe('get_backlinks tool', () => {
    test('should get all notes that link to a target', async () => {
      // Create target note
      const targetResult = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Central Hub',
        content: 'This is a central hub note.'
      });

      // Create multiple notes linking to the target
      const source1 = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Source 1',
        content: `References [[${targetResult.id}|Central Hub]].`
      });

      const source2 = await client.expectSuccess('create_note', {
        type: 'research',
        title: 'Source 2',
        content: `Also links to [[${targetResult.id}]].`
      });

      const source3 = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Source 3',
        content: `Multiple references: [[${targetResult.id}]] and [[${targetResult.id}|Hub]].`
      });

      // Wait for link extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      const backlinksData = await client.expectSuccess('get_backlinks', {
        identifier: targetResult.id
      });

      assert.ok(backlinksData.success);
      assert.strictEqual(backlinksData.note_id, targetResult.id);
      assert.ok(backlinksData.backlinks.length >= 3); // May be more due to multiple link extractions

      const sourceIds = backlinksData.backlinks.map((link: any) => link.source_note_id);
      assert.ok(sourceIds.includes(source1.id));
      assert.ok(sourceIds.includes(source2.id));
      assert.ok(sourceIds.includes(source3.id));
    });

    test('should handle note with no backlinks', async () => {
      const noteResult = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Lonely Note',
        content: 'No one links to this note.'
      });

      const backlinksData = await client.expectSuccess('get_backlinks', {
        identifier: noteResult.id
      });

      assert.ok(backlinksData.success);
      assert.strictEqual(backlinksData.backlinks.length, 0);
    });
  });

  describe('find_broken_links tool', () => {
    test('should find all broken wikilinks across the vault', async () => {
      // Create notes with broken links
      await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Note with Broken Links',
        content: `Links to [[non-existent-1]] and [[missing-note|Missing]].`
      });

      await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Another Broken',
        content: `References [[another-missing]] note.`
      });

      // Create a note with valid links
      const validTarget = await client.expectSuccess('create_note', {
        type: 'research',
        title: 'Valid Target',
        content: 'This note exists.'
      });

      await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Mixed Links',
        content: `Valid: [[${validTarget.id}]] and broken: [[does-not-exist]].`
      });

      // Wait for link extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      const brokenData = await client.expectSuccess('find_broken_links', {});

      assert.ok(brokenData.success);
      assert.strictEqual(brokenData.count, 4); // Total broken links

      const brokenTitles = brokenData.broken_links.map((link: any) => link.target_title);
      assert.ok(brokenTitles.includes('non-existent-1'));
      assert.ok(brokenTitles.includes('missing-note'));
      assert.ok(brokenTitles.includes('another-missing'));
      assert.ok(brokenTitles.includes('does-not-exist'));
    });

    test('should return empty result when no broken links exist', async () => {
      // Create notes with only valid links
      const target = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Target Note',
        content: 'Target content.'
      });

      await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Source Note',
        content: `Links to [[${target.id}|Target Note]].`
      });

      // Wait for link extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      const brokenData = await client.expectSuccess('find_broken_links', {});

      assert.ok(brokenData.success);
      assert.strictEqual(brokenData.count, 0);
      assert.strictEqual(brokenData.broken_links.length, 0);
    });
  });

  describe('search_by_links tool', () => {
    let hubNote: any;
    let projectNote: any;
    let researchNote: any;

    beforeEach(async () => {
      // Set up a network of linked notes
      hubNote = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Hub Note',
        content: 'Central hub for linking.'
      });

      projectNote = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Project Note',
        content: 'Project content with external link: https://github.com/example/repo'
      });

      researchNote = await client.expectSuccess('create_note', {
        type: 'research',
        title: 'Research Note',
        content: `Research that references [[${hubNote.id}]] and external: https://arxiv.org/paper123`
      });

      // Create linking notes
      await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Linker 1',
        content: `Links to [[${hubNote.id}|Hub]] and [[${projectNote.id}]].`
      });

      await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Linker 2',
        content: `References [[${researchNote.id}]] and has broken: [[missing-note]].`
      });

      // Wait for link extraction
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    test('should find notes that link to specific targets', async () => {
      const searchData = await client.expectSuccess('search_by_links', {
        has_links_to: [hubNote.id, projectNote.id]
      });

      assert.ok(searchData.success);
      assert.strictEqual(searchData.count, 2); // Two linker notes

      const foundTitles = searchData.notes.map((note: any) => note.title);
      assert.ok(foundTitles.includes('Linker 1'));
    });

    test('should find notes linked from specific sources', async () => {
      // Find notes that are linked from the research note
      const searchData = await client.expectSuccess('search_by_links', {
        linked_from: [researchNote.id]
      });

      assert.ok(searchData.success);
      assert.strictEqual(searchData.count, 1);
      assert.strictEqual(searchData.notes[0].id, hubNote.id);
    });

    test('should find notes with external links to specific domains', async () => {
      const searchData = await client.expectSuccess('search_by_links', {
        external_domains: ['github.com']
      });

      assert.ok(searchData.success);
      assert.strictEqual(searchData.count, 1);
      assert.strictEqual(searchData.notes[0].id, projectNote.id);
    });

    test('should find notes with broken links', async () => {
      const searchData = await client.expectSuccess('search_by_links', {
        broken_links: true
      });

      assert.ok(searchData.success);
      assert.strictEqual(searchData.count, 1);
      assert.strictEqual(searchData.notes[0].title, 'Linker 2');
    });

    test('should handle search with no results', async () => {
      const searchData = await client.expectSuccess('search_by_links', {
        external_domains: ['nonexistent.com']
      });

      assert.ok(searchData.success);
      assert.strictEqual(searchData.count, 0);
      assert.strictEqual(searchData.notes.length, 0);
    });

    test('should handle multiple domain search', async () => {
      const searchData = await client.expectSuccess('search_by_links', {
        external_domains: ['github.com', 'arxiv.org']
      });

      assert.ok(searchData.success);
      assert.strictEqual(searchData.count, 2);

      const foundTitles = searchData.notes.map((note: any) => note.title);
      assert.ok(foundTitles.includes('Project Note'));
      assert.ok(foundTitles.includes('Research Note'));
    });
  });

  describe('Error handling', () => {
    test('should handle non-existent note for get_note_links', async () => {
      const result = await client.callTool('get_note_links', {
        identifier: 'general/non-existent.md'
      });

      // Check if it's an error response
      const isError =
        result.isError === true ||
        (result.content &&
          result.content[0] &&
          (result.content[0].text.includes('error') ||
            result.content[0].text.includes('not found') ||
            result.content[0].text.includes('Error')));

      assert.ok(isError, 'Expected error response for non-existent note');
    });

    test('should handle non-existent note for get_backlinks', async () => {
      const result = await client.callTool('get_backlinks', {
        identifier: 'general/non-existent.md'
      });

      // Check if it's an error response
      const isError =
        result.isError === true ||
        (result.content &&
          result.content[0] &&
          (result.content[0].text.includes('error') ||
            result.content[0].text.includes('not found') ||
            result.content[0].text.includes('Error')));

      assert.ok(isError, 'Expected error response for non-existent note');
    });

    test('should handle empty search criteria for search_by_links', async () => {
      const searchData = await client.expectSuccess('search_by_links', {});

      // Should return empty results when no criteria provided
      assert.ok(searchData.success);
      assert.strictEqual(searchData.count, 0);
    });
  });
});
