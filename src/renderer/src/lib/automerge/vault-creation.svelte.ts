/**
 * Vault creation with templates and onboarding content
 */

import {
  createVault as createVaultBase,
  initializeState,
  createWorkspace,
  createNoteType,
  createNote,
  connectVaultSync,
  pinItem
} from './state.svelte';
import { getRepo } from './repo';
import type { Vault } from './types';
import {
  VAULT_TEMPLATES,
  ONBOARDING_OPTIONS,
  getTemplate,
  getOnboardingOption
} from './vault-templates';

// Re-export for convenience
export { VAULT_TEMPLATES, ONBOARDING_OPTIONS };
export type {
  VaultTemplate,
  OnboardingOption,
  OnboardingNote,
  WorkspaceTemplate,
  NoteTypeTemplate,
  TemplateNote
} from './vault-templates';

export interface VaultCreationOptions {
  /** Template ID to apply ('empty', 'personal-kb', 'project-notes') */
  templateId: string;
  /** Onboarding option IDs to include (['welcome', 'tutorials', 'quick-reference']) */
  onboardingIds: string[];
}

/**
 * Replace {{type:Name}} placeholders with [[type-id|Name]] wikilinks
 */
function replaceTypePlaceholders(
  content: string,
  noteTypeNameToId: Record<string, string>
): string {
  // Match {{type:TypeName}} pattern
  return content.replace(/\{\{type:([^}]+)\}\}/g, (_match, typeName) => {
    const typeId = noteTypeNameToId[typeName];
    if (typeId) {
      // Return wikilink format: [[type-id|DisplayName]]
      return `[[${typeId}|${typeName}]]`;
    }
    // If type not found, leave as plain text
    return typeName;
  });
}

/**
 * Apply a template to the current vault.
 * Must be called after vault creation and state initialization.
 */
export async function applyVaultTemplate(templateId: string): Promise<void> {
  const template = getTemplate(templateId);
  if (!template || template.id === 'empty') {
    return;
  }

  // Create additional workspaces
  for (const ws of template.workspaces) {
    createWorkspace({ name: ws.name, icon: ws.icon });
  }

  // Create additional note types and track name -> id mapping
  const noteTypeNameToId: Record<string, string> = {};
  for (const nt of template.noteTypes) {
    const id = createNoteType({
      name: nt.name,
      purpose: nt.purpose,
      icon: nt.icon,
      properties: nt.properties
    });
    noteTypeNameToId[nt.name] = id;
  }

  // Create sample notes with their correct types and props
  for (const note of template.notes) {
    const typeId = note.typeName ? noteTypeNameToId[note.typeName] : undefined;
    // Replace type placeholders in content with actual wikilinks
    const processedContent = replaceTypePlaceholders(note.content, noteTypeNameToId);
    const noteId = await createNote({
      title: note.title,
      content: processedContent,
      type: typeId,
      props: note.props
    });

    // Pin the note if marked as pinned
    if (note.pinned) {
      pinItem({ type: 'note', id: noteId });
    }
  }
}

/**
 * Create onboarding notes in the current vault.
 * Must be called after vault creation and state initialization.
 * Notes with duplicate titles are skipped to avoid duplicates when
 * multiple onboarding options include the same note.
 */
export async function applyOnboardingContent(onboardingIds: string[]): Promise<void> {
  const createdTitles: Record<string, boolean> = {};

  for (const optionId of onboardingIds) {
    const option = getOnboardingOption(optionId);
    if (!option) continue;

    for (const note of option.notes) {
      // Skip if we already created a note with this title
      if (createdTitles[note.title]) {
        continue;
      }

      const noteId = await createNote({
        title: note.title,
        content: note.content
      });
      createdTitles[note.title] = true;

      // Pin the note if marked as pinned
      if (note.pinned) {
        pinItem({ type: 'note', id: noteId });
      }
    }
  }
}

/**
 * Create a vault with template and onboarding options.
 * This is a higher-level function that orchestrates vault creation.
 */
export async function createVaultWithOptions(
  name: string,
  baseDirectory: string | undefined,
  options: VaultCreationOptions
): Promise<Vault> {
  // Create the vault (creates the Automerge document)
  const vault = createVaultBase(name, baseDirectory);

  // Initialize state with the new vault (pass vault.id to ensure we load the correct vault)
  await initializeState(vault.id);

  // Connect file sync if a directory was selected
  if (baseDirectory) {
    const repo = getRepo();
    await connectVaultSync(repo, vault);
  }

  // Apply template (creates workspaces, note types, and sample notes)
  await applyVaultTemplate(options.templateId);

  // Apply onboarding content (creates notes)
  await applyOnboardingContent(options.onboardingIds);

  return vault;
}
