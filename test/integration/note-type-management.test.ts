/**
 * Integration tests for note type management through MCP protocol
 * Tests note type creation, updates, and information retrieval via the flint-note MCP server
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  createIntegrationWorkspace,
  cleanupIntegrationWorkspace,
  startServer,
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

describe('Note Type Management Integration', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;

  beforeEach(async () => {
    context = await createIntegrationWorkspace('note-type-management');

    // Start server
    context.serverProcess = await startServer({
      workspacePath: context.tempDir,
      timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
    });

    client = new MCPClient(context.serverProcess);
  });

  afterEach(async () => {
    await cleanupIntegrationWorkspace(context);
  });

  describe('Note Type Creation', () => {
    test('should create note type with description only', async () => {
      const noteTypeData = {
        type_name: 'meetings',
        description:
          'Meeting notes and agendas for team meetings and important discussions.'
      };

      const result = await client.callTool('create_note_type', noteTypeData);

      // Verify MCP response
      assert.ok(result.content, 'Should return content array');
      assert.strictEqual(result.content[0].type, 'text');
      assert.ok(
        result.content[0].text.includes('Created note type'),
        'Should confirm creation'
      );

      // Verify directory was created
      const _typePath = join(context.tempDir, 'meetings');
      const dirExists = await fs
        .access(_typePath)
        .then(() => true)
        .catch(() => false);
      assert.ok(dirExists, 'Note type directory should exist');

      // Verify description file was created in .flint-note/descriptions directory
      const descriptionPath = join(
        context.tempDir,
        '.flint-note',
        'descriptions',
        'meetings_description.md'
      );
      const descExists = await fs
        .access(descriptionPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(descExists, 'Description file should exist');

      // Verify description content
      const descContent = await fs.readFile(descriptionPath, 'utf8');
      assert.ok(
        descContent.includes('Meeting notes and agendas'),
        'Description should contain expected text'
      );
    });

    test('should create note type with agent instructions', async () => {
      const noteTypeData = {
        type_name: 'project-tasks',
        description: 'Individual tasks and action items for projects.',
        agent_instructions: [
          'Always include a priority level (high, medium, low)',
          'Add estimated time to completion',
          'Include dependencies if any',
          'Tag with project name'
        ]
      };

      const result = await client.callTool('create_note_type', noteTypeData);
      assert.ok(
        result.content[0].text.includes('Created note type'),
        'Should confirm creation'
      );

      // Verify agent instructions are stored in description file
      const descriptionPath = join(
        context.tempDir,
        '.flint-note',
        'descriptions',
        'project-tasks_description.md'
      );
      const descriptionExist = await fs
        .access(descriptionPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(descriptionExist, 'Description file should exist');

      // Verify instructions content is in description file
      const descriptionContent = await fs.readFile(descriptionPath, 'utf8');
      assert.ok(
        descriptionContent.includes('priority level'),
        'Instructions should contain priority guidance'
      );
      assert.ok(
        descriptionContent.includes('estimated time'),
        'Instructions should contain time guidance'
      );
      assert.ok(
        descriptionContent.includes('dependencies'),
        'Instructions should contain dependency guidance'
      );
    });

    test('should create complete note type with all components', async () => {
      const noteTypeData = {
        type_name: 'research-papers',
        description: 'Academic papers and research documents with structured analysis.',
        agent_instructions: [
          'Always include full citation information',
          'Summarize methodology clearly',
          'Extract key findings and implications',
          'Note any limitations or biases',
          'Connect to related research when possible'
        ]
      };

      const result = await client.callTool('create_note_type', noteTypeData);
      assert.ok(
        result.content[0].text.includes('Created note type'),
        'Should confirm creation'
      );

      // Verify files were created (agent instructions are stored in description file)
      const _typePath = join(context.tempDir, 'research-papers');
      const descriptionPath = join(
        context.tempDir,
        '.flint-note',
        'descriptions',
        'research-papers_description.md'
      );

      const descriptionExists = await fs
        .access(descriptionPath)
        .then(() => true)
        .catch(() => false);

      assert.ok(descriptionExists, 'Description file should exist');

      // Verify description file contains agent instructions
      const descriptionContent = await fs.readFile(descriptionPath, 'utf8');
      assert.ok(
        descriptionContent.includes('full citation information'),
        'Should contain agent instructions'
      );
    });

    test('should create note type with metadata schema', async () => {
      const metadataSchema = {
        fields: [
          {
            name: 'author',
            type: 'string',
            required: true,
            description: 'Book author'
          },
          {
            name: 'rating',
            type: 'number',
            constraints: { min: 1, max: 5 },
            description: 'Rating from 1 to 5'
          },
          {
            name: 'genre',
            type: 'select',
            constraints: { options: ['fiction', 'non-fiction', 'biography', 'sci-fi'] },
            description: 'Book genre'
          },
          {
            name: 'completed',
            type: 'boolean',
            default: false,
            description: 'Whether the book has been read'
          }
        ],
        version: '1.0'
      };

      const result = await client.callTool('create_note_type', {
        type_name: 'book-reviews',
        description: 'Reviews and notes about books I have read',
        agent_instructions: [
          'Always include a brief summary of the book',
          'Highlight the most important insights or takeaways',
          'Include a personal rating and justify it'
        ],
        metadata_schema: metadataSchema
      });

      const responseData = JSON.parse(result.content[0].text);
      assert.ok(responseData.success, 'Should create note type successfully');
      assert.strictEqual(responseData.type_name, 'book-reviews');

      // Verify the metadata schema was stored correctly
      const infoResult = await client.callTool('get_note_type_info', {
        type_name: 'book-reviews'
      });

      const info = JSON.parse(infoResult.content[0].text);
      assert.ok(info.metadata_schema, 'Should include metadata schema in info');
      assert.ok(info.metadata_schema.fields, 'Should have fields array');
      assert.strictEqual(info.metadata_schema.fields.length, 4, 'Should have 4 fields');
      // Note: version is not preserved in current implementation due to markdown roundtrip

      // Verify specific field properties
      const authorField = info.metadata_schema.fields.find(
        (f: any) => f.name === 'author'
      );
      assert.ok(authorField, 'Should have author field');
      assert.strictEqual(authorField.type, 'string', 'Author should be string type');
      assert.strictEqual(authorField.required, true, 'Author should be required');

      const ratingField = info.metadata_schema.fields.find(
        (f: any) => f.name === 'rating'
      );
      assert.ok(ratingField, 'Should have rating field');
      assert.strictEqual(ratingField.type, 'number', 'Rating should be number type');
      assert.ok(ratingField.constraints, 'Rating should have constraints');
      assert.strictEqual(ratingField.constraints.min, 1, 'Rating min should be 1');
      assert.strictEqual(ratingField.constraints.max, 5, 'Rating max should be 5');
    });

    test('should handle invalid note type names', async () => {
      const invalidNames = [
        'invalid/name',
        'invalid:name',
        'invalid*name',
        'invalid?name',
        'invalid<name>',
        'invalid|name'
      ];

      for (const invalidName of invalidNames) {
        try {
          await client.callTool('create_note_type', {
            type_name: invalidName,
            description: 'Test description'
          });
          assert.fail(`Should reject invalid name: ${invalidName}`);
        } catch (error) {
          assert.ok(error instanceof Error);
          assert.ok(error.message.includes('invalid') || error.message.includes('name'));
        }
      }
    });

    test('should prevent duplicate note type creation', async () => {
      // Create first note type
      await client.callTool('create_note_type', {
        type_name: 'duplicates',
        description: 'First description'
      });

      // Try to create duplicate
      try {
        await client.callTool('create_note_type', {
          type_name: 'duplicates',
          description: 'Second description'
        });
        assert.fail('Should prevent duplicate note type creation');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(
          error.message.includes('exists') || error.message.includes('duplicate')
        );
      }
    });
  });

  describe('Note Type Updates', () => {
    beforeEach(async () => {
      // Create a note type to update
      await client.callTool('create_note_type', {
        type_name: 'updateable',
        description: 'Original description for testing updates.',
        agent_instructions: ['Original instruction 1', 'Original instruction 2']
      });
    });

    test('should update note type description', async () => {
      // Get current content hash
      const infoResult = await client.callTool('get_note_type_info', {
        type_name: 'updateable'
      });
      const info = JSON.parse(infoResult.content[0].text);

      const result = await client.callTool('update_note_type', {
        type_name: 'updateable',
        description: 'Updated description with new information.',
        content_hash: info.content_hash
      });

      assert.ok(result.content[0].text.includes('Updated'), 'Should confirm update');

      // Verify file was updated
      const descriptionPath = join(
        context.tempDir,
        '.flint-note',
        'descriptions',
        'updateable_description.md'
      );
      const descContent = await fs.readFile(descriptionPath, 'utf8');
      assert.ok(
        descContent.includes('Updated description'),
        'Description should be updated'
      );
      assert.ok(
        !descContent.includes('Original description'),
        'Old description should be replaced'
      );
    });

    test('should update note type description', async () => {
      const newDescription =
        'Updated description for comprehensive testing of note type modifications.';

      // Get current content hash
      const infoResult = await client.callTool('get_note_type_info', {
        type_name: 'updateable'
      });
      const info = JSON.parse(infoResult.content[0].text);

      const result = await client.callTool('update_note_type', {
        type_name: 'updateable',
        description: newDescription,
        content_hash: info.content_hash
      });

      assert.ok(result.content[0].text.includes('Updated'), 'Should confirm update');

      // Verify description was updated
      const descriptionPath = join(
        context.tempDir,
        '.flint-note',
        'descriptions',
        'updateable_description.md'
      );
      const descriptionContent = await fs.readFile(descriptionPath, 'utf8');
      assert.ok(
        descriptionContent.includes('Updated description for comprehensive testing'),
        'Description should be updated'
      );
      assert.ok(
        !descriptionContent.includes('Original description'),
        'Old description should be replaced'
      );
    });

    test('should update agent instructions', async () => {
      const newInstructions = `- Always include a date and timestamp
- Use structured formatting for consistency
- Include relevant tags and categories
- Cross-reference related notes when applicable
- Maintain clear and concise language`;

      // Get current content hash
      const infoResult = await client.callTool('get_note_type_info', {
        type_name: 'updateable'
      });
      const info = JSON.parse(infoResult.content[0].text);

      const result = await client.callTool('update_note_type', {
        type_name: 'updateable',
        instructions: newInstructions,
        content_hash: info.content_hash
      });

      const responseData = JSON.parse(result.content[0].text);
      assert.ok(responseData.success, 'Should confirm update');
      assert.ok(
        responseData.fields_updated.includes('instructions'),
        'Should include instructions in updated fields'
      );

      // Verify instructions are stored in description file
      const descriptionPath = join(
        context.tempDir,
        '.flint-note',
        'descriptions',
        'updateable_description.md'
      );
      const descriptionContent = await fs.readFile(descriptionPath, 'utf8');
      assert.ok(
        descriptionContent.includes('date and timestamp'),
        'Instructions should be updated'
      );
      assert.ok(
        descriptionContent.includes('structured formatting'),
        'Instructions should contain new content'
      );
    });

    test('should update metadata schema', async () => {
      const metadataSchemaFields = [
        {
          name: 'item_title',
          type: 'string',
          required: true,
          description: 'Title of the item'
        },
        {
          name: 'author',
          type: 'string',
          required: false,
          description: 'Author name'
        },
        {
          name: 'priority',
          type: 'select',
          required: false,
          description: 'Priority level',
          constraints: {
            options: ['high', 'medium', 'low']
          }
        },
        {
          name: 'tags',
          type: 'array',
          required: false,
          description: 'Associated tags'
        },
        {
          name: 'due_date',
          type: 'date',
          required: false,
          description: 'Due date for the item'
        },
        {
          name: 'estimated_hours',
          type: 'number',
          required: false,
          description: 'Estimated hours to complete'
        },
        {
          name: 'completed',
          type: 'boolean',
          required: false,
          description: 'Completion status'
        }
      ];

      // Get current content hash
      const infoResult = await client.callTool('get_note_type_info', {
        type_name: 'updateable'
      });
      const info = JSON.parse(infoResult.content[0].text);

      const result = await client.callTool('update_note_type', {
        type_name: 'updateable',
        metadata_schema: metadataSchemaFields,
        content_hash: info.content_hash
      });

      const responseData = JSON.parse(result.content[0].text);
      assert.ok(responseData.success, 'Should confirm update');
      assert.ok(
        responseData.fields_updated.includes('metadata_schema'),
        'Should include metadata_schema in updated fields'
      );

      // Verify updated info includes metadata schema
      assert.ok(responseData.updated_info, 'Should include updated info');
    });

    test('should validate metadata schema array format', async () => {
      // Get current content hash
      const infoResult = await client.callTool('get_note_type_info', {
        type_name: 'updateable'
      });
      const info = JSON.parse(infoResult.content[0].text);

      // Test with invalid field definition (missing required fields)
      const result1 = await client.callTool('update_note_type', {
        type_name: 'updateable',
        metadata_schema: [
          {
            name: 'item_title'
            // Missing 'type' field
          }
        ],
        content_hash: info.content_hash
      });

      assert.ok(result1.isError, 'Should return error for missing type field');
      const error1 = result1.content[0].text;
      assert.ok(error1.includes('type'), 'Error should mention missing type field');

      // Test with invalid field type
      const result2 = await client.callTool('update_note_type', {
        type_name: 'updateable',
        metadata_schema: [
          {
            name: 'item_title',
            type: 'invalid_type',
            required: true
          }
        ],
        content_hash: info.content_hash
      });

      assert.ok(result2.isError, 'Should return error for invalid field type');
      const error2 = result2.content[0].text;
      assert.ok(
        error2.includes('invalid type') || error2.includes('Valid types'),
        'Error should mention invalid field type'
      );

      // Test with duplicate field names
      const result3 = await client.callTool('update_note_type', {
        type_name: 'updateable',
        metadata_schema: [
          {
            name: 'item_title',
            type: 'string',
            required: true
          },
          {
            name: 'item_title', // Duplicate name
            type: 'string',
            required: false
          }
        ],
        content_hash: info.content_hash
      });

      assert.ok(result3.isError, 'Should return error for duplicate field names');
      const error3 = result3.content[0].text;
      assert.ok(
        error3.includes('Duplicate field names'),
        'Error should mention duplicate field names'
      );
    });

    test('should handle invalid field names', async () => {
      // Get current content hash
      const infoResult = await client.callTool('get_note_type_info', {
        type_name: 'updateable'
      });
      const info = JSON.parse(infoResult.content[0].text);

      try {
        await client.callTool('update_note_type', {
          type_name: 'updateable',
          invalid_field: 'some value',
          content_hash: info.content_hash
        });
        assert.fail('Should reject invalid field name');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('field') || error.message.includes('invalid'));
      }
    });

    test('should handle non-existent note type', async () => {
      const result = await client.callTool('update_note_type', {
        type_name: 'non-existent',
        description: 'New description',
        content_hash: 'dummy-hash'
      });

      // Server returns error response in content
      assert.ok(result.isError, 'Should return error response');
      assert.ok(
        result.content[0].text.includes('Error:'),
        'Should contain error message'
      );
      assert.ok(
        result.content[0].text.includes('does not exist'),
        'Error should mention note type not found'
      );
    });
  });

  describe('Note Type Information Retrieval', () => {
    beforeEach(async () => {
      // Create comprehensive note types for testing
      await client.callTool('create_note_type', {
        type_name: 'comprehensive',
        description: 'A comprehensive note type with all components for testing.',
        agent_instructions: [
          'Always start with a clear overview',
          'Provide detailed analysis in the details section',
          'Summarize key points in the conclusion',
          'Use consistent formatting throughout'
        ]
      });

      // Add metadata schema
      // Get current content hash first
      const infoResult = await client.callTool('get_note_type_info', {
        type_name: 'comprehensive'
      });
      const info = JSON.parse(infoResult.content[0].text);

      await client.callTool('update_note_type', {
        type_name: 'comprehensive',
        metadata_schema: [
          {
            name: 'title',
            type: 'string',
            required: false,
            description: 'Title of the note'
          },
          {
            name: 'category',
            type: 'select',
            required: false,
            description: 'Note category',
            constraints: {
              options: ['analysis', 'summary', 'reference']
            }
          },
          {
            name: 'tags',
            type: 'array',
            required: false,
            description: 'Associated tags'
          },
          {
            name: 'priority',
            type: 'select',
            required: false,
            description: 'Priority level',
            constraints: {
              options: ['high', 'medium', 'low']
            }
          },
          {
            name: 'created',
            type: 'date',
            required: false,
            description: 'Creation date'
          },
          {
            name: 'reviewed',
            type: 'boolean',
            required: false,
            description: 'Review status'
          }
        ],
        content_hash: info.content_hash
      });
    });

    test('should retrieve complete note type information', async () => {
      const result = await client.callTool('get_note_type_info', {
        type_name: 'comprehensive'
      });

      assert.ok(result.content, 'Should return content array');
      const info = JSON.parse(result.content[0].text);

      // Verify all components are present
      assert.strictEqual(info.name || info.type_name, 'comprehensive');
      assert.ok(
        info.description.includes('comprehensive note type'),
        'Should include description'
      );

      assert.ok(
        Array.isArray(info.agent_instructions),
        'Should include agent instructions'
      );
      assert.ok(
        info.agent_instructions.some((inst: string) => inst.includes('clear overview')),
        'Instructions should be included'
      );
      assert.ok(info.metadata_schema, 'Should include metadata schema');
      assert.ok(info.metadata_schema.fields, 'Should have fields array');
      assert.ok(
        Array.isArray(info.metadata_schema.fields),
        'Schema fields should be an array'
      );
    });

    test('should handle non-existent note type info request', async () => {
      const result = await client.callTool('get_note_type_info', {
        type_name: 'non-existent'
      });

      // Server returns error response in content
      assert.ok(result.isError, 'Should return error response');
      assert.ok(
        result.content[0].text.includes('Error:'),
        'Should contain error message'
      );
      assert.ok(
        result.content[0].text.includes('does not exist'),
        'Error should mention note type not found'
      );
    });
  });

  describe('Note Type Listing', () => {
    beforeEach(async () => {
      // Create multiple note types
      await client.callTool('create_note_type', {
        type_name: 'meetings',
        description: 'Meeting notes and agendas.'
      });

      await client.callTool('create_note_type', {
        type_name: 'projects',
        description: 'Project planning and tracking notes.'
      });

      await client.callTool('create_note_type', {
        type_name: 'research',
        description: 'Research notes and findings.'
      });
    });

    test('should list all note types', async () => {
      const result = await client.callTool('list_note_types', {});

      assert.ok(result.content, 'Should return content array');
      const types = JSON.parse(result.content[0].text);

      assert.ok(Array.isArray(types), 'Should return array of note types');
      assert.ok(types.length >= 3, 'Should include all created note types');

      // Verify each note type has required fields
      const typeNames = types.map((type: any) => type.name);
      assert.ok(typeNames.includes('meetings'), 'Should include meetings type');
      assert.ok(typeNames.includes('projects'), 'Should include projects type');
      assert.ok(typeNames.includes('research'), 'Should include research type');

      // Verify structure of note type objects
      const meetingsType = types.find((type: any) => type.name === 'meetings');
      assert.ok(meetingsType.purpose, 'Note type should have purpose');
      assert.ok(
        meetingsType.purpose.includes('Meeting notes'),
        'Purpose should be correct'
      );

      // Verify agent instructions are included
      assert.ok(
        meetingsType.agentInstructions,
        'Note type should have agentInstructions'
      );
      assert.ok(
        Array.isArray(meetingsType.agentInstructions),
        'agentInstructions should be an array'
      );

      // Check if a note type with agent instructions has them populated
      const researchType = types.find((type: any) => type.name === 'research');
      if (researchType && researchType.hasDescription) {
        assert.ok(
          Array.isArray(researchType.agentInstructions),
          'Research type should have agentInstructions array'
        );
      }
    });

    test('should handle empty workspace', async () => {
      // Create fresh workspace with no note types
      const emptyContext = await createIntegrationWorkspace('empty-types');

      try {
        const emptyServerProcess = await startServer({
          workspacePath: emptyContext.tempDir,
          timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
        });

        const emptyClient = new MCPClient(emptyServerProcess);
        const result = await emptyClient.callTool('list_note_types', {});

        const types = JSON.parse(result.content[0].text);
        assert.ok(Array.isArray(types), 'Should return array');
        // Server creates default note types, starting with 'daily'
        assert.ok(types.length >= 1, 'Should have at least one default note type');
        assert.strictEqual(
          types[0].name,
          'daily',
          'Should have daily as first default type'
        );

        // Cleanup
        emptyServerProcess.kill('SIGTERM');
        await cleanupIntegrationWorkspace(emptyContext);
      } catch (error) {
        await cleanupIntegrationWorkspace(emptyContext);
        throw error;
      }
    });
  });

  describe('File System Integration', () => {
    test('should maintain consistent file system structure', async () => {
      await client.callTool('create_note_type', {
        type_name: 'structured',
        description: 'Testing file system structure.',
        agent_instructions: ['Instruction 1', 'Instruction 2']
      });

      // Verify note type directory exists but should be empty (no description file)
      const _typePath = join(context.tempDir, 'structured');
      const files = await fs.readdir(_typePath);

      // Note type directory should be empty since description files are now in .flint-note/descriptions
      assert.strictEqual(files.length, 0, 'Note type directory should be empty');

      // Verify description file exists in .flint-note/descriptions directory
      const descriptionPath = join(
        context.tempDir,
        '.flint-note',
        'descriptions',
        'structured_description.md'
      );
      const descExists = await fs
        .access(descriptionPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(descExists, 'Description file should exist in note type directory');
    });

    test('should handle concurrent note type operations', async () => {
      // Create multiple note types concurrently
      const promises = Array.from({ length: 3 }, (_, i) =>
        client.callTool('create_note_type', {
          type_name: `concurrent-${i + 1}`,
          description: `Concurrent note type ${i + 1} for testing.`
        })
      );

      const results = await Promise.all(promises);

      // Verify all operations completed successfully
      assert.strictEqual(results.length, 3, 'All concurrent operations should complete');

      // Verify all directories were created
      for (let i = 1; i <= 3; i++) {
        const _typePath = join(context.tempDir, `concurrent-${i}`);
        const dirExists = await fs
          .access(_typePath)
          .then(() => true)
          .catch(() => false);
        assert.ok(dirExists, `Concurrent note type ${i} directory should exist`);
      }

      // Verify listing includes all types
      const listResult = await client.callTool('list_note_types', {});
      const types = JSON.parse(listResult.content[0].text);
      const concurrentTypes = types.filter((type: any) =>
        type.name.startsWith('concurrent-')
      );
      assert.strictEqual(
        concurrentTypes.length,
        3,
        'Should list all concurrent note types'
      );
    });
  });

  describe('Protected Field Validation', () => {
    test('should reject creating note type with protected title field', async () => {
      const metadataSchema = {
        fields: [
          {
            name: 'title',
            type: 'string',
            description: 'Title of the note'
          },
          {
            name: 'status',
            type: 'string',
            description: 'Status of the note'
          }
        ]
      };

      const result = await client.callTool('create_note_type', {
        type_name: 'protected-test',
        description: 'A test note type with protected field',
        agent_instructions: ['Test instruction'],
        metadata_schema: metadataSchema
      });

      assert.ok(result.isError, 'Should return an error for protected title field');
      const errorMessage = result.content[0].text;
      assert.ok(
        errorMessage.includes('title') &&
          errorMessage.includes('protected') &&
          errorMessage.includes('automatically managed'),
        `Error should mention protected title field, got: ${errorMessage}`
      );
    });

    test('should reject creating note type with protected created field', async () => {
      const metadataSchema = {
        fields: [
          {
            name: 'created',
            type: 'date',
            description: 'Creation timestamp'
          }
        ]
      };

      const result = await client.callTool('create_note_type', {
        type_name: 'protected-created-test',
        description: 'A test note type with protected created field',
        metadata_schema: metadataSchema
      });

      assert.ok(result.isError, 'Should return an error for protected created field');
      const errorMessage = result.content[0].text;
      assert.ok(
        errorMessage.includes('created') &&
          errorMessage.includes('protected') &&
          errorMessage.includes('automatically managed'),
        `Error should mention protected created field, got: ${errorMessage}`
      );
    });

    test('should reject updating note type with protected updated field', async () => {
      // First create a valid note type
      await client.callTool('create_note_type', {
        type_name: 'update-test',
        description: 'A test note type for update validation'
      });

      // Get the current info to obtain content hash
      const infoResult = await client.callTool('get_note_type_info', {
        type_name: 'update-test'
      });
      const info = JSON.parse(infoResult.content[0].text);

      const protectedSchema = [
        {
          name: 'updated',
          type: 'date',
          description: 'Last updated timestamp'
        },
        {
          name: 'status',
          type: 'string',
          description: 'Status field'
        }
      ];

      const result = await client.callTool('update_note_type', {
        type_name: 'update-test',
        metadata_schema: protectedSchema,
        content_hash: info.content_hash
      });

      assert.ok(result.isError, 'Should return an error for protected updated field');
      const errorMessage = result.content[0].text;
      assert.ok(
        errorMessage.includes('updated') &&
          errorMessage.includes('protected') &&
          errorMessage.includes('automatically managed'),
        `Error should mention protected updated field, got: ${errorMessage}`
      );
    });

    test('should reject updating note type with multiple protected fields', async () => {
      // First create a valid note type
      await client.callTool('create_note_type', {
        type_name: 'multi-protected-test',
        description: 'A test note type for multi-field validation'
      });

      // Get the current info to obtain content hash
      const infoResult = await client.callTool('get_note_type_info', {
        type_name: 'multi-protected-test'
      });
      const info = JSON.parse(infoResult.content[0].text);

      const protectedSchema = [
        {
          name: 'filename',
          type: 'string',
          description: 'Filename of the note'
        },
        {
          name: 'created',
          type: 'date',
          description: 'Creation timestamp'
        }
      ];

      const result = await client.callTool('update_note_type', {
        type_name: 'multi-protected-test',
        metadata_schema: protectedSchema,
        content_hash: info.content_hash
      });

      assert.ok(result.isError, 'Should return an error for multiple protected fields');
      const errorMessage = result.content[0].text;
      assert.ok(
        errorMessage.includes('filename') && errorMessage.includes('protected'),
        `Error should mention protected fields, got: ${errorMessage}`
      );
    });

    test('should allow creating note type with non-protected fields', async () => {
      const validSchema = {
        fields: [
          {
            name: 'status',
            type: 'string',
            description: 'Status of the note',
            constraints: {
              options: ['draft', 'published', 'archived']
            }
          },
          {
            name: 'priority',
            type: 'number',
            description: 'Priority level'
          }
        ]
      };

      const result = await client.callTool('create_note_type', {
        type_name: 'valid-protected-test',
        description: 'A valid note type without protected fields',
        metadata_schema: validSchema
      });

      assert.ok(!result.isError, 'Should not return an error for valid fields');
      const response = JSON.parse(result.content[0].text);
      assert.strictEqual(response.success, true);
      assert.strictEqual(response.type_name, 'valid-protected-test');
    });
  });
});
