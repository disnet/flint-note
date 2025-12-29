<script lang="ts">
  import type { NoteMetadata } from '../lib/automerge';
  import { updateNoteContent, getNoteContent } from '../lib/automerge';
  import type { DeckConfig } from '../lib/automerge/deck';
  import {
    parseDeckYamlWithWarnings,
    serializeDeckConfig,
    createEmptyDeckConfig
  } from '../../../shared/deck-yaml-utils';
  import type { DeckValidationWarning } from '../../../shared/deck-yaml-utils';
  import DeckWidget from './DeckWidget.svelte';
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';
  import { tick, onMount } from 'svelte';

  interface Props {
    note: NoteMetadata;
    onNoteOpen?: (noteId: string) => void;
    onTitleChange?: (title: string) => void;
    onUnarchive?: () => void;
  }

  let { note, onNoteOpen, onTitleChange, onUnarchive }: Props = $props();

  // Archived notes are read-only
  const isReadonly = $derived(note.archived);

  // UI state
  let titleTextarea: HTMLTextAreaElement | null = $state(null);
  let noteContent = $state<string>('');

  // Load content on mount and when note changes
  async function loadContent(): Promise<void> {
    const content = await getNoteContent(note.id);
    noteContent = content;
  }

  onMount(() => {
    loadContent();
  });

  // Reload when note id changes
  $effect(() => {
    void note.id;
    loadContent();
  });

  // Extract deck config from note content
  const parsedResult = $derived.by(() => {
    const content = noteContent || '';

    // Look for flint-deck code block
    const deckBlockMatch = content.match(/```flint-deck\n([\s\S]*?)```/);
    if (!deckBlockMatch) {
      return {
        config: createEmptyDeckConfig(),
        warnings: [] as DeckValidationWarning[],
        hasBlock: false
      };
    }

    const yamlContent = deckBlockMatch[1];
    const result = parseDeckYamlWithWarnings(yamlContent);

    if (!result) {
      return {
        config: createEmptyDeckConfig(),
        warnings: [] as DeckValidationWarning[],
        hasBlock: true
      };
    }

    return {
      config: result.config,
      warnings: result.warnings,
      hasBlock: true
    };
  });

  const deckConfig = $derived(parsedResult.config);
  const validationWarnings = $derived(parsedResult.warnings);

  /**
   * Update the note content with new deck config
   */
  function handleConfigChange(newConfig: DeckConfig): void {
    const content = noteContent || '';
    const yamlStr = serializeDeckConfig(newConfig);
    const newBlock = '```flint-deck\n' + yamlStr + '```';

    let newContent: string;
    if (content.includes('```flint-deck')) {
      // Replace existing block
      newContent = content.replace(/```flint-deck\n[\s\S]*?```/, newBlock);
    } else {
      // Add block at beginning (or just the block if empty)
      newContent = content.trim() ? newBlock + '\n\n' + content.trim() : newBlock;
    }

    noteContent = newContent;
    updateNoteContent(note.id, newContent);
  }

  // Title handling
  function handleTitleInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    onTitleChange?.(target.value);
    adjustTitleHeight();
  }

  function handleTitleKeyDown(event: KeyboardEvent): void {
    // Prevent newlines in title
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  }

  function adjustTitleHeight(): void {
    if (!titleTextarea) return;
    titleTextarea.style.height = 'auto';
    titleTextarea.style.height = titleTextarea.scrollHeight + 'px';
  }

  // Adjust title height when note changes
  $effect(() => {
    void note.title;
    tick().then(() => {
      adjustTitleHeight();
    });
  });
</script>

<div class="deck-viewer">
  <!-- Archived Banner -->
  {#if note.archived}
    <div class="archived-banner">
      <span class="archived-text">This note is archived</span>
      <button class="unarchive-button" onclick={() => onUnarchive?.()}>
        Unarchive
      </button>
    </div>
  {/if}

  <!-- Header -->
  <header class="deck-header">
    <div class="header-row">
      <div class="title-area">
        <NoteTypeDropdown
          noteId={note.id}
          currentTypeId={note.type}
          compact
          disabled={isReadonly}
        />
        {#if isReadonly}
          <div class="title-display">{note.title || 'Untitled Deck'}</div>
        {:else}
          <textarea
            bind:this={titleTextarea}
            class="title-input"
            value={note.title}
            oninput={handleTitleInput}
            onkeydown={handleTitleKeyDown}
            placeholder="Untitled Deck"
            rows="1"
          ></textarea>
        {/if}
      </div>
    </div>
  </header>

  <!-- Deck Widget -->
  <div class="deck-content">
    <DeckWidget
      config={deckConfig}
      onConfigChange={handleConfigChange}
      {onNoteOpen}
      {validationWarnings}
    />
  </div>
</div>

<style>
  .deck-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* Archived Banner */
  .archived-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    margin: 0 1.5rem 0.75rem;
    background: var(--bg-warning, #fef3c7);
    border-radius: 6px;
    border: 1px solid var(--border-warning, #fcd34d);
  }

  :global(.dark) .archived-banner {
    background: rgba(251, 191, 36, 0.15);
    border-color: rgba(251, 191, 36, 0.3);
  }

  .archived-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-warning, #92400e);
  }

  :global(.dark) .archived-text {
    color: #fbbf24;
  }

  .unarchive-button {
    padding: 0.25rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-warning, #92400e);
    background: transparent;
    border: 1px solid var(--border-warning, #fcd34d);
    border-radius: 4px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .unarchive-button:hover {
    background: var(--bg-warning-hover, #fde68a);
  }

  :global(.dark) .unarchive-button {
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.4);
  }

  :global(.dark) .unarchive-button:hover {
    background: rgba(251, 191, 36, 0.25);
  }

  .deck-header {
    display: flex;
    flex-direction: column;
    padding: 0 1.5rem;
    flex-shrink: 0;
  }

  .header-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .title-area {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .title-area :global(.note-type-dropdown.compact) {
    position: absolute;
    top: 0.4em;
    left: 0;
    z-index: 1;
  }

  .title-area :global(.note-type-dropdown.compact .type-button) {
    padding: 0.1em 0.25rem;
  }

  .title-area :global(.note-type-dropdown.compact .type-icon) {
    font-size: 1.5rem;
  }

  .title-input {
    width: 100%;
    border: none;
    background: transparent;
    font-size: 1.5rem;
    font-weight: 800;
    font-family: var(--font-editor);
    color: var(--text-primary);
    outline: none;
    padding: 0.1em 0;
    min-width: 0;
    resize: none;
    overflow: hidden;
    overflow-wrap: break-word;
    word-wrap: break-word;
    line-height: 1.4;
    min-height: 1.4em;
    text-indent: 2.3rem;
  }

  .title-input::placeholder {
    color: var(--text-muted);
    opacity: 0.5;
  }

  .title-display {
    width: 100%;
    font-size: 1.5rem;
    font-weight: 800;
    font-family: var(--font-editor);
    color: var(--text-primary);
    padding: 0.1em 0;
    line-height: 1.4;
    min-height: 1.4em;
    padding-left: 2.3rem;
    overflow-wrap: break-word;
    word-wrap: break-word;
  }

  .deck-content {
    flex: 1;
    padding: 0 1.5rem 1rem;
    overflow-y: auto;
    min-height: 0;
  }
</style>
