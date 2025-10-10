/**
 * Integration tests for vault template application
 * Tests the full flow of creating vaults with templates
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from './test-setup.js';
import path from 'path';

describe('FlintNoteApi - Vault Template Integration', () => {
  let testSetup: TestApiSetup;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('Template Application', () => {
    it('should create vault with default template when no templateId specified', async () => {
      const vaultConfig = {
        id: 'default-template-vault',
        name: 'Default Template Vault',
        path: path.join(testSetup.testWorkspacePath, 'default-template-vault'),
        description: 'Vault with default template',
        initialize: true,
        skipTemplate: false, // Enable template application
        switch_to: false
      };

      const createdVault = await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      expect(createdVault).toBeDefined();
      expect(createdVault.id).toBe(vaultConfig.id);

      // Verify note types were created from template
      const noteTypes = await testSetup.api.listNoteTypes({
        vault_id: vaultConfig.id
      });

      expect(noteTypes.length).toBeGreaterThan(0);
      const noteTypeNames = noteTypes.map((nt) => nt.name);

      // Default template should have daily and note types
      expect(noteTypeNames).toContain('daily');
      expect(noteTypeNames).toContain('note');
    });

    it('should create vault with specified template', async () => {
      const vaultConfig = {
        id: 'research-template-vault',
        name: 'Research Template Vault',
        path: path.join(testSetup.testWorkspacePath, 'research-template-vault'),
        description: 'Vault with research template',
        templateId: 'research',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      const createdVault = await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      expect(createdVault).toBeDefined();

      // Verify research-specific note types were created
      const noteTypes = await testSetup.api.listNoteTypes({
        vault_id: vaultConfig.id
      });

      const noteTypeNames = noteTypes.map((nt) => nt.name);

      // Research template should have specialized types
      expect(noteTypeNames).toContain('paper');
      expect(noteTypeNames).toContain('concept');
    });

    it('should create starter notes from template', async () => {
      const vaultConfig = {
        id: 'notes-template-vault',
        name: 'Notes Template Vault',
        path: path.join(testSetup.testWorkspacePath, 'notes-template-vault'),
        description: 'Vault to test starter notes',
        templateId: 'default',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      // List all notes in the vault
      const notes = await testSetup.api.listNotes({
        vaultId: vaultConfig.id
      });

      expect(notes.length).toBeGreaterThan(0);

      // Should have welcome note
      const welcomeNote = notes.find((n) => n.title.toLowerCase().includes('welcome'));
      expect(welcomeNote).toBeDefined();
    });

    it('should skip template application when skipTemplate is true', async () => {
      const vaultConfig = {
        id: 'no-template-vault',
        name: 'No Template Vault',
        path: path.join(testSetup.testWorkspacePath, 'no-template-vault'),
        description: 'Vault without template',
        initialize: true,
        skipTemplate: true,
        switch_to: false
      };

      await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      // Should have no notes from template
      const notes = await testSetup.api.listNotes({
        vaultId: vaultConfig.id
      });

      expect(notes.length).toBe(0);

      // Should still have basic initialization (config, etc)
      // but no template-specific content
    });
  });

  describe('Template Note Types', () => {
    it('should create note types with proper metadata schema', async () => {
      const vaultConfig = {
        id: 'metadata-template-vault',
        name: 'Metadata Template Vault',
        path: path.join(testSetup.testWorkspacePath, 'metadata-template-vault'),
        description: 'Vault to test metadata schema',
        templateId: 'research',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      // Get paper note type info
      const paperTypeInfo = await testSetup.api.getNoteTypeInfo({
        type_name: 'paper',
        vault_id: vaultConfig.id
      });

      expect(paperTypeInfo).toBeDefined();
      expect(paperTypeInfo.name).toBe('paper');
      expect(paperTypeInfo.metadata_schema).toBeDefined();
      expect(paperTypeInfo.metadata_schema.fields).toBeDefined();
      expect(paperTypeInfo.metadata_schema.fields.length).toBeGreaterThan(0);

      // Verify metadata fields have required properties
      const fields = paperTypeInfo.metadata_schema.fields;
      for (const field of fields) {
        expect(field.name).toBeDefined();
        expect(field.type).toBeDefined();
      }
    });

    it('should create note types with agent instructions', async () => {
      const vaultConfig = {
        id: 'instructions-template-vault',
        name: 'Instructions Template Vault',
        path: path.join(testSetup.testWorkspacePath, 'instructions-template-vault'),
        description: 'Vault to test agent instructions',
        templateId: 'default',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      // Get daily note type info
      const dailyTypeInfo = await testSetup.api.getNoteTypeInfo({
        type_name: 'daily',
        vault_id: vaultConfig.id
      });

      expect(dailyTypeInfo).toBeDefined();
      expect(dailyTypeInfo.instructions).toBeDefined();
      expect(Array.isArray(dailyTypeInfo.instructions)).toBe(true);
      expect(dailyTypeInfo.instructions.length).toBeGreaterThan(0);

      // Instructions should be non-empty strings
      for (const instruction of dailyTypeInfo.instructions) {
        expect(typeof instruction).toBe('string');
        expect(instruction.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Template Notes Content', () => {
    it('should create notes with valid markdown content', async () => {
      const vaultConfig = {
        id: 'content-template-vault',
        name: 'Content Template Vault',
        path: path.join(testSetup.testWorkspacePath, 'content-template-vault'),
        description: 'Vault to test note content',
        templateId: 'default',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      // Get all notes
      const notes = await testSetup.api.listNotes({
        vaultId: vaultConfig.id
      });

      expect(notes.length).toBeGreaterThan(0);

      // Verify each note has valid content
      for (const noteListItem of notes) {
        const note = await testSetup.api.getNote(vaultConfig.id, noteListItem.id);

        expect(note).toBeDefined();
        expect(note.content).toBeDefined();
        expect(note.content.length).toBeGreaterThan(0);
        expect(note.title).toBeDefined();
        expect(note.type).toBeDefined();

        // Content should be valid markdown (basic check)
        expect(typeof note.content).toBe('string');
      }
    });

    it('should create notes in correct note type directories', async () => {
      const vaultConfig = {
        id: 'directory-template-vault',
        name: 'Directory Template Vault',
        path: path.join(testSetup.testWorkspacePath, 'directory-template-vault'),
        description: 'Vault to test directory structure',
        templateId: 'default',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      const notes = await testSetup.api.listNotes({
        vaultId: vaultConfig.id
      });

      // All notes should have a valid type
      for (const note of notes) {
        expect(note.type).toBeDefined();
        expect(note.type.length).toBeGreaterThan(0);

        // Path should include the type directory
        expect(note.path).toContain(note.type);
      }
    });
  });

  describe('Template Graceful Degradation', () => {
    it('should handle invalid templateId gracefully', async () => {
      const vaultConfig = {
        id: 'invalid-template-vault',
        name: 'Invalid Template Vault',
        path: path.join(testSetup.testWorkspacePath, 'invalid-template-vault'),
        description: 'Vault with invalid template',
        templateId: 'non-existent-template',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      // Should not throw - template application errors are caught
      const createdVault = await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      expect(createdVault).toBeDefined();

      // Vault should still be created and initialized
      expect(createdVault.id).toBe(vaultConfig.id);

      // Should have no notes from template
      const notes = await testSetup.api.listNotes({
        vaultId: vaultConfig.id
      });

      expect(notes.length).toBe(0);
    });

    it('should create vault even if template application fails', async () => {
      const vaultConfig = {
        id: 'fail-template-vault',
        name: 'Fail Template Vault',
        path: path.join(testSetup.testWorkspacePath, 'fail-template-vault'),
        description: 'Vault where template may fail',
        templateId: 'default',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      // Even if template application encounters errors, vault should be created
      const createdVault = await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      expect(createdVault).toBeDefined();
      expect(createdVault.id).toBe(vaultConfig.id);

      // Vault directory should exist
      const vaults = await testSetup.api.listVaults();
      const foundVault = vaults.find((v) => v.id === vaultConfig.id);
      expect(foundVault).toBeDefined();
    });
  });

  describe('Template API Integration', () => {
    it('should list available templates', async () => {
      const templates = await testSetup.api.listTemplates();

      expect(templates).toBeDefined();
      expect(templates.length).toBeGreaterThan(0);

      // Should include at least default and research
      const templateIds = templates.map((t) => t.id);
      expect(templateIds).toContain('default');
      expect(templateIds).toContain('research');

      // Each template should have required metadata
      for (const template of templates) {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
      }
    });

    it('should use template metadata for vault creation', async () => {
      const templates = await testSetup.api.listTemplates();
      const researchTemplate = templates.find((t) => t.id === 'research');

      expect(researchTemplate).toBeDefined();
      expect(researchTemplate?.name).toBe('Research Vault');
      expect(researchTemplate?.icon).toBe('🔬');

      // Create vault with research template
      const vaultConfig = {
        id: 'research-vault',
        name: 'Research Vault',
        path: path.join(testSetup.testWorkspacePath, 'research-vault'),
        templateId: 'research',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      const createdVault = await testSetup.api.createVault(vaultConfig);
      testSetup.createdVaultIds.push(vaultConfig.id);

      expect(createdVault).toBeDefined();
    });
  });

  describe('Multiple Templates', () => {
    it('should create different vaults with different templates', async () => {
      // Create vault with default template
      const defaultVault = {
        id: 'default-vault',
        name: 'Default Vault',
        path: path.join(testSetup.testWorkspacePath, 'default-vault'),
        templateId: 'default',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      await testSetup.api.createVault(defaultVault);
      testSetup.createdVaultIds.push(defaultVault.id);

      // Create vault with research template
      const researchVault = {
        id: 'research-vault-multi',
        name: 'Research Vault Multi',
        path: path.join(testSetup.testWorkspacePath, 'research-vault-multi'),
        templateId: 'research',
        initialize: true,
        skipTemplate: false,
        switch_to: false
      };

      await testSetup.api.createVault(researchVault);
      testSetup.createdVaultIds.push(researchVault.id);

      // Verify different note types in each vault
      const defaultNoteTypes = await testSetup.api.listNoteTypes({
        vault_id: defaultVault.id
      });
      const researchNoteTypes = await testSetup.api.listNoteTypes({
        vault_id: researchVault.id
      });

      const defaultTypeNames = defaultNoteTypes.map((nt) => nt.name);
      const researchTypeNames = researchNoteTypes.map((nt) => nt.name);

      // Research vault should have paper type, default should not
      expect(researchTypeNames).toContain('paper');
      expect(defaultTypeNames).not.toContain('paper');
    });
  });
});
