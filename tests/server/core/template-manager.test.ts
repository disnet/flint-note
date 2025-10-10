/**
 * Tests for TemplateManager
 * Tests template loading, validation, and metadata extraction
 */

import { describe, it, expect } from 'vitest';
import { TemplateManager } from '../../../src/server/core/template-manager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Point to the actual templates directory in the source
const TEMPLATES_DIR = path.join(__dirname, '../../../src/server/templates');

describe('TemplateManager', () => {
  describe('Template Discovery', () => {
    it('should list all available templates', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const templates = await templateManager.listTemplates();

      expect(templates).toBeDefined();
      expect(templates.length).toBeGreaterThan(0);

      // Should include at least the default and research templates
      const templateIds = templates.map((t) => t.id);
      expect(templateIds).toContain('default');
      expect(templateIds).toContain('research');
    });

    it('should load template metadata correctly', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const templates = await templateManager.listTemplates();

      for (const template of templates) {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(typeof template.id).toBe('string');
        expect(typeof template.name).toBe('string');
        expect(typeof template.description).toBe('string');
      }
    });
  });

  describe('Default Template', () => {
    it('should load default template metadata', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const metadata = await templateManager.loadTemplateMetadata('default');

      expect(metadata.id).toBe('default');
      expect(metadata.name).toBe('Default Vault');
      expect(metadata.description).toContain('general-purpose');
      expect(metadata.icon).toBe('📝');
      expect(metadata.author).toBe('Flint Team');
      expect(metadata.version).toBe('1.0.0');
    });

    it('should load complete default template', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const template = await templateManager.loadTemplate('default');

      expect(template).toBeDefined();
      expect(template.metadata).toBeDefined();
      expect(template.noteTypes).toBeDefined();
      expect(template.notes).toBeDefined();

      // Should have metadata
      expect(template.metadata.id).toBe('default');

      // Should have note types
      expect(template.noteTypes.length).toBeGreaterThan(0);
      const noteTypeNames = template.noteTypes.map((nt) => nt.name);
      expect(noteTypeNames).toContain('daily');
      expect(noteTypeNames).toContain('note');

      // Should have starter notes
      expect(template.notes.length).toBeGreaterThan(0);
    });

    it('should load default template note types with valid schema', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const template = await templateManager.loadTemplate('default');

      for (const noteType of template.noteTypes) {
        // Validate required fields
        expect(noteType.name).toBeDefined();
        expect(noteType.purpose).toBeDefined();
        expect(typeof noteType.name).toBe('string');
        expect(typeof noteType.purpose).toBe('string');

        // Validate agent instructions
        expect(Array.isArray(noteType.agent_instructions)).toBe(true);
        expect(noteType.agent_instructions.length).toBeGreaterThan(0);

        // Validate metadata schema if present
        if (noteType.metadata_schema) {
          expect(Array.isArray(noteType.metadata_schema.fields)).toBe(true);
        }
      }
    });

    it('should load default template starter notes', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const template = await templateManager.loadTemplate('default');

      expect(template.notes.length).toBeGreaterThan(0);

      for (const note of template.notes) {
        // Validate required fields
        expect(note.filename).toBeDefined();
        expect(note.title).toBeDefined();
        expect(note.content).toBeDefined();
        expect(note.type).toBeDefined();

        // Validate types
        expect(typeof note.filename).toBe('string');
        expect(typeof note.title).toBe('string');
        expect(typeof note.content).toBe('string');
        expect(typeof note.type).toBe('string');

        // Filename should end with .md
        expect(note.filename).toMatch(/\.md$/);

        // Content should not be empty
        expect(note.content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Research Template', () => {
    it('should load research template metadata', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const metadata = await templateManager.loadTemplateMetadata('research');

      expect(metadata.id).toBe('research');
      expect(metadata.name).toBe('Research Vault');
      expect(metadata.description).toContain('research');
      expect(metadata.icon).toBe('🔬');
      expect(metadata.author).toBe('Flint Team');
      expect(metadata.version).toBe('1.0.0');
    });

    it('should load complete research template', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const template = await templateManager.loadTemplate('research');

      expect(template).toBeDefined();
      expect(template.metadata.id).toBe('research');
      expect(template.noteTypes.length).toBeGreaterThan(0);
      expect(template.notes.length).toBeGreaterThan(0);

      // Research template should have specialized note types
      const noteTypeNames = template.noteTypes.map((nt) => nt.name);
      expect(noteTypeNames).toContain('paper');
      expect(noteTypeNames).toContain('concept');
    });

    it('should have metadata schema for research note types', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const template = await templateManager.loadTemplate('research');

      // Paper note type should have metadata schema
      const paperType = template.noteTypes.find((nt) => nt.name === 'paper');
      expect(paperType).toBeDefined();
      expect(paperType?.metadata_schema).toBeDefined();
      expect(paperType?.metadata_schema?.fields).toBeDefined();
      expect(paperType?.metadata_schema?.fields.length).toBeGreaterThan(0);

      // Validate metadata fields structure
      const fields = paperType?.metadata_schema?.fields || [];
      for (const field of fields) {
        expect(field.name).toBeDefined();
        expect(field.type).toBeDefined();
        expect(typeof field.name).toBe('string');
        expect(typeof field.type).toBe('string');
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent template', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);

      await expect(
        templateManager.loadTemplateMetadata('non-existent-template')
      ).rejects.toThrow(/Failed to load template metadata/);
    });

    it('should handle empty templates directory gracefully', async () => {
      // Point to a non-existent directory
      // Note: With the new path resolution logic, it will fall back to finding
      // the actual templates directory if the specified one doesn't exist
      const templateManager = new TemplateManager('/tmp/non-existent-templates-dir');
      const templates = await templateManager.listTemplates();

      expect(templates).toBeDefined();
      // It should either return empty array (if no fallback found) or find the real templates
      expect(Array.isArray(templates)).toBe(true);
    });
  });

  describe('Template Validation', () => {
    it('should validate that all templates have required metadata', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const templates = await templateManager.listTemplates();

      for (const template of templates) {
        const fullTemplate = await templateManager.loadTemplate(template.id);

        // Metadata validation
        expect(fullTemplate.metadata.id).toBeDefined();
        expect(fullTemplate.metadata.name).toBeDefined();
        expect(fullTemplate.metadata.description).toBeDefined();

        // Note types validation
        expect(Array.isArray(fullTemplate.noteTypes)).toBe(true);
        for (const noteType of fullTemplate.noteTypes) {
          expect(noteType.name).toBeDefined();
          expect(noteType.purpose).toBeDefined();
          expect(Array.isArray(noteType.agent_instructions)).toBe(true);
        }

        // Notes validation
        expect(Array.isArray(fullTemplate.notes)).toBe(true);
        for (const note of fullTemplate.notes) {
          expect(note.filename).toBeDefined();
          expect(note.title).toBeDefined();
          expect(note.content).toBeDefined();
          expect(note.type).toBeDefined();
        }
      }
    });

    it('should extract titles from markdown content', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const template = await templateManager.loadTemplate('default');

      // Welcome note should have a title extracted from its first heading
      const welcomeNote = template.notes.find((n) => n.filename.includes('welcome'));
      expect(welcomeNote).toBeDefined();
      expect(welcomeNote?.title).toBe('Welcome to Flint!');
    });
  });

  describe('Template Consistency', () => {
    it('should have consistent structure across all templates', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const templates = await templateManager.listTemplates();

      expect(templates.length).toBeGreaterThan(0);

      for (const templateMeta of templates) {
        const template = await templateManager.loadTemplate(templateMeta.id);

        // All templates should have at least one note type
        expect(template.noteTypes.length).toBeGreaterThan(0);

        // All templates should have the 'note' base type
        const hasNoteType = template.noteTypes.some((nt) => nt.name === 'note');
        expect(hasNoteType).toBe(true);

        // All templates should have at least one starter note
        expect(template.notes.length).toBeGreaterThan(0);
      }
    });

    it('should have unique note type names within each template', async () => {
      const templateManager = new TemplateManager(TEMPLATES_DIR);
      const templates = await templateManager.listTemplates();

      for (const templateMeta of templates) {
        const template = await templateManager.loadTemplate(templateMeta.id);

        const noteTypeNames = template.noteTypes.map((nt) => nt.name);
        const uniqueNames = new Set(noteTypeNames);

        expect(noteTypeNames.length).toBe(uniqueNames.size);
      }
    });
  });
});
