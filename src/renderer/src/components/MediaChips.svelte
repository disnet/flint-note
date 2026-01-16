<script lang="ts">
  /**
   * Wrapper component for media note chips (EPUB, PDF, Webpage)
   * Handles media-specific property definitions and computed values,
   * while delegating to EditorChips for actual rendering.
   */
  import type { NoteMetadata, SourceFormat } from '../lib/automerge';
  import {
    getNoteType,
    setNoteProp,
    setActiveNoteId,
    addNoteToWorkspace
  } from '../lib/automerge';
  import { getMediaProperties, getMediaDefaultChips } from '../lib/media-properties';
  import EditorChips from './EditorChips.svelte';

  interface Props {
    note: NoteMetadata;
    sourceFormat: SourceFormat;
    /** Computed values from viewer state (progress, highlights count, pages, etc.) */
    computedValues?: Record<string, unknown>;
    /** Handler for navigating to linked notes */
    onNoteClick?: (noteId: string) => void;
    /** Handler for opening external links (for webpage source) */
    onOpenExternal?: (url: string) => void;
  }

  let {
    note,
    sourceFormat,
    computedValues = {},
    onNoteClick,
    onOpenExternal
  }: Props = $props();

  // Get the note type (user-configured type, not media format)
  const noteType = $derived(getNoteType(note.type));

  // Get media-specific property definitions
  const mediaProperties = $derived(getMediaProperties(sourceFormat));

  // Determine which chips to display:
  // 1. If noteType.editorChips is defined and non-empty, use that
  // 2. Otherwise, use media-specific defaults
  const effectiveEditorChips = $derived.by(() => {
    if (noteType?.editorChips?.length) {
      return noteType.editorChips;
    }
    return getMediaDefaultChips(sourceFormat);
  });

  // Create effective note type with overridden editorChips
  // Avoid spreading Automerge objects - create a plain object with only needed properties
  const effectiveNoteType = $derived.by(() => {
    if (!noteType) {
      // No note type defined, create a minimal one with media defaults
      return {
        id: 'type-media',
        name: 'Media',
        purpose: '',
        icon: '',
        archived: false,
        created: '',
        editorChips: effectiveEditorChips,
        properties: []
      };
    }
    // Create a plain object to avoid Automerge proxy issues
    return {
      id: noteType.id,
      name: noteType.name,
      purpose: noteType.purpose,
      icon: noteType.icon,
      archived: noteType.archived,
      created: noteType.created,
      editorChips: effectiveEditorChips,
      properties: noteType.properties,
      agentInstructions: noteType.agentInstructions
    };
  });

  // Handle property changes (for editable fields)
  function handlePropChange(propName: string, value: unknown): void {
    setNoteProp(note.id, propName, value);
  }

  // Handle note click navigation
  function handleNoteClick(noteId: string): void {
    if (onNoteClick) {
      onNoteClick(noteId);
    } else {
      setActiveNoteId(noteId);
      addNoteToWorkspace(noteId);
    }
  }
</script>

<div class="media-chips-wrapper">
  <EditorChips
    {note}
    noteType={effectiveNoteType}
    onPropChange={handlePropChange}
    onNoteClick={handleNoteClick}
    {computedValues}
    additionalProperties={mediaProperties}
  />
  {#if sourceFormat === 'webpage' && computedValues.source}
    <button
      class="chip chip-link"
      onclick={() => onOpenExternal?.(String(computedValues.source))}
      type="button"
    >
      <span class="chip-label">source</span>
      <span class="chip-divider"></span>
      <span class="chip-value link-icon">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </span>
    </button>
  {/if}
</div>

<style>
  .media-chips-wrapper {
    display: contents;
  }

  .chip {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--border-light);
    border-radius: 9999px;
    background: var(--bg-secondary);
    font-size: 0.7rem;
    white-space: nowrap;
    overflow: hidden;
    cursor: pointer;
  }

  .chip:hover {
    background: var(--bg-tertiary);
  }

  .chip-label {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.5rem 0.125rem 0.625rem;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    border-radius: 9999px 0 0 9999px;
  }

  .chip-divider {
    width: 1px;
    background: var(--border-light);
  }

  .chip-value {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.625rem 0.125rem 0.5rem;
    color: var(--text-secondary);
  }

  .link-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
