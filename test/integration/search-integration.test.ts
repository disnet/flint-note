/**
 * Integration tests for search functionality through MCP protocol
 * Tests search capabilities including text search, regex patterns, type filtering, and pagination
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
} from './helpers/integration-utils.ts';

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

        // Try to parse complete JSON responses
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === id) {
                hasResponded = true;
                clearTimeout(timeout);
                this.#serverProcess.stdout?.off('data', onData);

                if (response.error) {
                  reject(new Error(`MCP Error: ${response.error.message}`));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch {
              // Continue parsing - might be partial JSON
            }
          }
        }
      };

      this.#serverProcess.stdout?.on('data', onData);

      // Send the request
      this.#serverProcess.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }
}

describe('Search Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('search-integration');

    // Create note types for testing
    await createTestNoteType(context.tempDir, 'general', 'General purpose notes');
    await createTestNoteType(context.tempDir, 'projects', 'Project-related notes');
    await createTestNoteType(context.tempDir, 'meetings', 'Meeting notes');
    await createTestNoteType(context.tempDir, 'research', 'Research and analysis');

    // Start server
    context.serverProcess = await startServer({
      workspacePath: context.tempDir,
      timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
    });

    client = new MCPClient(context.serverProcess);

    // Create comprehensive test dataset
    await createTestDataset();
  });

  afterEach(async () => {
    await cleanupIntegrationWorkspace(context);
  });

  async function createTestDataset(): Promise<void> {
    // General notes
    await client.callTool('create_note', {
      type: 'general',
      title: 'Introduction to Machine Learning',
      content: `# Introduction to Machine Learning

Machine learning is a subset of artificial intelligence that focuses on algorithms and statistical models.

## Key Concepts
- Supervised learning
- Unsupervised learning
- Reinforcement learning

## Applications
Machine learning has applications in:
- Image recognition
- Natural language processing
- Recommendation systems

## Tags
#machine-learning #artificial-intelligence #algorithms`,
      metadata: {
        tags: ['machine-learning', 'AI', 'algorithms'],
        difficulty: 'intermediate',
        created: '2024-01-01T10:00:00Z'
      }
    });

    await client.callTool('create_note', {
      type: 'general',
      title: 'JavaScript Best Practices',
      content: `# JavaScript Best Practices

A comprehensive guide to writing clean and maintainable JavaScript code.

## Modern JavaScript Features
- Arrow functions
- Destructuring
- Template literals
- Async/await

## Code Quality
- Use strict mode
- Avoid global variables
- Write readable code
- Add proper comments

## Testing
Always write tests for your JavaScript functions using frameworks like Jest or Mocha.`,
      metadata: {
        tags: ['javascript', 'programming', 'best-practices'],
        difficulty: 'beginner',
        created: '2024-01-02T14:30:00Z'
      }
    });

    // Project notes
    await client.callTool('create_note', {
      type: 'projects',
      title: 'Project Alpha Planning',
      content: `# Project Alpha Planning

Project Alpha is our next major initiative focusing on customer experience improvements.

## Objectives
1. Reduce customer support tickets by 30%
2. Improve user satisfaction scores
3. Implement new self-service features

## Timeline
- Phase 1: Requirements gathering (2 weeks)
- Phase 2: Development (8 weeks)
- Phase 3: Testing and deployment (4 weeks)

## Team Members
- Project Manager: Sarah Johnson
- Lead Developer: Mike Chen
- UX Designer: Emily Rodriguez

## Budget
Total budget allocated: $150,000`,
      metadata: {
        project_status: 'planning',
        priority: 'high',
        budget: 150000,
        team_size: 8,
        created: '2024-01-03T09:15:00Z'
      }
    });

    await client.callTool('create_note', {
      type: 'projects',
      title: 'Website Redesign Project',
      content: `# Website Redesign Project

Complete overhaul of the company website with modern design and improved functionality.

## Current Issues
- Outdated design from 2018
- Poor mobile responsiveness
- Slow loading times
- Confusing navigation

## Goals
- Modern, responsive design
- Improved performance
- Better user experience
- SEO optimization

## Technology Stack
- Frontend: React with TypeScript
- Backend: Node.js with Express
- Database: PostgreSQL
- Hosting: AWS

## Performance Targets
- Page load time < 2 seconds
- Lighthouse score > 90
- Mobile-first design`,
      metadata: {
        project_status: 'in-progress',
        priority: 'medium',
        technology: 'web',
        created: '2024-01-04T11:45:00Z'
      }
    });

    // Meeting notes
    await client.callTool('create_note', {
      type: 'meetings',
      title: 'Weekly Team Standup - January 8',
      content: `# Weekly Team Standup - January 8, 2024

## Attendees
- Alice Smith (Product Manager)
- Bob Wilson (Senior Developer)
- Carol Johnson (QA Engineer)
- David Lee (UI Designer)

## Agenda Items
1. Sprint review
2. Upcoming deadlines
3. Blockers and issues
4. New requirements

## Discussion Points
- API integration is ahead of schedule
- Need additional testing resources
- Design review scheduled for Thursday
- Customer feedback has been positive

## Action Items
- [ ] Bob: Complete API documentation by Friday
- [ ] Carol: Set up automated testing pipeline
- [ ] David: Finalize mobile mockups
- [ ] Alice: Schedule client demo for next week

## Next Meeting
January 15, 2024 at 10:00 AM`,
      metadata: {
        meeting_type: 'standup',
        attendees: 4,
        duration: 30,
        created: '2024-01-08T10:00:00Z'
      }
    });

    // Research notes
    await client.callTool('create_note', {
      type: 'research',
      title: 'Neural Networks in Computer Vision',
      content: `# Neural Networks in Computer Vision

Research findings on the application of neural networks in computer vision tasks.

## Abstract
This research explores various neural network architectures for image classification, object detection, and semantic segmentation.

## Key Findings
1. Convolutional Neural Networks (CNNs) excel at feature extraction
2. ResNet architectures solve the vanishing gradient problem
3. Transfer learning significantly improves training efficiency
4. Data augmentation is crucial for model generalization

## Methodologies
- Supervised learning with labeled datasets
- Cross-validation for model evaluation
- Hyperparameter tuning using grid search
- Performance metrics: accuracy, precision, recall, F1-score

## Results
- Achieved 95.2% accuracy on CIFAR-10 dataset
- Object detection mAP of 0.847 on COCO dataset
- Semantic segmentation IoU of 0.782

## Conclusion
Neural networks demonstrate remarkable performance in computer vision tasks when properly architected and trained with sufficient data.

## References
- LeCun, Y. et al. (1989). Backpropagation Applied to Handwritten Zip Code Recognition
- He, K. et al. (2016). Deep Residual Learning for Image Recognition
- Krizhevsky, A. et al. (2012). ImageNet Classification with Deep Convolutional Neural Networks`,
      metadata: {
        research_type: 'computer-vision',
        authors: ['Dr. Jane Smith', 'Prof. John Doe'],
        publication_year: 2024,
        citations: 3,
        peer_reviewed: true,
        created: '2024-01-05T16:20:00Z'
      }
    });

    await client.callTool('create_note', {
      type: 'research',
      title: 'Blockchain Scalability Solutions',
      content: `# Blockchain Scalability Solutions

Analysis of various approaches to improve blockchain transaction throughput and reduce costs.

## Problem Statement
Current blockchain networks face significant scalability challenges:
- Bitcoin: 7 transactions per second
- Ethereum: 15 transactions per second
- High transaction fees during network congestion

## Layer 1 Solutions
### Sharding
- Divides blockchain into smaller, parallel chains
- Increases overall network capacity
- Implemented in Ethereum 2.0

### Consensus Algorithm Improvements
- Proof of Stake vs Proof of Work
- Reduced energy consumption
- Faster block confirmation times

## Layer 2 Solutions
### Lightning Network
- Off-chain payment channels
- Instant transactions
- Minimal fees

### State Channels
- Bidirectional payment channels
- Smart contract interactions
- Reduced on-chain transactions

### Sidechains
- Independent blockchains
- Interoperability with main chain
- Specialized functionality

## Performance Comparison
| Solution | TPS | Finality | Cost |
|----------|-----|----------|------|
| Bitcoin Base | 7 | 60 min | High |
| Lightning | 1M+ | Instant | Low |
| Ethereum 2.0 | 100K+ | 12 sec | Medium |
| Polygon | 65K | 2 sec | Low |

## Conclusion
A combination of Layer 1 and Layer 2 solutions is necessary for blockchain mass adoption.`,
      metadata: {
        research_type: 'blockchain',
        complexity: 'high',
        industry_relevance: 'cryptocurrency',
        created: '2024-01-06T13:30:00Z'
      }
    });
  }

  describe('Basic Text Search', () => {
    test('should find notes containing specific terms', async () => {
      const result = await client.callTool('search_notes', {
        query: 'machine learning'
      });

      assert.ok(result.content, 'Should return search results');
      const searchResults = JSON.parse(result.content[0].text);

      assert.ok(Array.isArray(searchResults), 'Should return array of results');
      assert.ok(searchResults.length > 0, 'Should find matching notes');

      // Should find the machine learning note
      const mlNote = searchResults.find(
        (note: any) =>
          note.title.includes('Machine Learning') ||
          note.snippet.includes('machine learning')
      );
      assert.ok(mlNote, 'Should find machine learning note');
    });

    test('should search across all note content', async () => {
      const result = await client.callTool('search_notes', {
        query: 'JavaScript'
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(searchResults.length > 0, 'Should find JavaScript-related notes');

      const jsNote = searchResults.find(
        (note: any) =>
          note.title.includes('JavaScript') || note.snippet.includes('JavaScript')
      );
      assert.ok(jsNote, 'Should find JavaScript note');
      assert.strictEqual(jsNote.type, 'general', 'Should return correct note type');
    });

    test('should handle case-insensitive search', async () => {
      const upperResult = await client.callTool('search_notes', {
        query: 'JAVASCRIPT'
      });

      const lowerResult = await client.callTool('search_notes', {
        query: 'javascript'
      });

      const upperResults = JSON.parse(upperResult.content[0].text);
      const lowerResults = JSON.parse(lowerResult.content[0].text);

      assert.strictEqual(
        upperResults.length,
        lowerResults.length,
        'Case-insensitive search should return same results'
      );
    });

    test('should search in metadata fields', async () => {
      const result = await client.callTool('search_notes', {
        query: 'algorithms'
      });

      const searchResults = JSON.parse(result.content[0].text);
      const algorithmNote = searchResults.find(
        (note: any) => note.tags && note.tags.includes('algorithms')
      );
      assert.ok(algorithmNote, 'Should find note with algorithms tag in metadata');
    });

    test('should return empty results for non-existent terms', async () => {
      const result = await client.callTool('search_notes', {
        query: 'nonexistentterm12345'
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(searchResults), 'Should return array');
      assert.strictEqual(searchResults.length, 0, 'Should return empty results');
    });
  });

  describe('Type Filtering', () => {
    test('should filter results by note type', async () => {
      const result = await client.callTool('search_notes', {
        query: 'project',
        type_filter: 'projects'
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(searchResults.length > 0, 'Should find project notes');

      // All results should be from projects type
      const allProjectType = searchResults.every((note: any) => note.type === 'projects');
      assert.ok(allProjectType, 'All results should be from projects type');
    });

    test('should filter meetings by type', async () => {
      const result = await client.callTool('search_notes', {
        query: 'standup',
        type_filter: 'meetings'
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(searchResults.length > 0, 'Should find meeting notes');

      const meetingNote = searchResults.find(
        (note: any) => note.title.includes('Standup') && note.type === 'meetings'
      );
      assert.ok(meetingNote, 'Should find standup meeting note');
    });

    test('should handle invalid note type filter', async () => {
      const result = await client.callTool('search_notes', {
        query: 'test',
        type_filter: 'nonexistent-type'
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.strictEqual(
        searchResults.length,
        0,
        'Should return empty results for invalid type'
      );
    });

    test('should search all types when no filter specified', async () => {
      const allTypesResult = await client.callTool('search_notes', {
        query: 'the'
      });

      const filteredResult = await client.callTool('search_notes', {
        query: 'the',
        type_filter: 'general'
      });

      const allResults = JSON.parse(allTypesResult.content[0].text);
      const filteredResults = JSON.parse(filteredResult.content[0].text);

      assert.ok(
        allResults.length >= filteredResults.length,
        'All-types search should return at least as many results as filtered search'
      );
    });
  });

  describe('Regex Search', () => {
    test('should support regex pattern matching', async () => {
      const result = await client.callTool('search_notes', {
        query: '\\b[Jj]ava[Ss]cript\\b',
        use_regex: true
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(searchResults.length > 0, 'Should find results with regex pattern');

      const jsNote = searchResults.find(
        (note: any) =>
          /\b[Jj]ava[Ss]cript\b/.test(note.snippet) ||
          /\b[Jj]ava[Ss]cript\b/.test(note.title)
      );
      assert.ok(jsNote, 'Should find JavaScript note with regex');
    });

    test('should find email-like patterns', async () => {
      // First add a note with email addresses
      await client.callTool('create_note', {
        type: 'general',
        title: 'Contact Information',
        content: `# Contact Information

Team contacts:
- john.doe@company.com
- sarah.smith@company.com
- mike.chen@company.com

External contacts:
- support@vendor.com
- sales@partner.org`
      });

      const result = await client.callTool('search_notes', {
        query: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
        use_regex: true
      });

      const searchResults = JSON.parse(result.content[0].text);
      const emailNote = searchResults.find(
        (note: any) => note.title === 'Contact Information'
      );
      assert.ok(emailNote, 'Should find note containing email addresses');
    });

    test('should find numeric patterns', async () => {
      const result = await client.callTool('search_notes', {
        query: '\\$[0-9,]+',
        use_regex: true
      });

      const searchResults = JSON.parse(result.content[0].text);
      const budgetNote = searchResults.find((note: any) =>
        note.snippet.includes('$150,000')
      );
      assert.ok(budgetNote, 'Should find note with budget amount');
    });

    test('should handle invalid regex patterns gracefully', async () => {
      try {
        await client.callTool('search_notes', {
          query: '[invalid regex pattern(',
          use_regex: true
        });
        // Should either return empty results or throw an error
      } catch (error) {
        // Expected behavior for invalid regex
        assert.ok(error instanceof Error);
      }
    });
  });

  describe('Search Limits and Pagination', () => {
    test('should respect search limit parameter', async () => {
      const result = await client.callTool('search_notes', {
        query: 'the',
        limit: 2
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(searchResults.length <= 2, 'Should respect limit parameter');
    });

    test('should handle zero limit', async () => {
      const result = await client.callTool('search_notes', {
        query: 'test',
        limit: 0
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.strictEqual(
        searchResults.length,
        0,
        'Should return empty results for zero limit'
      );
    });

    test('should handle large limit values', async () => {
      const result = await client.callTool('search_notes', {
        query: 'the',
        limit: 1000
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(searchResults), 'Should handle large limit values');
      // Should return all available results (likely less than 1000)
    });

    test('should use default limit when not specified', async () => {
      const result = await client.callTool('search_notes', {
        query: 'the'
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(searchResults.length <= 10, 'Should use default limit of 10');
    });
  });

  describe('Empty and Special Queries', () => {
    test('should return all notes for empty query', async () => {
      const result = await client.callTool('search_notes', {
        query: ''
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(searchResults.length > 0, 'Should return all notes for empty query');
      assert.ok(searchResults.length >= 6, 'Should return all test notes created');
    });

    test('should return all notes when query is omitted', async () => {
      const result = await client.callTool('search_notes', {});

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(searchResults.length > 0, 'Should return all notes when query omitted');
    });

    test('should sort results by last updated when returning all notes', async () => {
      // Get current content hash first
      const noteResult = await client.callTool('get_note', {
        identifier: 'general/javascript-best-practices'
      });
      const noteData = JSON.parse(noteResult.content[0].text);

      // Update one of the notes to change its timestamp
      await client.callTool('update_note', {
        identifier: 'general/javascript-best-practices',
        content: `# JavaScript Best Practices - Updated

Updated content with new timestamp.

## Recently Added
- New ES2024 features
- Performance optimizations`,
        content_hash: noteData.content_hash
      });

      const result = await client.callTool('search_notes', {
        query: ''
      });

      const searchResults = JSON.parse(result.content[0].text);

      // The updated JavaScript note should appear first (most recently updated)
      const firstResult = searchResults[0];
      assert.ok(
        firstResult.title.includes('JavaScript') ||
          firstResult.snippet.includes('Updated'),
        'Most recently updated note should appear first'
      );
    });

    test('should handle whitespace-only queries', async () => {
      const result = await client.callTool('search_notes', {
        query: '   \t\n   '
      });

      const searchResults = JSON.parse(result.content[0].text);
      // Should treat as empty query and return all notes
      assert.ok(searchResults.length > 0, 'Should treat whitespace query as empty');
    });
  });

  describe('Search Result Structure', () => {
    test('should return properly structured search results', async () => {
      const result = await client.callTool('search_notes', {
        query: 'project',
        limit: 1
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(searchResults.length > 0, 'Should have results');

      const note = searchResults[0];
      assert.ok(note.id, 'Note should have ID');
      assert.ok(note.title, 'Note should have title');
      assert.ok(note.type, 'Note should have type');
      assert.ok(note.snippet, 'Note should have snippet');
      assert.ok(typeof note.score === 'number', 'Note should have score');
      assert.ok(note.lastUpdated, 'Note should have lastUpdated timestamp');
    });

    test('should include metadata in search results', async () => {
      const result = await client.callTool('search_notes', {
        query: 'machine learning'
      });

      const searchResults = JSON.parse(result.content[0].text);
      const mlNote = searchResults.find((note: any) =>
        note.title.includes('Machine Learning')
      );

      assert.ok(mlNote, 'Should find ML note');
      assert.ok(Array.isArray(mlNote.tags), 'Note should include tags array');
      assert.ok(mlNote.tags.length > 0, 'Tags array should not be empty');
    });

    test('should handle notes without metadata', async () => {
      // Create a note without metadata
      await client.callTool('create_note', {
        type: 'general',
        title: 'Note Without Metadata',
        content: '# Simple Note\n\nThis note has no metadata.'
      });

      const result = await client.callTool('search_notes', {
        query: 'Simple Note'
      });

      const searchResults = JSON.parse(result.content[0].text);
      const simpleNote = searchResults.find(
        (note: any) => note.title === 'Note Without Metadata'
      );

      assert.ok(simpleNote, 'Should find simple note');
      // Tags should be empty array for notes without metadata
      assert.ok(
        Array.isArray(simpleNote.tags) && simpleNote.tags.length === 0,
        'Note without metadata should have empty tags array'
      );
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle search with special characters', async () => {
      const specialQueries = [
        'C++',
        'Node.js',
        '@mentions',
        '#hashtags',
        'file.txt',
        'user@domain.com'
      ];

      for (const query of specialQueries) {
        const result = await client.callTool('search_notes', {
          query: query
        });

        const searchResults = JSON.parse(result.content[0].text);
        assert.ok(Array.isArray(searchResults), `Should handle query: ${query}`);
      }
    });

    test('should handle very long search queries', async () => {
      const longQuery = 'a'.repeat(1000);

      const result = await client.callTool('search_notes', {
        query: longQuery
      });

      const searchResults = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(searchResults), 'Should handle long queries');
    });

    test('should handle concurrent search requests', async () => {
      const searchPromises = Array.from({ length: 5 }, (_, i) =>
        client.callTool('search_notes', {
          query: i % 2 === 0 ? 'project' : 'javascript'
        })
      );

      const results = await Promise.all(searchPromises);

      assert.strictEqual(results.length, 5, 'All concurrent searches should complete');

      // Verify all results are valid
      for (const result of results) {
        const searchResults = JSON.parse(result.content[0].text);
        assert.ok(Array.isArray(searchResults), 'Each result should be valid array');
      }
    });

    test('should maintain search performance with larger dataset', async () => {
      // Create additional notes to test performance
      const additionalNotes = Array.from({ length: 20 }, (_, i) => ({
        type: 'general',
        title: `Performance Test Note ${i + 1}`,
        content: `# Performance Test Note ${i + 1}

This is note number ${i + 1} created for performance testing.
It contains various keywords like performance, testing, benchmark, and evaluation.

## Content Section ${i + 1}
Additional content to make the note substantial for search testing.
Random words: optimization, algorithm, efficiency, scalability, throughput.`
      }));

      // Create all additional notes
      await Promise.all(
        additionalNotes.map(note => client.callTool('create_note', note))
      );

      const startTime = Date.now();
      const result = await client.callTool('search_notes', {
        query: 'performance'
      });
      const endTime = Date.now();

      const searchTime = endTime - startTime;
      const searchResults = JSON.parse(result.content[0].text);

      assert.ok(searchResults.length > 0, 'Should find performance-related notes');
      assert.ok(searchTime < 2000, 'Search should complete within 2 seconds');
    });
  });
});
