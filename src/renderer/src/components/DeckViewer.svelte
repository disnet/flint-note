<script lang="ts">
  import type { Note } from '../lib/automerge';
  import { updateNote } from '../lib/automerge';
  import type { DeckConfig } from '../lib/automerge/deck';
  import {
    parseDeckYamlWithWarnings,
    serializeDeckConfig,
    createEmptyDeckConfig
  } from '../../../shared/deck-yaml-utils';
  import type { DeckValidationWarning } from '../../../shared/deck-yaml-utils';
  import DeckWidget from './DeckWidget.svelte';
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';
  import { tick } from 'svelte';

  interface Props {
    note: Note;
    onNoteOpen?: (noteId: string) => void;
    onTitleChange?: (title: string) => void;
  }

  let { note, onNoteOpen, onTitleChange }: Props = $props();

  // UI state
  let titleTextarea: HTMLTextAreaElement | null = $state(null);

  // Extract deck config from note content
  const parsedResult = $derived.by(() => {
    const content = note.content || '';

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
    const content = note.content || '';
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

    updateNote(note.id, { content: newContent });
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
  <!-- Header -->
  <header class="deck-header">
    <div class="header-row">
      <div class="title-area">
        <NoteTypeDropdown noteId={note.id} currentTypeId={note.type} compact />
        <textarea
          bind:this={titleTextarea}
          class="title-input"
          value={note.title}
          oninput={handleTitleInput}
          onkeydown={handleTitleKeyDown}
          placeholder="Untitled Deck"
          rows="1"
        ></textarea>
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
    font-family:
      'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
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

  .deck-content {
    flex: 1;
    padding: 0 1.5rem 1rem;
    overflow-y: auto;
    min-height: 0;
  }
</style>
