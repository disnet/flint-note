<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';
  import { messageBus } from '../services/messageBus.svelte';
  import type { NoteDocument } from '../stores/noteDocumentRegistry.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';

  interface Props {
    doc: NoteDocument;
    isExpanded: boolean;
    onDisclosureToggle: () => void;
    onRemove: () => void;
    onTitleFocus: (currentTitle: string) => void;
    onTitleBlur: (newTitle: string) => Promise<void>;
    onTitleKeyDown: (event: KeyboardEvent) => void;
    onContentChange: (content: string) => void;
    onWikilinkClick: (
      noteId: string,
      title: string,
      shouldCreate?: boolean
    ) => Promise<void>;
  }

  let {
    doc,
    isExpanded,
    onDisclosureToggle,
    onRemove,
    onTitleFocus,
    onTitleBlur,
    onTitleKeyDown,
    onContentChange,
    onWikilinkClick
  }: Props = $props();

  let editorRef = $state<CodeMirrorEditor | undefined>(undefined);

  // Watch for changes in notes store and refresh wikilinks
  // This is the same pattern as NoteEditor.svelte lines 94-109
  $effect(() => {
    // Access the notes store to create a dependency
    const notes = notesStore.notes;
    const loading = notesStore.loading;

    // Only refresh if we have an editor, notes are loaded, and we're not currently loading
    if (editorRef && !loading && notes.length >= 0) {
      // Small delay to ensure the store update is complete
      setTimeout(() => {
        if (editorRef) {
          editorRef.refreshWikilinks();
        }
      }, 50);
    }
  });

  // Watch for wikilink updates and reload note content if needed
  // This is the same pattern as NoteEditor.svelte lines 111-130
  $effect(() => {
    const unsubscribe = messageBus.subscribe('note.linksChanged', () => {
      if (doc) {
        const currentDoc = doc; // Capture in closure to avoid null issues
        setTimeout(async () => {
          try {
            await currentDoc.reload();
          } catch (loadError) {
            console.warn(
              'Failed to reload note content after wikilink update:',
              loadError
            );
          }
        }, 100);
      }
    });

    return () => unsubscribe();
  });
</script>

<div class="sidebar-note">
  <div class="note-header">
    <button
      class="disclosure-button"
      onclick={onDisclosureToggle}
      aria-label={isExpanded ? 'Collapse' : 'Expand'}
    >
      <svg
        class="disclosure-icon"
        class:expanded={isExpanded}
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>

    <input
      type="text"
      class="title-input"
      value={doc.title || ''}
      onfocus={(e) => onTitleFocus(e.currentTarget.value)}
      onblur={(e) => onTitleBlur(e.currentTarget.value)}
      onkeydown={onTitleKeyDown}
      placeholder="Untitled"
    />

    <button
      class="remove-button"
      onclick={onRemove}
      aria-label="Remove note"
      title="Remove from sidebar"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  </div>

  {#if isExpanded}
    <div class="note-content">
      <CodeMirrorEditor
        bind:this={editorRef}
        content={doc.content}
        {onContentChange}
        {onWikilinkClick}
        placeholder="Note content..."
        variant="sidebar-note"
      />
    </div>
  {/if}
</div>

<style>
  .sidebar-note {
    margin-bottom: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
  }

  .note-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .disclosure-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
  }

  .disclosure-button:hover {
    color: var(--text-primary);
  }

  .disclosure-icon {
    transition: transform 0.2s ease;
  }

  .disclosure-icon.expanded {
    transform: rotate(90deg);
  }

  .title-input {
    flex: 1;
    padding: 0.25rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .title-input:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-light);
  }

  .title-input:focus {
    outline: none;
    background: var(--bg-primary);
    border-color: var(--accent-primary);
  }

  .title-input::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
  }

  .remove-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .remove-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .note-content {
    border-top: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
  }

  .note-content :global(.editor-content) {
    min-height: 0;
  }
</style>
