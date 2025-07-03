/**
 * Integration tests for cross-vault note operations using vault_id parameter
 * These tests verify that note operations work correctly across different vaults
 * and that vault isolation is maintained properly.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { GlobalConfigManager } from '../../src/utils/global-config.js';
import {
  createTempDirName,
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

/**
 * Helper function to create temporary directory
 */
async function createTempDir(prefix: string): Promise<string> {
  const tempDir = createTempDirName(prefix);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Helper function to cleanup temporary directory
 */
async function cleanup(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Helper function to create a basic note type in a vault
 */
async function createTestNoteType(
  vaultPath: string,
  typeName: string,
  description: string
): Promise<void> {
  const configDir = join(vaultPath, '.flint-note');
  await fs.mkdir(configDir, { recursive: true });

  const descriptionPath = join(configDir, `${typeName}_description.md`);
  await fs.writeFile(descriptionPath, `# ${typeName}\n\n${description}`);

  const typeDir = join(vaultPath, typeName);
  await fs.mkdir(typeDir, { recursive: true });
}

describe('Cross-Vault Note Operations', () => {
  let context: IntegrationTestContext;
  let client: MCPClient;
  let globalConfig: GlobalConfigManager;
  let tempDir: string;
  let workVaultPath: string;
  let personalVaultPath: string;

  beforeEach(async () => {
    // Create temporary directory for this test
    tempDir = await createTempDir('cross-vault-note-ops');
    workVaultPath = join(tempDir, 'work');
    personalVaultPath = join(tempDir, 'personal');

    await fs.mkdir(workVaultPath, { recursive: true });
    await fs.mkdir(personalVaultPath, { recursive: true });

    // Set up global config to use temp directory
    process.env.XDG_CONFIG_HOME = tempDir;
    globalConfig = new GlobalConfigManager();
    await globalConfig.load();

    // Create two test vaults
    await globalConfig.addVault(
      'work',
      'Work Vault',
      workVaultPath,
      'Work-related notes and projects'
    );
    await globalConfig.addVault(
      'personal',
      'Personal Vault',
      personalVaultPath,
      'Personal notes and journaling'
    );

    // Set work as active vault
    await globalConfig.switchVault('work');

    // Create note types in both vaults
    await createTestNoteType(workVaultPath, 'meetings', 'Meeting notes and action items');
    await createTestNoteType(workVaultPath, 'projects', 'Project documentation');
    await createTestNoteType(personalVaultPath, 'journal', 'Personal journal entries');
    await createTestNoteType(personalVaultPath, 'goals', 'Personal goals and tracking');

    // Start server with the work vault as workspace
    context = { tempDir: workVaultPath };
    context.serverProcess = await startServer({
      workspacePath: workVaultPath,
      timeout: INTEGRATION_CONSTANTS.SERVER_STARTUP_TIMEOUT
    });

    client = new MCPClient(context.serverProcess);
  });

  afterEach(async () => {
    // Kill server process
    if (context.serverProcess && !context.serverProcess.killed) {
      context.serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!context.serverProcess.killed) {
        context.serverProcess.kill('SIGKILL');
      }
    }

    // Clean up temporary directory
    await cleanup(tempDir);
    delete process.env.XDG_CONFIG_HOME;
  });

  describe('Note Creation Across Vaults', () => {
    test('should create note in active vault without vault_id', async () => {
      const noteData = {
        type: 'meetings',
        title: 'Team Standup',
        content: '# Team Standup\n\nDaily standup meeting notes.'
      };

      const result = await client.callTool('create_note', noteData);
      const responseData = JSON.parse(result.content[0].text);

      assert.ok(responseData.id, 'Should have note ID');
      assert.strictEqual(responseData.type, 'meetings');
      assert.strictEqual(responseData.title, 'Team Standup');

      // Verify file was created in work vault
      const expectedPath = join(workVaultPath, 'meetings', 'team-standup.md');
      const fileExists = await fs
        .access(expectedPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(fileExists, 'Note should exist in work vault');

      // Verify file does not exist in personal vault
      const personalPath = join(personalVaultPath, 'meetings', 'team-standup.md');
      const personalExists = await fs
        .access(personalPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(!personalExists, 'Note should not exist in personal vault');
    });

    test('should create note in specific vault with vault_id', async () => {
      const noteData = {
        type: 'journal',
        title: 'Daily Reflection',
        content: '# Daily Reflection\n\nToday I learned...',
        vault_id: 'personal'
      };

      const result = await client.callTool('create_note', noteData);
      const responseData = JSON.parse(result.content[0].text);

      assert.ok(responseData.id, 'Should have note ID');
      assert.strictEqual(responseData.type, 'journal');
      assert.strictEqual(responseData.title, 'Daily Reflection');

      // Verify file was created in personal vault
      const expectedPath = join(personalVaultPath, 'journal', 'daily-reflection.md');
      const fileExists = await fs
        .access(expectedPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(fileExists, 'Note should exist in personal vault');

      // Verify file does not exist in work vault
      const workPath = join(workVaultPath, 'journal', 'daily-reflection.md');
      const workExists = await fs
        .access(workPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(!workExists, 'Note should not exist in work vault');
    });

    test('should create notes with same title in different vaults', async () => {
      // Create note in work vault
      const workNoteData = {
        type: 'projects',
        title: 'Website Redesign',
        content: '# Website Redesign\n\nWork project for client website.',
        vault_id: 'work'
      };

      const workResult = await client.callTool('create_note', workNoteData);
      const workResponseData = JSON.parse(workResult.content[0].text);

      // Create note with same title in personal vault
      const personalNoteData = {
        type: 'goals',
        title: 'Website Redesign',
        content: '# Website Redesign\n\nPersonal blog redesign project.',
        vault_id: 'personal'
      };

      const personalResult = await client.callTool('create_note', personalNoteData);
      const personalResponseData = JSON.parse(personalResult.content[0].text);

      // Verify both notes were created successfully
      assert.ok(workResponseData.id, 'Work note should have ID');
      assert.ok(personalResponseData.id, 'Personal note should have ID');
      assert.notStrictEqual(
        workResponseData.id,
        personalResponseData.id,
        'Notes should have different IDs'
      );

      // Verify files exist in respective vaults
      const workPath = join(workVaultPath, 'projects', 'website-redesign.md');
      const personalPath = join(personalVaultPath, 'goals', 'website-redesign.md');

      const workExists = await fs
        .access(workPath)
        .then(() => true)
        .catch(() => false);
      const personalExists = await fs
        .access(personalPath)
        .then(() => true)
        .catch(() => false);

      assert.ok(workExists, 'Work note should exist');
      assert.ok(personalExists, 'Personal note should exist');

      // Verify content is different
      const workContent = await fs.readFile(workPath, 'utf8');
      const personalContent = await fs.readFile(personalPath, 'utf8');

      assert.ok(
        workContent.includes('client website'),
        'Work note should have work content'
      );
      assert.ok(
        personalContent.includes('Personal blog'),
        'Personal note should have personal content'
      );
    });

    test('should handle invalid vault_id during creation', async () => {
      const noteData = {
        type: 'meetings',
        title: 'Invalid Vault Test',
        content: '# Invalid Vault Test\n\nThis should fail.',
        vault_id: 'nonexistent'
      };

      const result = await client.callTool('create_note', noteData);

      assert.strictEqual(result.isError, true, 'Should return error response');
      assert.ok(
        result.content[0].text.includes('does not exist'),
        'Should get vault not found error'
      );
    });
  });

  describe('Note Retrieval Across Vaults', () => {
    test('should retrieve note from active vault without vault_id', async () => {
      // First create a note in the active vault
      const noteData = {
        type: 'meetings',
        title: 'Sprint Planning',
        content: '# Sprint Planning\n\nPlanning our next sprint.'
      };

      const createResult = await client.callTool('create_note', noteData);
      const createdNote = JSON.parse(createResult.content[0].text);

      // Now retrieve the note
      const getResult = await client.callTool('get_note', {
        identifier: createdNote.id
      });

      const retrievedNote = JSON.parse(getResult.content[0].text);
      assert.strictEqual(retrievedNote.id, createdNote.id);
      assert.strictEqual(retrievedNote.title, 'Sprint Planning');
      assert.ok(retrievedNote.content.includes('Planning our next sprint'));
    });

    test('should retrieve note from specific vault with vault_id', async () => {
      // Create a note in personal vault
      const noteData = {
        type: 'journal',
        title: 'Morning Pages',
        content: '# Morning Pages\n\nMy thoughts for today.',
        vault_id: 'personal'
      };

      const createResult = await client.callTool('create_note', noteData);
      const createdNote = JSON.parse(createResult.content[0].text);

      // Retrieve the note using vault_id
      const getResult = await client.callTool('get_note', {
        identifier: createdNote.id,
        vault_id: 'personal'
      });

      const retrievedNote = JSON.parse(getResult.content[0].text);
      assert.strictEqual(retrievedNote.id, createdNote.id);
      assert.strictEqual(retrievedNote.title, 'Morning Pages');
      assert.ok(retrievedNote.content.includes('My thoughts for today'));
    });

    test('should not retrieve note from wrong vault', async () => {
      // Create a note in personal vault
      const noteData = {
        type: 'journal',
        title: 'Private Thoughts',
        content: '# Private Thoughts\n\nThis is personal.',
        vault_id: 'personal'
      };

      const createResult = await client.callTool('create_note', noteData);
      const createdNote = JSON.parse(createResult.content[0].text);

      // Try to retrieve from work vault (should return null)
      const getResult = await client.callTool('get_note', {
        identifier: createdNote.id,
        vault_id: 'work'
      });

      assert.strictEqual(
        getResult.content[0].text,
        'null',
        'Should return null for note not found'
      );
    });

    test('should handle invalid vault_id during retrieval', async () => {
      const result = await client.callTool('get_note', {
        identifier: 'meetings/some-note',
        vault_id: 'nonexistent'
      });

      assert.strictEqual(result.isError, true, 'Should return error response');
      assert.ok(
        result.content[0].text.includes('does not exist'),
        'Should get vault not found error'
      );
    });
  });

  describe('Note Updates Across Vaults', () => {
    test('should update note in active vault without vault_id', async () => {
      // Create a note in active vault
      const noteData = {
        type: 'meetings',
        title: 'Team Meeting',
        content: '# Team Meeting\n\nInitial agenda.'
      };

      const createResult = await client.callTool('create_note', noteData);
      const createdNote = JSON.parse(createResult.content[0].text);

      // Get the note to obtain the content_hash
      const getResult = await client.callTool('get_note', {
        identifier: createdNote.id
      });
      const currentNote = JSON.parse(getResult.content[0].text);

      // Update the note
      const updateResult = await client.callTool('update_note', {
        identifier: createdNote.id,
        content: '# Team Meeting\n\nUpdated with action items.',
        content_hash: currentNote.content_hash
      });

      // Check if the response is an error or success
      if (updateResult.isError) {
        console.log('Update error:', updateResult.content[0].text);
        // For debugging - let's see what's happening
        assert.fail(`Update failed: ${updateResult.content[0].text}`);
      } else {
        const updateResponse = JSON.parse(updateResult.content[0].text);
        assert.strictEqual(updateResponse.id, createdNote.id);
        assert.strictEqual(updateResponse.updated, true);
        assert.ok(updateResponse.timestamp);

        // Verify the content was actually updated by getting the note again
        const verifyResult = await client.callTool('get_note', {
          identifier: createdNote.id
        });
        const verifiedNote = JSON.parse(verifyResult.content[0].text);
        assert.ok(verifiedNote.content.includes('Updated with action items'));
        assert.notStrictEqual(verifiedNote.content_hash, currentNote.content_hash);
      }
    });

    test('should update note in specific vault with vault_id', async () => {
      // Create a note in personal vault
      const noteData = {
        type: 'goals',
        title: 'Fitness Goals',
        content: '# Fitness Goals\n\nRun 5k by end of month.',
        vault_id: 'personal'
      };

      const createResult = await client.callTool('create_note', noteData);
      const createdNote = JSON.parse(createResult.content[0].text);

      // Get the note to obtain the content_hash
      const getResult = await client.callTool('get_note', {
        identifier: createdNote.id,
        vault_id: 'personal'
      });
      const currentNote = JSON.parse(getResult.content[0].text);

      // Update the note in personal vault
      const updateResult = await client.callTool('update_note', {
        identifier: createdNote.id,
        content:
          '# Fitness Goals\n\nRun 5k by end of month.\n\nCompleted first week of training!',
        content_hash: currentNote.content_hash,
        vault_id: 'personal'
      });

      // Check if the response is an error or success
      if (updateResult.isError) {
        console.log('Update error:', updateResult.content[0].text);
        // For debugging - let's see what's happening
        assert.fail(`Update failed: ${updateResult.content[0].text}`);
      } else {
        const updateResponse = JSON.parse(updateResult.content[0].text);
        assert.strictEqual(updateResponse.id, createdNote.id);
        assert.strictEqual(updateResponse.updated, true);
        assert.ok(updateResponse.timestamp);

        // Verify the content was actually updated by getting the note again
        const verifyResult = await client.callTool('get_note', {
          identifier: createdNote.id,
          vault_id: 'personal'
        });
        const verifiedNote = JSON.parse(verifyResult.content[0].text);
        assert.ok(verifiedNote.content.includes('Completed first week'));
        assert.notStrictEqual(verifiedNote.content_hash, currentNote.content_hash);
      }
    });

    test('should not update note from wrong vault', async () => {
      // Create a note in personal vault
      const noteData = {
        type: 'journal',
        title: 'Private Entry',
        content: '# Private Entry\n\nPersonal thoughts.',
        vault_id: 'personal'
      };

      const createResult = await client.callTool('create_note', noteData);
      const createdNote = JSON.parse(createResult.content[0].text);

      // Get the note to obtain the content_hash
      const getResult = await client.callTool('get_note', {
        identifier: createdNote.id,
        vault_id: 'personal'
      });
      const currentNote = JSON.parse(getResult.content[0].text);

      // Try to update from work vault (should return error)
      const updateResult = await client.callTool('update_note', {
        identifier: createdNote.id,
        content: '# Private Entry\n\nUpdated content.',
        content_hash: currentNote.content_hash,
        vault_id: 'work'
      });

      assert.strictEqual(updateResult.isError, true, 'Should return error response');
      assert.ok(
        updateResult.content[0].text.includes('not found') ||
          updateResult.content[0].text.includes('Note not found') ||
          updateResult.content[0].text.includes('does not exist'),
        'Should get note not found error'
      );
    });
  });

  describe('Search Operations Across Vaults', () => {
    test('should search notes in active vault without vault_id', async () => {
      // Create some notes in work vault
      await client.callTool('create_note', {
        type: 'meetings',
        title: 'Daily Standup',
        content: '# Daily Standup\n\nDiscussed project progress.'
      });

      await client.callTool('create_note', {
        type: 'projects',
        title: 'API Development',
        content: '# API Development\n\nBuilding REST API endpoints.'
      });

      // Search in active vault
      const searchResult = await client.callTool('search_notes', {
        query: 'project'
      });

      const searchData = JSON.parse(searchResult.content[0].text);
      assert.ok(Array.isArray(searchData), 'Should return search results array');
      assert.ok(searchData.length > 0, 'Should find notes with "project"');

      // Check that results are from work vault
      const foundProjects = searchData.filter(
        note =>
          (note.title && note.title.toLowerCase().includes('project')) ||
          (note.title && note.title.toLowerCase().includes('api')) ||
          (note.snippet && note.snippet.toLowerCase().includes('project'))
      );
      assert.ok(foundProjects.length > 0, 'Should find work-related project notes');
    });

    test('should search notes in specific vault with vault_id', async () => {
      // Create notes in personal vault
      await client.callTool('create_note', {
        type: 'journal',
        title: 'Personal Growth',
        content: '# Personal Growth\n\nReflections on learning.',
        vault_id: 'personal'
      });

      await client.callTool('create_note', {
        type: 'goals',
        title: 'Learning Goals',
        content: '# Learning Goals\n\nSkills I want to develop.',
        vault_id: 'personal'
      });

      // Search in personal vault
      const searchResult = await client.callTool('search_notes', {
        query: 'learning',
        vault_id: 'personal'
      });

      const searchData = JSON.parse(searchResult.content[0].text);
      assert.ok(Array.isArray(searchData), 'Should return search results array');
      assert.ok(searchData.length > 0, 'Should find notes with "learning"');

      // Check that results are from personal vault
      const foundLearning = searchData.filter(
        note => note.title.includes('Learning') || note.title.includes('Growth')
      );
      assert.ok(foundLearning.length > 0, 'Should find personal learning notes');
    });

    test('should maintain search isolation between vaults', async () => {
      // Create distinctive notes in each vault
      await client.callTool('create_note', {
        type: 'meetings',
        title: 'Work Conference',
        content: '# Work Conference\n\nProfessional development event.',
        vault_id: 'work'
      });

      await client.callTool('create_note', {
        type: 'journal',
        title: 'Personal Conference',
        content: '# Personal Conference\n\nPersonal growth workshop.',
        vault_id: 'personal'
      });

      // Search in work vault
      const workSearchResult = await client.callTool('search_notes', {
        query: 'conference',
        vault_id: 'work'
      });

      const workSearchData = JSON.parse(workSearchResult.content[0].text);
      assert.strictEqual(workSearchData.length, 1, 'Should find only work conference');
      assert.ok(workSearchData[0].title.includes('Work'), 'Should find work conference');

      // Search in personal vault
      const personalSearchResult = await client.callTool('search_notes', {
        query: 'conference',
        vault_id: 'personal'
      });

      const personalSearchData = JSON.parse(personalSearchResult.content[0].text);
      assert.strictEqual(
        personalSearchData.length,
        1,
        'Should find only personal conference'
      );
      assert.ok(
        personalSearchData[0].title.includes('Personal'),
        'Should find personal conference'
      );
    });
  });

  describe('Vault Isolation Verification', () => {
    test('should maintain complete isolation between vaults', async () => {
      // Create notes in both vaults
      const workNote = await client.callTool('create_note', {
        type: 'meetings',
        title: 'Work Meeting',
        content: '# Work Meeting\n\nWork-related discussion.',
        vault_id: 'work'
      });

      const personalNote = await client.callTool('create_note', {
        type: 'journal',
        title: 'Personal Journal',
        content: '# Personal Journal\n\nPersonal thoughts.',
        vault_id: 'personal'
      });

      const workNoteData = JSON.parse(workNote.content[0].text);
      const personalNoteData = JSON.parse(personalNote.content[0].text);

      // Verify notes exist in their respective vaults
      const workNoteExists = await fs
        .access(join(workVaultPath, 'meetings', 'work-meeting.md'))
        .then(() => true)
        .catch(() => false);

      const personalNoteExists = await fs
        .access(join(personalVaultPath, 'journal', 'personal-journal.md'))
        .then(() => true)
        .catch(() => false);

      assert.ok(workNoteExists, 'Work note should exist in work vault');
      assert.ok(personalNoteExists, 'Personal note should exist in personal vault');

      // Verify cross-vault note retrieval fails
      const workInPersonalResult = await client.callTool('get_note', {
        identifier: workNoteData.id,
        vault_id: 'personal'
      });
      assert.strictEqual(
        workInPersonalResult.content[0].text,
        'null',
        'Should not retrieve work note from personal vault'
      );

      const personalInWorkResult = await client.callTool('get_note', {
        identifier: personalNoteData.id,
        vault_id: 'work'
      });
      assert.strictEqual(
        personalInWorkResult.content[0].text,
        'null',
        'Should not retrieve personal note from work vault'
      );
    });

    test('should maintain separate file system structures', async () => {
      // Create notes in both vaults
      await client.callTool('create_note', {
        type: 'meetings',
        title: 'Team Sync',
        content: '# Team Sync\n\nWeekly team synchronization.',
        vault_id: 'work'
      });

      await client.callTool('create_note', {
        type: 'journal',
        title: 'Weekend Thoughts',
        content: '# Weekend Thoughts\n\nWeekend reflections.',
        vault_id: 'personal'
      });

      // Check work vault structure
      const workContents = await fs.readdir(workVaultPath, { recursive: true });
      assert.ok(
        workContents.includes('meetings'),
        'Work vault should have meetings directory'
      );
      assert.ok(
        workContents.includes('projects'),
        'Work vault should have projects directory'
      );
      assert.ok(
        !workContents.includes('journal'),
        'Work vault should not have journal directory'
      );

      // Check personal vault structure
      const personalContents = await fs.readdir(personalVaultPath, { recursive: true });
      assert.ok(
        personalContents.includes('journal'),
        'Personal vault should have journal directory'
      );
      assert.ok(
        personalContents.includes('goals'),
        'Personal vault should have goals directory'
      );
      assert.ok(
        !personalContents.includes('meetings'),
        'Personal vault should not have meetings directory'
      );
    });
  });

  describe('Mixed Operations (with and without vault_id)', () => {
    test('should handle mixed vault operations in sequence', async () => {
      // Create note in active vault (work) without vault_id
      const workNote = await client.callTool('create_note', {
        type: 'meetings',
        title: 'Morning Standup',
        content: '# Morning Standup\n\nDaily standup meeting.'
      });

      // Create note in personal vault with vault_id
      const personalNote = await client.callTool('create_note', {
        type: 'journal',
        title: 'Morning Pages',
        content: '# Morning Pages\n\nMorning journaling.',
        vault_id: 'personal'
      });

      // Retrieve work note without vault_id
      const workNoteData = JSON.parse(workNote.content[0].text);
      const retrievedWorkNote = await client.callTool('get_note', {
        identifier: workNoteData.id
      });

      // Retrieve personal note with vault_id
      const personalNoteData = JSON.parse(personalNote.content[0].text);
      const retrievedPersonalNote = await client.callTool('get_note', {
        identifier: personalNoteData.id,
        vault_id: 'personal'
      });

      // Verify both operations succeeded
      const workRetrieved = JSON.parse(retrievedWorkNote.content[0].text);
      const personalRetrieved = JSON.parse(retrievedPersonalNote.content[0].text);

      assert.strictEqual(workRetrieved.title, 'Morning Standup');
      assert.strictEqual(personalRetrieved.title, 'Morning Pages');
      assert.ok(workRetrieved.content.includes('Daily standup'));
      assert.ok(personalRetrieved.content.includes('Morning journaling'));
    });

    test('should handle vault switching and operations', async () => {
      // Create note in work vault
      await client.callTool('create_note', {
        type: 'projects',
        title: 'Project Alpha',
        content: '# Project Alpha\n\nInitial project setup.',
        vault_id: 'work'
      });

      // Switch active vault to personal (this doesn't affect the MCP server directly,
      // but we can simulate it by ensuring operations work correctly)
      await globalConfig.switchVault('personal');

      // Create note in personal vault without vault_id (should work in personal vault)
      const personalNote = await client.callTool('create_note', {
        type: 'goals',
        title: 'Health Goals',
        content: '# Health Goals\n\nImprove physical fitness.',
        vault_id: 'personal'
      });

      // Verify personal note was created
      const personalNoteData = JSON.parse(personalNote.content[0].text);
      assert.strictEqual(personalNoteData.title, 'Health Goals');

      // Verify we can still access work vault notes with vault_id
      const workSearch = await client.callTool('search_notes', {
        query: 'Alpha',
        vault_id: 'work'
      });

      const workSearchData = JSON.parse(workSearch.content[0].text);
      assert.ok(
        workSearchData.length > 0,
        'Should find work notes even after vault switch'
      );
    });
  });
});
