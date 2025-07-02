/**
 * Integration tests for link synchronization functionality
 *
 * Tests that links are automatically extracted, updated, and cleaned up
 * during note create, update, rename, and delete operations.
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

describe('Link Synchronization Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('link-synchronization');

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

  describe('Link extraction on note creation', () => {
    test('should automatically extract links when creating a note', async () => {
      // Create target note first
      const targetResult = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Target Project',
        content: 'This is the target project.'
      });

      // Create source note with various link types
      const sourceContent = `# Source Note

This references [[${targetResult.id}|Target Project]] and external [GitHub](https://github.com/example).

![Image](https://example.com/image.png)

Plain URL: https://docs.example.com

Broken link: [[non-existent-note]]`;

      const sourceResult = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Source Note',
        content: sourceContent
      });

      // Wait for link extraction to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify links were extracted
      const linksData = await client.expectSuccess('get_note_links', {
        identifier: sourceResult.id
      });

      // Should have internal links (including broken one)
      assert.strictEqual(linksData.links.outgoing_internal.length, 2);

      const validLinks = linksData.links.outgoing_internal.filter(
        (link: any) => link.target_note_id !== null
      );
      const brokenLinks = linksData.links.outgoing_internal.filter(
        (link: any) => link.target_note_id === null
      );

      assert.strictEqual(validLinks.length, 1);
      assert.strictEqual(validLinks[0].target_note_id, targetResult.id);

      assert.strictEqual(brokenLinks.length, 1);
      assert.strictEqual(brokenLinks[0].target_title, 'non-existent-note');

      // Should have external links (may be more due to multiple pattern matching)
      assert.ok(linksData.links.outgoing_external.length >= 3);

      const urls = linksData.links.outgoing_external.map((link: any) => link.url);
      assert.ok(urls.includes('https://github.com/example'));
      assert.ok(urls.includes('https://example.com/image.png'));
      assert.ok(urls.includes('https://docs.example.com'));

      // Verify target note has incoming link
      const targetLinksData = await client.expectSuccess('get_note_links', {
        identifier: targetResult.id
      });

      assert.strictEqual(targetLinksData.links.incoming.length, 1);
      assert.strictEqual(
        targetLinksData.links.incoming[0].source_note_id,
        sourceResult.id
      );
    });
  });

  describe('Link updates on note content changes', () => {
    test('should update links when note content is modified', async () => {
      // Create initial note with links
      const initialContent = `# Test Note

Links to [[non-existent]] and external: https://old-site.com`;

      const noteResult = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Test Note',
        content: initialContent
      });

      // Wait for initial link extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify initial links
      let linksData = await client.expectSuccess('get_note_links', {
        identifier: noteResult.id
      });

      assert.strictEqual(linksData.links.outgoing_internal.length, 1);
      assert.strictEqual(
        linksData.links.outgoing_internal[0].target_title,
        'non-existent'
      );
      assert.strictEqual(linksData.links.outgoing_external.length, 1);
      assert.strictEqual(
        linksData.links.outgoing_external[0].url,
        'https://old-site.com'
      );

      // Create a target note
      const targetResult = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Real Target',
        content: 'This is a real target.'
      });

      // Update note content with new links
      const noteData = await client.expectSuccess('get_note', {
        identifier: noteResult.id
      });

      const updatedContent = `# Test Note

Now links to [[${targetResult.id}|Real Target]] and new external: https://new-site.com

Also: [Documentation](https://docs.new-site.com)`;

      await client.expectSuccess('update_note', {
        identifier: noteResult.id,
        content: updatedContent,
        content_hash: noteData.content_hash
      });

      // Wait for link re-extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify updated links
      linksData = await client.expectSuccess('get_note_links', {
        identifier: noteResult.id
      });

      // Should have new internal link
      assert.strictEqual(linksData.links.outgoing_internal.length, 1);
      assert.strictEqual(
        linksData.links.outgoing_internal[0].target_note_id,
        targetResult.id
      );
      assert.strictEqual(
        linksData.links.outgoing_internal[0].target_title,
        targetResult.id
      );

      // Should have new external links (may be more due to multiple pattern matching)
      assert.ok(linksData.links.outgoing_external.length >= 2);
      const urls = linksData.links.outgoing_external.map((link: any) => link.url);
      assert.ok(urls.includes('https://new-site.com'));
      assert.ok(urls.includes('https://docs.new-site.com'));
      assert.ok(!urls.includes('https://old-site.com')); // Old link should be gone
    });
  });

  describe('Link resolution on note rename', () => {
    test('should resolve broken links when target note is renamed to match', async () => {
      // Create source note with broken link
      const sourceResult = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Source Note',
        content: 'This links to [[Future Note Title]] which does not exist yet.'
      });

      // Wait for link extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify broken link exists
      let brokenLinksData = await client.expectSuccess('find_broken_links', {});
      assert.strictEqual(brokenLinksData.count, 1);
      assert.strictEqual(
        brokenLinksData.broken_links[0].target_title,
        'Future Note Title'
      );

      // Create target note with different title
      const targetResult = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Original Title',
        content: 'This will be renamed.'
      });

      // Get target note for content hash
      const targetData = await client.expectSuccess('get_note', {
        identifier: targetResult.id
      });

      // Rename target note to match broken link
      const renameResult = await client.expectSuccess('rename_note', {
        identifier: targetResult.id,
        new_title: 'Future Note Title',
        content_hash: targetData.content_hash
      });

      // Verify broken links were resolved
      assert.strictEqual(renameResult.broken_links_resolved, 1);

      // Verify no more broken links exist
      brokenLinksData = await client.expectSuccess('find_broken_links', {});
      assert.strictEqual(brokenLinksData.count, 0);

      // Verify source note now has valid link
      const sourceLinksData = await client.expectSuccess('get_note_links', {
        identifier: sourceResult.id
      });

      assert.strictEqual(sourceLinksData.links.outgoing_internal.length, 1);
      assert.strictEqual(
        sourceLinksData.links.outgoing_internal[0].target_note_id,
        targetResult.id
      );
      assert.strictEqual(
        sourceLinksData.links.outgoing_internal[0].target_title,
        'Future Note Title'
      );
    });

    test('should not affect existing valid links when renaming', async () => {
      // Create target note
      const targetResult = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Target Note',
        content: 'Target content.'
      });

      // Create source note linking to target
      const sourceResult = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Source Note',
        content: `Links to [[${targetResult.id}|Target Note]].`
      });

      // Wait for link extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify initial valid link
      let sourceLinksData = await client.expectSuccess('get_note_links', {
        identifier: sourceResult.id
      });

      assert.strictEqual(sourceLinksData.links.outgoing_internal.length, 1);
      assert.strictEqual(
        sourceLinksData.links.outgoing_internal[0].target_note_id,
        targetResult.id
      );

      // Rename target note
      const targetData = await client.expectSuccess('get_note', {
        identifier: targetResult.id
      });

      await client.expectSuccess('rename_note', {
        identifier: targetResult.id,
        new_title: 'Renamed Target',
        content_hash: targetData.content_hash
      });

      // Verify link still exists and is valid
      sourceLinksData = await client.expectSuccess('get_note_links', {
        identifier: sourceResult.id
      });

      assert.strictEqual(sourceLinksData.links.outgoing_internal.length, 1);
      assert.strictEqual(
        sourceLinksData.links.outgoing_internal[0].target_note_id,
        targetResult.id
      );
    });
  });

  describe('Link cleanup on note deletion', () => {
    test('should clean up all links when note is deleted', async () => {
      // Create target notes
      const target1Result = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Target 1',
        content: 'First target.'
      });

      const target2Result = await client.expectSuccess('create_note', {
        type: 'research',
        title: 'Target 2',
        content: 'Second target.'
      });

      // Create source note with links
      const sourceContent = `# Source Note

Links to [[${target1Result.id}|Target 1]] and [[${target2Result.id}]].

External: https://example.com`;

      const sourceResult = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Source Note',
        content: sourceContent
      });

      // Create another note linking to source
      await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Linker Note',
        content: `References [[${sourceResult.id}|Source Note]].`
      });

      // Wait for link extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify initial link state
      const sourceLinksData = await client.expectSuccess('get_note_links', {
        identifier: sourceResult.id
      });

      assert.strictEqual(sourceLinksData.links.outgoing_internal.length, 2);
      assert.strictEqual(sourceLinksData.links.outgoing_external.length, 1);
      assert.strictEqual(sourceLinksData.links.incoming.length, 1);

      // Delete the source note
      await client.expectSuccess('delete_note', {
        identifier: sourceResult.id,
        confirm: true
      });

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify outgoing links are gone
      try {
        await client.expectSuccess('get_note_links', {
          identifier: sourceResult.id
        });
        assert.fail('Should not be able to get links for deleted note');
      } catch {
        // Expected error
      }

      // Verify incoming links became broken
      const brokenLinksData = await client.expectSuccess('find_broken_links', {});
      assert.strictEqual(brokenLinksData.count, 1);
      assert.strictEqual(brokenLinksData.broken_links[0].target_title, sourceResult.id);
    });
  });

  describe('Link synchronization edge cases', () => {
    test('should handle notes with same title but different IDs', async () => {
      // Create two notes with same title in different types
      const note1Result = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Same Title',
        content: 'First note with this title.'
      });

      const _note2Result = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Same Title',
        content: 'Second note with same title.'
      });

      // Create source note linking by ID (should link to specific note)
      const sourceResult = await client.expectSuccess('create_note', {
        type: 'research',
        title: 'Source',
        content: `Links to [[${note1Result.id}|Same Title]] specifically.`
      });

      // Wait for link extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify link points to correct note
      const linksData = await client.expectSuccess('get_note_links', {
        identifier: sourceResult.id
      });

      assert.strictEqual(linksData.links.outgoing_internal.length, 1);
      assert.strictEqual(
        linksData.links.outgoing_internal[0].target_note_id,
        note1Result.id
      );
    });

    test('should handle circular link references', async () => {
      // Create two notes that reference each other
      const note1Result = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Note 1',
        content: 'This will link to Note 2.'
      });

      const note2Result = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Note 2',
        content: `Links back to [[${note1Result.id}|Note 1]].`
      });

      // Update note 1 to link to note 2
      const note1Data = await client.expectSuccess('get_note', {
        identifier: note1Result.id
      });

      await client.expectSuccess('update_note', {
        identifier: note1Result.id,
        content: `Links to [[${note2Result.id}|Note 2]].`,
        content_hash: note1Data.content_hash
      });

      // Wait for link extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify both notes have correct links
      const note1LinksData = await client.expectSuccess('get_note_links', {
        identifier: note1Result.id
      });

      const note2LinksData = await client.expectSuccess('get_note_links', {
        identifier: note2Result.id
      });

      // Note 1 should link to Note 2 and have incoming from Note 2
      assert.strictEqual(note1LinksData.links.outgoing_internal.length, 1);
      assert.strictEqual(
        note1LinksData.links.outgoing_internal[0].target_note_id,
        note2Result.id
      );
      assert.strictEqual(note1LinksData.links.incoming.length, 1);
      assert.strictEqual(note1LinksData.links.incoming[0].source_note_id, note2Result.id);

      // Note 2 should link to Note 1 and have incoming from Note 1
      assert.strictEqual(note2LinksData.links.outgoing_internal.length, 1);
      assert.strictEqual(
        note2LinksData.links.outgoing_internal[0].target_note_id,
        note1Result.id
      );
      assert.strictEqual(note2LinksData.links.incoming.length, 1);
      assert.strictEqual(note2LinksData.links.incoming[0].source_note_id, note1Result.id);
    });

    test('should handle rapid successive note updates', async () => {
      // Create target note
      const targetResult = await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'Target',
        content: 'Target content.'
      });

      // Create source note
      const sourceResult = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Source',
        content: 'Initial content with no links.'
      });

      // Wait for initial extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Perform rapid updates
      for (let i = 1; i <= 3; i++) {
        const noteData = await client.expectSuccess('get_note', {
          identifier: sourceResult.id
        });

        const newContent = `# Source Update ${i}

Links to [[${targetResult.id}|Target]] - Update ${i}.

External: https://example${i}.com`;

        await client.expectSuccess('update_note', {
          identifier: sourceResult.id,
          content: newContent,
          content_hash: noteData.content_hash
        });

        // Small delay between updates
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Wait for final extraction
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify final state is correct
      const finalLinksData = await client.expectSuccess('get_note_links', {
        identifier: sourceResult.id
      });

      assert.strictEqual(finalLinksData.links.outgoing_internal.length, 1);
      assert.strictEqual(
        finalLinksData.links.outgoing_internal[0].target_note_id,
        targetResult.id
      );

      assert.strictEqual(finalLinksData.links.outgoing_external.length, 1);
      assert.strictEqual(
        finalLinksData.links.outgoing_external[0].url,
        'https://example3.com'
      );
    });
  });
});
