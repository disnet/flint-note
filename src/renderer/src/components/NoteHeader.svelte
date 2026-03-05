<script lang="ts">
  /**
   * Shared note header component with title and type dropdown
   * Used across all note viewers (markdown, PDF, EPUB, webpage)
   */
  import { tick, type Snippet } from 'svelte';
  import type { NoteMetadata } from '../lib/automerge';
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';

  interface Props {
    note: NoteMetadata;
    readonly?: boolean;
    onTitleChange?: (title: string) => void;
    onEnterKey?: () => void;
    chips?: Snippet;
  }

  let { note, readonly = false, onTitleChange, onEnterKey, chips }: Props = $props();

  let titleTextarea: HTMLTextAreaElement | null = $state(null);

  function handleTitleInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    onTitleChange?.(target.value);
    adjustTitleHeight();
  }

  function handleTitleKeyDown(event: KeyboardEvent): void {
    // Prevent newlines in title
    if (event.key === 'Enter') {
      event.preventDefault();
      onEnterKey?.();
    }
  }

  function adjustTitleHeight(): void {
    if (!titleTextarea) return;
    titleTextarea.style.height = 'auto';
    titleTextarea.style.height = titleTextarea.scrollHeight + 'px';
  }

  // Adjust title height when note changes or on mount
  $effect(() => {
    void note.title;
    tick().then(() => {
      adjustTitleHeight();
    });
  });

  // Watch for container resize
  $effect(() => {
    if (!titleTextarea) return;

    const resizeObserver = new ResizeObserver(() => {
      adjustTitleHeight();
    });
    resizeObserver.observe(titleTextarea);

    return () => {
      resizeObserver.disconnect();
    };
  });

  // Public API
  export function focus(): void {
    titleTextarea?.focus();
  }
</script>

<div class="note-header">
  <div class="header-row">
    <div class="title-area">
      <NoteTypeDropdown
        noteId={note.id}
        currentTypeId={note.type}
        compact
        disabled={readonly}
      />
      {#if readonly}
        <div class="title-display">{note.title || 'Untitled'}</div>
      {:else}
        <textarea
          bind:this={titleTextarea}
          class="title-input"
          value={note.title}
          oninput={handleTitleInput}
          onkeydown={handleTitleKeyDown}
          placeholder="Untitled"
          rows="1"
        ></textarea>
      {/if}
    </div>
  </div>
  <!-- Property chips -->
  {#if chips}
    {@render chips()}
  {/if}
</div>

<style>
  .note-header {
    display: flex;
    flex-direction: column;
    padding: 0;
    flex-shrink: 0;
  }

  .header-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  /* Title area with type icon positioned absolutely */
  .title-area {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  /* Position type dropdown absolutely in the first line indent space */
  .title-area :global(.note-type-dropdown.compact) {
    position: absolute;
    top: 0.4em;
    left: 0;
    z-index: 1;
  }

  /* On mobile, adjust icon position */
  @media (max-width: 767px) {
    .title-area :global(.note-type-dropdown.compact) {
      top: 0;
    }
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
    text-indent: 2.3rem; /* Space for the type icon */
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
    padding-left: 2.3rem; /* Space for the type icon */
    overflow-wrap: break-word;
    word-wrap: break-word;
  }
</style>
