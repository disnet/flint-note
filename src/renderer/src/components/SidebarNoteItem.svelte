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

  function getNoteIcon(): { type: 'emoji' | 'svg'; value: string } {
    const note = notesStore.notes.find((n) => n.id === doc.noteId);
    if (note) {
      const noteType = notesStore.noteTypes.find((t) => t.name === note.type);
      if (noteType?.icon) {
        return { type: 'emoji', value: noteType.icon };
      }
    }
    return { type: 'svg', value: 'document' };
  }

  function getIconSvg(iconType: string): string {
    switch (iconType) {
      case 'calendar':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>`;
      case 'folder':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"></path>
        </svg>`;
      default:
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
        </svg>`;
    }
  }
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

    <div class="note-icon">
      {#if getNoteIcon().type === 'emoji'}
        <span class="emoji-icon">{getNoteIcon().value}</span>
      {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html getIconSvg(getNoteIcon().value)}
      {/if}
    </div>

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
      title="Remove from shelf"
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
    position: sticky;
    top: -0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-secondary);
    z-index: 1;
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

  .note-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--text-secondary);
  }

  .note-icon .emoji-icon {
    font-size: 0.9rem;
    line-height: 1;
  }

  .note-icon :global(svg) {
    width: 14px;
    height: 14px;
  }
</style>
