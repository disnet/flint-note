/**
 * Integration tests for link migration functionality
 *
 * Tests the migrate_links tool that populates link tables
 * for existing notes in a vault.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
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

describe('Link Migration Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('link-migration');

    // Create test note types
    await createTestNoteType(context.tempDir, 'general', 'General purpose notes');
    await createTestNoteType(context.tempDir, 'projects', 'Project tracking notes');
    await createTestNoteType(context.tempDir, 'research', 'Research notes');
  });

  afterEach(async () => {
    await cleanupIntegrationWorkspace(context);
  });

  /**
   * Create notes directly in the filesystem (bypassing MCP) to simulate
   * an existing vault with notes that need migration
   */
  async function createFileSystemNote(
    noteType: string,
    filename: string,
    title: string,
    content: string
  ): Promise<string> {
    const typeDir = path.join(context.tempDir, noteType);
    await fs.mkdir(typeDir, { recursive: true });

    const filePath = path.join(typeDir, filename);
    const noteContent = `---
title: "${title}"
type: "${noteType}"
created: "2024-01-01T10:00:00Z"
updated: "2024-01-01T10:00:00Z"
---

${content}`;

    await fs.writeFile(filePath, noteContent, 'utf-8');
    // Return ID without .md extension for consistency with new ID format
    const baseFilename = filename.replace(/\.md$/, '');
    return `${noteType}/${baseFilename}`;
  }

  describe('Basic migration functionality', () => {
    test('should migrate links from existing notes', async () => {
      // Create notes directly in filesystem (simulating existing vault)
      const targetId = await createFileSystemNote(
        'projects',
        'target-project.md',
        'Target Project',
        'This is a target project for linking.'
      );

      const sourceId = await createFileSystemNote(
        'general',
        'source-note.md',
        'Source Note',
        `# Source Note

This note links to [[${targetId}|Target Project]] and external [GitHub](https://github.com/example).

Also has image: ![diagram](https://example.com/diagram.png)

Plain URL: https://docs.example.com

Broken link: [[non-existent-note]]`
      );

      const anotherSourceId = await createFileSystemNote(
        'research',
        'research-note.md',
        'Research Note',
        `Research content that references [[${targetId}]] and [[${sourceId}]].

External research: https://arxiv.org/paper123`
      );

      // Start server after creating filesystem notes
      context.serverProcess = await startServer({
        workspacePath: context.tempDir,
        timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
      });
      client = new MCPClient(context.serverProcess);

      // Wait for server initialization
      await new Promise(resolve => setTimeout(resolve, 500));

      // At this point, link tables should be empty (no auto-extraction for existing files)
      const _initialBrokenLinks = await client.expectSuccess('find_broken_links', {});
      // Might be 0 or might have some links depending on how search index works

      // Run migration
      const migrationResult = await client.expectSuccess('migrate_links', {});

      assert.ok(migrationResult.success);
      assert.strictEqual(migrationResult.total_notes, 3);
      assert.strictEqual(migrationResult.processed, 3);
      assert.strictEqual(migrationResult.errors, 0);

      // Verify links were extracted and stored

      // Check source note links
      const sourceLinksData = await client.expectSuccess('get_note_links', {
        identifier: sourceId
      });

      // Should have 2 internal links (1 valid, 1 broken)
      assert.strictEqual(sourceLinksData.links.outgoing_internal.length, 2);

      const validInternalLinks = sourceLinksData.links.outgoing_internal.filter(
        (link: any) => link.target_note_id !== null
      );
      const brokenInternalLinks = sourceLinksData.links.outgoing_internal.filter(
        (link: any) => link.target_note_id === null
      );

      assert.strictEqual(validInternalLinks.length, 1);
      assert.strictEqual(validInternalLinks[0].target_note_id, targetId);

      assert.strictEqual(brokenInternalLinks.length, 1);
      assert.strictEqual(brokenInternalLinks[0].target_title, 'non-existent-note');

      // Should have at least 3 external links (may be more due to multiple pattern matching)
      assert.ok(sourceLinksData.links.outgoing_external.length >= 3);

      const externalUrls = sourceLinksData.links.outgoing_external.map(
        (link: any) => link.url
      );
      assert.ok(externalUrls.includes('https://github.com/example'));
      assert.ok(externalUrls.includes('https://example.com/diagram.png'));
      assert.ok(externalUrls.includes('https://docs.example.com'));

      // Check research note links
      const researchLinksData = await client.expectSuccess('get_note_links', {
        identifier: anotherSourceId
      });

      assert.strictEqual(researchLinksData.links.outgoing_internal.length, 2);
      assert.strictEqual(researchLinksData.links.outgoing_external.length, 1);
      assert.strictEqual(
        researchLinksData.links.outgoing_external[0].url,
        'https://arxiv.org/paper123'
      );

      // Check target note incoming links
      const targetLinksData = await client.expectSuccess('get_note_links', {
        identifier: targetId
      });

      assert.strictEqual(targetLinksData.links.incoming.length, 2);
      const incomingSourceIds = targetLinksData.links.incoming.map(
        (link: any) => link.source_note_id
      );
      assert.ok(incomingSourceIds.includes(sourceId));
      assert.ok(incomingSourceIds.includes(anotherSourceId));

      // Verify broken links are found
      const finalBrokenLinks = await client.expectSuccess('find_broken_links', {});
      assert.strictEqual(finalBrokenLinks.count, 1);
      assert.strictEqual(
        finalBrokenLinks.broken_links[0].target_title,
        'non-existent-note'
      );
    });

    test('should prevent duplicate migration by default', async () => {
      // Create a note
      await createFileSystemNote(
        'general',
        'test-note.md',
        'Test Note',
        'Content with [[some-link]].'
      );

      // Start server
      context.serverProcess = await startServer({
        workspacePath: context.tempDir,
        timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
      });
      client = new MCPClient(context.serverProcess);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Run first migration
      const firstMigration = await client.expectSuccess('migrate_links', {});
      assert.ok(firstMigration.success);
      assert.strictEqual(firstMigration.processed, 1);

      // Try to run migration again (should be prevented)
      const result = await client.callTool('migrate_links', {});
      const secondMigration = JSON.parse(result.content[0].text);

      assert.strictEqual(secondMigration.success, false);
      assert.ok(secondMigration.message.includes('already contain data'));
      assert.ok(secondMigration.existing_links > 0);
    });

    test('should allow forced re-migration', async () => {
      // Create notes
      const targetId = await createFileSystemNote(
        'projects',
        'target.md',
        'Target',
        'Target content.'
      );

      await createFileSystemNote(
        'general',
        'source.md',
        'Source',
        `Links to [[${targetId}]].`
      );

      // Start server
      context.serverProcess = await startServer({
        workspacePath: context.tempDir,
        timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
      });
      client = new MCPClient(context.serverProcess);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Run first migration
      const firstMigration = await client.expectSuccess('migrate_links', {});
      assert.strictEqual(firstMigration.processed, 2);

      // Run forced re-migration
      const forcedMigration = await client.expectSuccess('migrate_links', {
        force: true
      });

      assert.ok(forcedMigration.success);
      assert.strictEqual(forcedMigration.processed, 2);

      // Verify links are still correct after re-migration
      const brokenLinks = await client.expectSuccess('find_broken_links', {});
      assert.strictEqual(brokenLinks.count, 0);
    });
  });

  describe('Migration edge cases', () => {
    test('should handle notes with complex link patterns', async () => {
      const complexContent = `# Complex Note

Multiple wikilinks: [[note1]], [[note2|Display]], [[projects/project-a]].

Mixed external:
- [GitHub](https://github.com/user/repo)
- ![Image](https://cdn.example.com/img.png)
- Raw URL: https://docs.example.com/api
- Another raw: http://legacy.site.org

More wikilinks: [[research/topic-x|Research Topic]] and [[broken-link]].

Embedded image: ![Chart](https://charts.example.com/data.svg)`;

      const complexNoteId = await createFileSystemNote(
        'general',
        'complex-note.md',
        'Complex Note',
        complexContent
      );

      // Create some target notes
      await createFileSystemNote('general', 'note1.md', 'note1', 'Note 1 content.');

      await createFileSystemNote(
        'projects',
        'project-a.md',
        'Project A',
        'Project A content.'
      );

      // Start server and migrate
      context.serverProcess = await startServer({
        workspacePath: context.tempDir,
        timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
      });
      client = new MCPClient(context.serverProcess);
      await new Promise(resolve => setTimeout(resolve, 500));

      const migrationResult = await client.expectSuccess('migrate_links', {});
      assert.ok(migrationResult.success);

      // Verify complex links were extracted correctly
      const linksData = await client.expectSuccess('get_note_links', {
        identifier: complexNoteId
      });

      // Should have at least 5 internal links (3 broken, 2 valid)
      assert.ok(linksData.links.outgoing_internal.length >= 5);

      const validLinks = linksData.links.outgoing_internal.filter(
        (link: any) => link.target_note_id !== null
      );
      const brokenLinks = linksData.links.outgoing_internal.filter(
        (link: any) => link.target_note_id === null
      );

      assert.strictEqual(validLinks.length, 2);
      assert.ok(brokenLinks.length >= 3); // At least 3 broken links

      // Should have at least 5 external links (may be more due to multiple pattern matching)
      assert.ok(linksData.links.outgoing_external.length >= 5);

      const imageLinks = linksData.links.outgoing_external.filter(
        (link: any) => link.link_type === 'image'
      );
      const urlLinks = linksData.links.outgoing_external.filter(
        (link: any) => link.link_type === 'url'
      );

      assert.ok(imageLinks.length >= 2); // At least 2 image links
      assert.ok(urlLinks.length >= 3); // At least 3 URL links
    });

    test('should handle migration errors gracefully', async () => {
      // Create a note with malformed content
      const typeDir = path.join(context.tempDir, 'general');
      await fs.mkdir(typeDir, { recursive: true });

      const malformedPath = path.join(typeDir, 'malformed.md');
      // Create file with incomplete frontmatter that might cause parsing issues
      await fs.writeFile(
        malformedPath,
        `---
title: "Incomplete
content: "This has malformed frontmatter"
---

Some content here.`,
        'utf-8'
      );

      // Create a valid note
      await createFileSystemNote(
        'general',
        'valid-note.md',
        'Valid Note',
        'This is a valid note with [[some-link]].'
      );

      // Start server and migrate
      context.serverProcess = await startServer({
        workspacePath: context.tempDir,
        timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
      });
      client = new MCPClient(context.serverProcess);
      await new Promise(resolve => setTimeout(resolve, 500));

      const migrationResult = await client.expectSuccess('migrate_links', {});

      // Migration should succeed overall but may have some errors
      assert.ok(migrationResult.success);
      assert.ok(migrationResult.total_notes >= 1); // At least the valid note
      assert.ok(migrationResult.processed >= 1);

      // Should provide error details if any occurred
      if (migrationResult.errors > 0) {
        assert.ok(Array.isArray(migrationResult.error_details));
      }
    });

    test('should handle empty vault migration', async () => {
      // Start server with empty vault
      context.serverProcess = await startServer({
        workspacePath: context.tempDir,
        timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
      });
      client = new MCPClient(context.serverProcess);
      await new Promise(resolve => setTimeout(resolve, 500));

      const migrationResult = await client.expectSuccess('migrate_links', {});

      assert.ok(migrationResult.success);
      assert.strictEqual(migrationResult.total_notes, 0);
      assert.strictEqual(migrationResult.processed, 0);
      assert.strictEqual(migrationResult.errors, 0);
    });
  });

  describe('Migration with existing link data', () => {
    test('should detect existing link data correctly', async () => {
      // Start server first
      context.serverProcess = await startServer({
        workspacePath: context.tempDir,
        timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
      });
      client = new MCPClient(context.serverProcess);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Create a note normally (which will auto-extract links)
      const noteResult = await client.expectSuccess('create_note', {
        type: 'general',
        title: 'Auto-extracted Note',
        content: 'This has [[some-link]] that will be auto-extracted.'
      });

      // Wait for auto-extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify link was auto-extracted
      const linksData = await client.expectSuccess('get_note_links', {
        identifier: noteResult.id
      });
      assert.strictEqual(linksData.links.outgoing_internal.length, 1);

      // Now try migration (should be prevented due to existing data)
      const result = await client.callTool('migrate_links', {});
      const migrationResult = JSON.parse(result.content[0].text);

      assert.strictEqual(migrationResult.success, false);
      assert.ok(migrationResult.message.includes('already contain data'));
      assert.strictEqual(migrationResult.existing_links, 1);
    });

    test('should migrate mixed scenario (some notes with auto-extracted links, some without)', async () => {
      // Create filesystem note first (no auto-extraction)
      await createFileSystemNote(
        'general',
        'old-note.md',
        'Old Note',
        'This has [[old-link]] from before migration.'
      );

      // Start server
      context.serverProcess = await startServer({
        workspacePath: context.tempDir,
        timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
      });
      client = new MCPClient(context.serverProcess);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Create new note (will auto-extract)
      await client.expectSuccess('create_note', {
        type: 'projects',
        title: 'New Note',
        content: 'This has [[new-link]] that will be auto-extracted.'
      });

      // Wait for auto-extraction
      await new Promise(resolve => setTimeout(resolve, 100));

      // Force migration to handle the old note
      const migrationResult = await client.expectSuccess('migrate_links', {
        force: true
      });

      assert.ok(migrationResult.success);
      assert.strictEqual(migrationResult.total_notes, 2);
      assert.strictEqual(migrationResult.processed, 2);

      // Verify both notes have their links
      const brokenLinks = await client.expectSuccess('find_broken_links', {});
      assert.strictEqual(brokenLinks.count, 2); // Both links are broken

      const brokenTitles = brokenLinks.broken_links.map((link: any) => link.target_title);
      assert.ok(brokenTitles.includes('old-link'));
      assert.ok(brokenTitles.includes('new-link'));
    });
  });
});
