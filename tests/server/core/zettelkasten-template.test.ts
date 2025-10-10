/**
 * Tests for Zettelkasten template
 * Verifies that example notes are created with proper note types
 */

import { describe, it, expect } from 'vitest';
import { TemplateManager } from '../../../src/server/core/template-manager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES_DIR = path.join(__dirname, '../../../src/server/templates');

describe('Zettelkasten Template', () => {
  it('should load zettelkasten template with all note types', async () => {
    const templateManager = new TemplateManager(TEMPLATES_DIR);
    const template = await templateManager.loadTemplate('zettelkasten');

    expect(template).toBeDefined();
    expect(template.metadata.id).toBe('zettelkasten');

    // Should have all expected note types
    const noteTypeNames = template.noteTypes.map((nt) => nt.name);
    expect(noteTypeNames).toContain('fleeting');
    expect(noteTypeNames).toContain('literature');
    expect(noteTypeNames).toContain('permanent');
    expect(noteTypeNames).toContain('index');
    expect(noteTypeNames).toContain('note');
  });

  it('should create example notes with proper note types from directory structure', async () => {
    const templateManager = new TemplateManager(TEMPLATES_DIR);
    const template = await templateManager.loadTemplate('zettelkasten');

    // Find example notes - they should be in type-specific directories
    const fleetingExample = template.notes.find((n) =>
      n.filename.includes('fleeting-note-example')
    );
    const literatureExample = template.notes.find((n) =>
      n.filename.includes('literature-note-example')
    );
    const permanentExamples = template.notes.filter((n) =>
      n.filename.includes('permanent-note-')
    );
    const indexExample = template.notes.find((n) =>
      n.filename.includes('index-note-behavior-change')
    );

    // Verify example notes exist and have correct types derived from directory
    expect(fleetingExample).toBeDefined();
    expect(fleetingExample?.type).toBe('fleeting');
    expect(fleetingExample?.filename).toContain('fleeting/');

    expect(literatureExample).toBeDefined();
    expect(literatureExample?.type).toBe('literature');
    expect(literatureExample?.filename).toContain('literature/');

    expect(permanentExamples.length).toBeGreaterThan(0);
    permanentExamples.forEach((note) => {
      expect(note.type).toBe('permanent');
      expect(note.filename).toContain('permanent/');
    });

    expect(indexExample).toBeDefined();
    expect(indexExample?.type).toBe('index');
    expect(indexExample?.filename).toContain('index/');
  });

  it('should create guide notes with proper types from directory structure', async () => {
    const templateManager = new TemplateManager(TEMPLATES_DIR);
    const template = await templateManager.loadTemplate('zettelkasten');

    // Find guide notes
    const guideNote = template.notes.find((n) =>
      n.filename.includes('zettelkasten-guide')
    );
    const workflowNote = template.notes.find((n) =>
      n.filename.includes('zettelkasten-workflow')
    );
    const atomicNote = template.notes.find((n) =>
      n.filename.includes('atomic-notes-principle')
    );
    const linkingNote = template.notes.find((n) =>
      n.filename.includes('effective-linking')
    );

    // Verify guide notes have correct types derived from directory
    expect(guideNote).toBeDefined();
    expect(guideNote?.type).toBe('index');
    expect(guideNote?.filename).toContain('index/');

    expect(workflowNote).toBeDefined();
    expect(workflowNote?.type).toBe('permanent');
    expect(workflowNote?.filename).toContain('permanent/');

    expect(atomicNote).toBeDefined();
    expect(atomicNote?.type).toBe('permanent');
    expect(atomicNote?.filename).toContain('permanent/');

    expect(linkingNote).toBeDefined();
    expect(linkingNote?.type).toBe('permanent');
    expect(linkingNote?.filename).toContain('permanent/');
  });

  it('should load notes from type-specific subdirectories', async () => {
    const templateManager = new TemplateManager(TEMPLATES_DIR);
    const template = await templateManager.loadTemplate('zettelkasten');

    // Should have notes from type-specific subdirectories
    const fleetingNotes = template.notes.filter((n) =>
      n.filename.startsWith('fleeting/')
    );
    const literatureNotes = template.notes.filter((n) =>
      n.filename.startsWith('literature/')
    );
    const permanentNotes = template.notes.filter((n) =>
      n.filename.startsWith('permanent/')
    );
    const indexNotes = template.notes.filter((n) => n.filename.startsWith('index/'));

    expect(fleetingNotes.length).toBeGreaterThan(0);
    expect(literatureNotes.length).toBeGreaterThan(0);
    expect(permanentNotes.length).toBeGreaterThan(0);
    expect(indexNotes.length).toBeGreaterThan(0);

    // Verify all notes have the correct type based on their directory
    fleetingNotes.forEach((n) => expect(n.type).toBe('fleeting'));
    literatureNotes.forEach((n) => expect(n.type).toBe('literature'));
    permanentNotes.forEach((n) => expect(n.type).toBe('permanent'));
    indexNotes.forEach((n) => expect(n.type).toBe('index'));
  });
});
