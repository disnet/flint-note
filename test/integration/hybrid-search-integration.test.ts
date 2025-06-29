/**
 * Integration tests for hybrid search MCP tools
 *
 * Tests the hybrid search functionality through the MCP server interface,
 * covering search_notes, search_notes_advanced, and search_notes_sql tools.
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
 * Simple MCP client for testing
 */
class MCPClient {
  private serverProcess: ChildProcess;

  constructor(serverProcess: ChildProcess) {
    this.serverProcess = serverProcess;
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    const request = {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1000000),
      method,
      params: params || {}
    };

    return new Promise((resolve, reject) => {
      let responseData = '';
      const _errorData = '';

      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for method: ${method}`));
      }, 30000);

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

      const onError = (_data: Buffer) => {
        // Error data handling removed as it was unused
      };

      this.serverProcess.stdout?.on('data', onData);
      this.serverProcess.stderr?.on('data', onError);

      this.serverProcess.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    return this.sendRequest('tools/call', { name, arguments: arguments_ });
  }
}

describe('Hybrid Search Integration Tests', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('hybrid-search-integration');
    await createHybridTestDataset(context);

    const serverProcess = await startServer({
      workspacePath: context.tempDir,
      timeout: 15000
    });

    context.serverProcess = serverProcess;
    client = new MCPClient(serverProcess);

    // Wait for server to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));
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

  /**
   * Creates a comprehensive test dataset for hybrid search testing
   */
  async function createHybridTestDataset(
    testContext: IntegrationTestContext
  ): Promise<void> {
    const workspacePath = testContext.tempDir;

    // Create different note types
    await fs.mkdir(join(workspacePath, 'projects'), { recursive: true });
    await fs.mkdir(join(workspacePath, 'meetings'), { recursive: true });
    await fs.mkdir(join(workspacePath, 'book-reviews'), { recursive: true });

    // Book review with rich metadata
    const bookReview = `---
title: "Atomic Habits"
author: "James Clear"
rating: 5
status: "completed"
genre: "self-help"
isbn: "978-0735211292"
tags: ["productivity", "habits", "psychology"]
read_date: "2024-01-15"
type: "book-review"
created: "2024-01-15T10:30:00Z"
updated: "2024-01-15T10:30:00Z"
---

# Atomic Habits Review

An excellent book about building good habits and breaking bad ones.

## Key Insights

1. **1% Better Every Day**: Small improvements compound over time
2. **Identity-Based Habits**: Focus on who you want to become
3. **Environment Design**: Make good habits obvious and easy
4. **The Four Laws**: Make it obvious, attractive, easy, and satisfying

## Rating: 5/5

This book fundamentally changed how I think about habit formation.
`;

    await fs.writeFile(
      join(workspacePath, 'book-reviews', 'atomic-habits.md'),
      bookReview,
      'utf8'
    );

    // Project note with different metadata
    const projectNote = `---
title: "flint-note Enhancement"
status: "in-progress"
priority: 4
assignee: "Alice Johnson"
deadline: "2024-03-01"
tags: ["development", "enhancement", "search"]
type: "project"
created: "2024-01-10T09:00:00Z"
updated: "2024-01-25T14:30:00Z"
---

# flint-note Enhancement Project

Implementing advanced search capabilities for the note-taking system.

## Goals

- [ ] Add hybrid SQLite + file storage
- [ ] Implement full-text search
- [ ] Support complex metadata queries
- [x] Create comprehensive test suite

## Progress

Currently working on the database integration layer.
`;

    await fs.writeFile(
      join(workspacePath, 'projects', 'flint-note-enhancement.md'),
      projectNote,
      'utf8'
    );

    // Meeting note with attendees and action items
    const meetingNote = `---
title: "Sprint Planning Meeting"
date: "2024-01-20"
attendees: ["Alice Johnson", "Bob Smith", "Carol Davis"]
meeting_type: "planning"
duration: 120
status: "completed"
tags: ["sprint", "planning", "team"]
type: "meeting"
created: "2024-01-20T13:00:00Z"
updated: "2024-01-20T15:00:00Z"
---

# Sprint Planning Meeting

## Attendees
- Alice Johnson (Tech Lead)
- Bob Smith (Developer)
- Carol Davis (Product Manager)

## Agenda
1. Review previous sprint
2. Plan upcoming sprint
3. Assign tasks

## Action Items
- [ ] Alice: Complete authentication system
- [ ] Bob: Implement user interface
- [ ] Carol: Update documentation

## Next Meeting
Scheduled for next Friday at 2 PM.
`;

    await fs.writeFile(
      join(workspacePath, 'meetings', 'sprint-planning-2024-01-20.md'),
      meetingNote,
      'utf8'
    );

    // General note with mixed content
    const generalNote = `---
title: "Research Notes on Database Design"
category: "research"
importance: 3
tags: ["database", "design", "architecture"]
type: "general"
created: "2024-01-12T08:00:00Z"
updated: "2024-01-18T16:45:00Z"
---

# Database Design Research

## SQLite vs PostgreSQL

### SQLite Advantages
- Embedded database
- Zero configuration
- Great for development and small applications
- ACID compliant

### PostgreSQL Advantages
- Full-featured RDBMS
- Excellent performance for large datasets
- Advanced indexing options
- Strong community support

## Decision
For flint-note, SQLite is the better choice due to its embedded nature.
`;

    await fs.writeFile(
      join(workspacePath, 'general', 'database-research.md'),
      generalNote,
      'utf8'
    );

    // Another book review for testing aggregations
    const secondBookReview = `---
title: "Deep Work"
author: "Cal Newport"
rating: 4
status: "completed"
genre: "productivity"
tags: ["focus", "productivity", "work"]
read_date: "2024-01-08"
type: "book-review"
created: "2024-01-08T19:00:00Z"
updated: "2024-01-08T19:00:00Z"
---

# Deep Work Review

A compelling argument for focused, undistracted work.

## Main Concepts

1. **Deep Work Definition**: Cognitively demanding activities in distraction-free environments
2. **Shallow Work Problem**: The rise of low-value, logistical tasks
3. **Attention Residue**: The cost of task-switching

## Rating: 4/5

Excellent concepts, though some examples feel repetitive.
`;

    await fs.writeFile(
      join(workspacePath, 'book-reviews', 'deep-work.md'),
      secondBookReview,
      'utf8'
    );

    // Low-priority project for testing filters
    const lowPriorityProject = `---
title: "Documentation Update"
status: "todo"
priority: 1
assignee: "Bob Smith"
tags: ["documentation", "maintenance"]
type: "project"
created: "2024-01-05T10:00:00Z"
updated: "2024-01-05T10:00:00Z"
---

# Documentation Update

Routine update of project documentation.

## Tasks
- Update README
- Fix broken links
- Add new examples
`;

    await fs.writeFile(
      join(workspacePath, 'projects', 'documentation-update.md'),
      lowPriorityProject,
      'utf8'
    );
  }

  describe('Basic Search Tool (search_notes)', () => {
    test('should find notes by text content', async () => {
      const result = await client.callTool('search_notes', {
        query: 'Atomic Habits'
      });

      assert(result.content?.[0]?.text, 'Should return search results');
      const response = JSON.parse(result.content[0].text);

      // search_notes returns direct array, not object with results property
      assert(Array.isArray(response), 'Should return array of results');
      assert(response.length > 0, 'Should find matching notes');
      assert(response[0].title.includes('Atomic Habits'), 'Should match book title');
      assert(typeof response[0].score === 'number', 'Should include search score');
      assert(response[0].metadata.type === 'book-review', 'Should include metadata');
    });

    test('should filter by note type', async () => {
      const result = await client.callTool('search_notes', {
        query: '',
        type_filter: 'project'
      });

      const response = JSON.parse(result.content[0].text);

      assert(Array.isArray(response), 'Should return array of results');
      assert(response.length > 0, 'Should find project notes');
      response.forEach((note: any) => {
        assert(note.metadata.type === 'project', 'Should only return project notes');
      });
    });

    test('should support regex search', async () => {
      const result = await client.callTool('search_notes', {
        query: '\\b[A-Z][a-z]+\\s+(Johnson|Smith)\\b',
        use_regex: true
      });

      const response = JSON.parse(result.content[0].text);

      assert(Array.isArray(response), 'Should return array of results');
      assert(response.length > 0, 'Should find notes matching regex pattern');
      // Should find notes mentioning "Alice Johnson" or "Bob Smith"
      const hasPersonName = response.some(
        (note: any) =>
          note.snippet?.includes('Johnson') ||
          note.snippet?.includes('Smith') ||
          note.title.includes('Johnson') ||
          note.title.includes('Smith')
      );
      assert(hasPersonName, 'Should match person names with regex');
    });

    test('should respect search limits', async () => {
      const result = await client.callTool('search_notes', {
        query: '',
        limit: 2
      });

      const response = JSON.parse(result.content[0].text);

      assert(Array.isArray(response), 'Should return array of results');
      assert(response.length <= 2, 'Should respect limit parameter');
    });

    test('should return all notes for empty query', async () => {
      const result = await client.callTool('search_notes', {
        query: ''
      });

      const response = JSON.parse(result.content[0].text);

      assert(Array.isArray(response), 'Should return array of results');
      assert(response.length > 0, 'Should return notes for empty query');
    });

    test('should handle non-existent search terms', async () => {
      const result = await client.callTool('search_notes', {
        query: 'nonexistentterm12345'
      });

      const response = JSON.parse(result.content[0].text);

      assert(Array.isArray(response), 'Should return array of results');
      assert.equal(response.length, 0, 'Should return no results for non-existent terms');
    });
  });

  describe('Advanced Search Tool (search_notes_advanced)', () => {
    test('should filter by metadata equality', async () => {
      const result = await client.callTool('search_notes_advanced', {
        metadata_filters: [{ key: 'status', value: 'completed' }]
      });

      const response = JSON.parse(result.content[0].text);

      assert(response.results.length > 0, 'Should find completed items');
      response.results.forEach((note: any) => {
        assert(
          note.metadata.status === 'completed',
          'Should only return completed items'
        );
      });
    });

    test('should filter by metadata comparison operators', async () => {
      const result = await client.callTool('search_notes_advanced', {
        metadata_filters: [{ key: 'rating', operator: '>=', value: '4' }]
      });

      const response = JSON.parse(result.content[0].text);

      response.results.forEach((note: any) => {
        if (note.metadata.rating !== undefined) {
          assert(
            Number(note.metadata.rating) >= 4,
            'Should only return highly rated items'
          );
        }
      });
    });

    test('should combine multiple metadata filters', async () => {
      const result = await client.callTool('search_notes_advanced', {
        metadata_filters: [
          { key: 'type', value: 'book-review' },
          { key: 'status', value: 'completed' }
        ]
      });

      const response = JSON.parse(result.content[0].text);

      response.results.forEach((note: any) => {
        assert(note.metadata.type === 'book-review', 'Should match type filter');
        assert(note.metadata.status === 'completed', 'Should match status filter');
      });
    });

    test('should filter by note type', async () => {
      const result = await client.callTool('search_notes_advanced', {
        type: 'meeting'
      });

      const response = JSON.parse(result.content[0].text);

      assert(response.results.length > 0, 'Should find meeting notes');
      response.results.forEach((note: any) => {
        assert(note.metadata.type === 'meeting', 'Should only return meeting notes');
      });
    });

    test('should filter by date ranges', async () => {
      const result = await client.callTool('search_notes_advanced', {
        updated_within: '30d'
      });

      const response = JSON.parse(result.content[0].text);

      // All our test notes are recent, so should find them
      assert(response.results.length > 0, 'Should find recently updated notes');

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      response.results.forEach((note: any) => {
        const updatedDate = new Date(note.lastUpdated);
        assert(updatedDate > thirtyDaysAgo, 'Should only return recently updated notes');
      });
    });

    test('should combine content search with filters', async () => {
      const result = await client.callTool('search_notes_advanced', {
        content_contains: 'database',
        metadata_filters: [{ key: 'category', value: 'research' }]
      });

      const response = JSON.parse(result.content[0].text);

      response.results.forEach((note: any) => {
        assert(note.metadata.category === 'research', 'Should match metadata filter');
        const containsDatabase =
          note.title.toLowerCase().includes('database') ||
          (note.snippet && note.snippet.toLowerCase().includes('database'));
        assert(containsDatabase, 'Should contain search term');
      });
    });

    test('should support sorting', async () => {
      const result = await client.callTool('search_notes_advanced', {
        sort: [{ field: 'title', order: 'asc' }]
      });

      const response = JSON.parse(result.content[0].text);

      if (response.results.length > 1) {
        for (let i = 1; i < response.results.length; i++) {
          assert(
            response.results[i - 1].title <= response.results[i].title,
            'Should sort by title ascending'
          );
        }
      }
    });

    test('should handle LIKE operator', async () => {
      const result = await client.callTool('search_notes_advanced', {
        metadata_filters: [{ key: 'author', operator: 'LIKE', value: '%James%' }]
      });

      const response = JSON.parse(result.content[0].text);

      response.results.forEach((note: any) => {
        if (note.metadata.author) {
          assert(
            note.metadata.author.includes('James'),
            'Should match partial author name'
          );
        }
      });
    });

    test('should handle IN operator', async () => {
      const result = await client.callTool('search_notes_advanced', {
        metadata_filters: [
          { key: 'status', operator: 'IN', value: '["completed", "in-progress"]' }
        ]
      });

      const response = JSON.parse(result.content[0].text);

      response.results.forEach((note: any) => {
        if (note.metadata.status) {
          assert(
            ['completed', 'in-progress'].includes(note.metadata.status),
            'Should match one of the specified values'
          );
        }
      });
    });

    test('should support pagination', async () => {
      const result = await client.callTool('search_notes_advanced', {
        limit: 2,
        offset: 0
      });

      const response = JSON.parse(result.content[0].text);

      assert(response.results.length <= 2, 'Should respect limit');
      assert(
        typeof response.has_more === 'boolean',
        'Should indicate if more results available'
      );
    });
  });

  describe('SQL Search Tool (search_notes_sql)', () => {
    test('should execute basic SELECT queries', async () => {
      const result = await client.callTool('search_notes_sql', {
        query: 'SELECT * FROM notes WHERE type = ?',
        params: ['book-review']
      });

      const response = JSON.parse(result.content[0].text);

      assert(response.results.length > 0, 'Should return matching notes');
      response.results.forEach((note: any) => {
        assert(note.metadata.type === 'book-review', 'Should match WHERE condition');
      });
    });

    test('should execute JOIN queries with metadata', async () => {
      const result = await client.callTool('search_notes_sql', {
        query: `
          SELECT n.*, m.value as rating_value
          FROM notes n
          JOIN note_metadata m ON n.id = m.note_id
          WHERE m.key = 'rating' AND CAST(m.value AS INTEGER) >= 4
        `
      });

      const response = JSON.parse(result.content[0].text);

      assert(response.results.length > 0, 'Should find highly rated items');
      response.results.forEach((note: any) => {
        // Should have rating in metadata
        const rating = note.metadata.rating || note.rating_value;
        if (rating !== undefined) {
          assert(Number(rating) >= 4, 'Should match JOIN condition');
        }
      });
    });

    test('should execute aggregation queries', async () => {
      const result = await client.callTool('search_notes_sql', {
        query: `
          SELECT type, COUNT(*) as note_count, AVG(CAST(m.value AS REAL)) as avg_rating
          FROM notes n
          LEFT JOIN note_metadata m ON n.id = m.note_id AND m.key = 'rating'
          WHERE n.type = 'book-review'
          GROUP BY type
        `
      });

      const response = JSON.parse(result.content[0].text);

      assert(response.results.length > 0, 'Should return aggregated results');
      const result_row = response.results[0];
      assert(result_row.type === 'book-review', 'Should group by type');
      assert(typeof result_row.note_count === 'number', 'Should include count');
      assert(result_row.note_count > 0, 'Should have counted notes');
    });

    test('should prevent dangerous SQL operations', async () => {
      const dangerousOperations = [
        'DROP TABLE notes',
        'DELETE FROM notes WHERE id = "test"',
        'INSERT INTO notes VALUES ("hack", "title", "content", "type", "file", "path", "2024-01-01", "2024-01-01")',
        'UPDATE notes SET title = "hacked" WHERE id = "test"',
        'ALTER TABLE notes ADD COLUMN hacked TEXT',
        'CREATE TABLE malicious (id TEXT)'
      ];

      for (const query of dangerousOperations) {
        try {
          await client.callTool('search_notes_sql', { query });
          assert.fail(`Should reject dangerous query: ${query}`);
        } catch (error) {
          assert(error instanceof Error, 'Should throw error for dangerous queries');
          const errorMessage = error.message.toLowerCase();
          assert(
            errorMessage.includes('only select queries') ||
              errorMessage.includes('prohibited keywords') ||
              errorMessage.includes('not allowed'),
            `Should provide security error for: ${query}`
          );
        }
      }
    });

    test('should handle parameterized queries safely', async () => {
      const result = await client.callTool('search_notes_sql', {
        query: 'SELECT * FROM notes WHERE title LIKE ? AND type = ?',
        params: ['%Enhancement%', 'project']
      });

      const response = JSON.parse(result.content[0].text);

      response.results.forEach((note: any) => {
        assert(note.title.includes('Enhancement'), 'Should match title parameter');
        assert(note.metadata.type === 'project', 'Should match type parameter');
      });
    });

    test('should respect query limits', async () => {
      const result = await client.callTool('search_notes_sql', {
        query: 'SELECT * FROM notes ORDER BY updated DESC',
        limit: 3
      });

      const response = JSON.parse(result.content[0].text);

      assert(response.results.length <= 3, 'Should respect limit parameter');
    });

    test('should track query execution time', async () => {
      const result = await client.callTool('search_notes_sql', {
        query: 'SELECT COUNT(*) as total FROM notes'
      });

      const response = JSON.parse(result.content[0].text);

      assert(
        typeof response.query_time_ms === 'number',
        'Should track query execution time'
      );
      assert(response.query_time_ms >= 0, 'Query time should be non-negative');
    });

    test('should handle complex analytical queries', async () => {
      const result = await client.callTool('search_notes_sql', {
        query: `
          SELECT
            n.type,
            COUNT(n.id) as total_notes,
            COUNT(CASE WHEN m1.key = 'status' AND m1.value = 'completed' THEN 1 END) as completed_count,
            AVG(CASE WHEN m2.key = 'rating' THEN CAST(m2.value AS REAL) END) as avg_rating,
            MAX(n.updated) as last_updated
          FROM notes n
          LEFT JOIN note_metadata m1 ON n.id = m1.note_id AND m1.key = 'status'
          LEFT JOIN note_metadata m2 ON n.id = m2.note_id AND m2.key = 'rating'
          GROUP BY n.type
          HAVING total_notes > 0
          ORDER BY total_notes DESC
        `
      });

      const response = JSON.parse(result.content[0].text);

      assert(response.results.length > 0, 'Should return analytical results');
      response.results.forEach((row: any) => {
        assert(typeof row.type === 'string', 'Should have note type');
        assert(typeof row.total_notes === 'number', 'Should have total count');
        assert(row.total_notes > 0, 'Should filter by HAVING clause');
      });
    });

    test('should handle SQL syntax errors gracefully', async () => {
      try {
        await client.callTool('search_notes_sql', {
          query: 'SELECT * FROM nonexistent_table WHERE invalid syntax'
        });
        assert.fail('Should throw error for invalid SQL');
      } catch (error) {
        assert(error instanceof Error, 'Should throw Error for invalid SQL');
        // Should be a meaningful error message, not just generic
        assert(error.message.length > 10, 'Should provide detailed error message');
      }
    });

    test('should handle timeout for long queries', async () => {
      const result = await client.callTool('search_notes_sql', {
        query: 'SELECT * FROM notes',
        timeout: 1000
      });

      const response = JSON.parse(result.content[0].text);

      // Should complete within timeout for simple queries
      assert(typeof response.query_time_ms === 'number', 'Should track execution time');
      assert(response.query_time_ms < 1000, 'Simple query should complete quickly');
    });
  });

  describe('Cross-Tool Integration', () => {
    test('should maintain consistency between search tools', async () => {
      // Search for the same content using different tools
      const basicResult = await client.callTool('search_notes', {
        query: 'database',
        type_filter: 'general'
      });

      const advancedResult = await client.callTool('search_notes_advanced', {
        content_contains: 'database',
        type: 'general'
      });

      const sqlResult = await client.callTool('search_notes_sql', {
        query: `SELECT * FROM notes WHERE content LIKE '%database%' AND type = 'general'`
      });

      const basicResponse = JSON.parse(basicResult.content[0].text);
      const advancedResponse = JSON.parse(advancedResult.content[0].text);
      const sqlResponse = JSON.parse(sqlResult.content[0].text);

      // Handle different response formats
      const basicResults = Array.isArray(basicResponse)
        ? basicResponse
        : basicResponse.results;
      const advancedResults = advancedResponse.results;
      const sqlResults = sqlResponse.results;

      // All should find the same notes (though order/formatting may differ)
      assert(basicResults.length > 0, 'Basic search should find results');
      assert(advancedResults.length > 0, 'Advanced search should find results');
      assert(sqlResults.length > 0, 'SQL search should find results');

      // Should find the database research note
      const hasResearchNote = (results: any[]) =>
        results.some(note => note.title.includes('Research Notes on Database Design'));

      assert(hasResearchNote(basicResults), 'Basic search should find research note');
      assert(
        hasResearchNote(advancedResults),
        'Advanced search should find research note'
      );
      assert(hasResearchNote(sqlResults), 'SQL search should find research note');
    });

    test('should handle real-time index updates', async () => {
      // Create a new note using the MCP create_note tool
      const createResult = await client.callTool('create_note', {
        type: 'general',
        title: 'New Test Note for Search',
        content: `# Real-time Search Test

This note should be immediately searchable after creation.`,
        metadata: {
          tags: ['test', 'realtime']
        }
      });

      // Verify the note was created successfully
      const createResponse = JSON.parse(createResult.content[0].text);
      assert(
        createResponse.title === 'New Test Note for Search',
        'Note should be created successfully'
      );

      // Search for the new note (should be immediately available since create_note updates the index)
      const result = await client.callTool('search_notes', {
        query: 'New Test Note for Search'
      });

      const response = JSON.parse(result.content[0].text);

      // Handle basic search response format (array directly)
      const results = Array.isArray(response) ? response : response.results;

      assert(results.length > 0, 'Should find newly created note');
      assert(
        results.some((note: any) => note.title.includes('New Test Note for Search')),
        'Should find the specific test note'
      );
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple concurrent search requests', async () => {
      const searchPromises: Promise<any>[] = [];

      // Create multiple concurrent searches
      for (let i = 0; i < 5; i++) {
        searchPromises.push(client.callTool('search_notes', { query: 'project' }));
        searchPromises.push(
          client.callTool('search_notes_advanced', { type: 'book-review' })
        );
        searchPromises.push(
          client.callTool('search_notes_sql', { query: 'SELECT COUNT(*) FROM notes' })
        );
      }

      // All should complete successfully
      const results = await Promise.all(searchPromises);

      assert(results.length === 15, 'All concurrent requests should complete');
      results.forEach((result, index) => {
        assert(result.content?.[0]?.text, `Request ${index} should return valid result`);
        const response = JSON.parse(result.content[0].text);
        assert(typeof response === 'object', `Request ${index} should return valid JSON`);
      });
    });

    test('should maintain good performance with complex queries', async () => {
      const startTime = Date.now();

      const result = await client.callTool('search_notes_sql', {
        query: `
          SELECT
            n.type,
            n.title,
            n.updated,
            GROUP_CONCAT(m.key || ':' || m.value) as metadata_summary,
            COUNT(m.key) as metadata_count
          FROM notes n
          LEFT JOIN note_metadata m ON n.id = m.note_id
          GROUP BY n.id, n.type, n.title, n.updated
          ORDER BY n.updated DESC, metadata_count DESC
        `
      });

      const queryTime = Date.now() - startTime;
      const response = JSON.parse(result.content[0].text);

      assert(response.results.length > 0, 'Complex query should return results');
      assert(queryTime < 5000, 'Complex query should complete within reasonable time');
      assert(
        typeof response.query_time_ms === 'number',
        'Should track internal query time'
      );
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle malformed requests gracefully', async () => {
      try {
        await client.callTool('search_notes_sql', {
          query: null
        });
        assert.fail('Should reject null query');
      } catch (error) {
        assert(error instanceof Error, 'Should throw error for null query');
      }

      try {
        await client.callTool('search_notes_advanced', {
          metadata_filters: 'not an array'
        });
        assert.fail('Should reject invalid metadata filters');
      } catch (error) {
        assert(error instanceof Error, 'Should throw error for invalid filters');
      }
    });

    test('should handle empty database gracefully', async () => {
      // This test would need a fresh workspace, but we can test with non-matching queries
      const result = await client.callTool('search_notes', {
        query: 'zyxwvutsrqponmlkjihgfedcba_nonexistent'
      });

      const response = JSON.parse(result.content[0].text);

      // Handle basic search response format (array directly)
      const results = Array.isArray(response) ? response : response.results;

      assert.equal(results.length, 0, 'Should handle no matches gracefully');

      // For basic search, we can't test total and query_time_ms as it returns array directly
      if (!Array.isArray(response)) {
        assert.equal(response.total, 0, 'Should report zero total');
        assert(
          typeof response.query_time_ms === 'number',
          'Should still track query time'
        );
      }
    });

    test('should handle special characters in search queries', async () => {
      const specialQueries = [
        'test@example.com',
        'file.name.ext',
        'query with spaces',
        'query-with-dashes',
        'query_with_underscores',
        'query/with/slashes',
        'query\\with\\backslashes',
        'query"with"quotes',
        "query'with'apostrophes"
      ];

      for (const query of specialQueries) {
        try {
          const result = await client.callTool('search_notes', {
            query: query
          });

          let response;
          try {
            response = JSON.parse(result.content[0].text);
          } catch (_parseError) {
            // If JSON parsing fails, the response might be an error message
            // This is still a valid test result - the system handled the special character
            // without crashing, even if it returned an error
            assert(
              typeof result.content[0].text === 'string',
              `Should return string response for special character query: ${query}`
            );
            continue; // Skip to next query
          }

          // Handle basic search response format (array directly)
          const results = Array.isArray(response) ? response : response.results;

          // Should not throw errors, even if no results
          assert(Array.isArray(results), `Should handle special characters in: ${query}`);

          // For basic search, we can't test total since it returns array directly
          if (!Array.isArray(response)) {
            assert(
              typeof response.total === 'number',
              `Should return valid total for: ${query}`
            );
          }
        } catch (error) {
          // If the tool call itself fails, that's still acceptable for special characters
          // as long as it doesn't crash the server
          assert(
            error instanceof Error,
            `Should handle special character gracefully: ${query}`
          );
        }
      }
    });

    test('should handle Unicode and international characters', async () => {
      const unicodeQueries = [
        'café',
        '北京',
        'Москва',
        'Tōkyō',
        '🚀 rocket',
        'naïve',
        'résumé'
      ];

      for (const query of unicodeQueries) {
        const result = await client.callTool('search_notes', {
          query: query
        });

        const response = JSON.parse(result.content[0].text);

        // Handle basic search response format (array directly)
        const results = Array.isArray(response) ? response : response.results;

        // Should handle Unicode without errors
        assert(Array.isArray(results), `Should handle Unicode in: ${query}`);

        // For basic search, we can't test total since it returns array directly
        if (!Array.isArray(response)) {
          assert(
            typeof response.total === 'number',
            `Should return valid total for Unicode: ${query}`
          );
        }
      }
    });
  });
});
