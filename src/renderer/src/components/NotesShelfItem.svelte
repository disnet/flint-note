<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';
  import { messageBus } from '../services/messageBus.svelte';
  import { wikilinkService } from '../services/wikilinkService.svelte';
  import type { NoteDocument } from '../stores/noteDocumentRegistry.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import DeckWidget from '../lib/deck/DeckWidget.svelte';
  import PdfShelfView from '../lib/views/pdf/PdfShelfView.svelte';
  import EpubShelfView from '../lib/views/epub/EpubShelfView.svelte';
  import TypeShelfView from '../lib/views/type/TypeShelfView.svelte';
  import type { DeckConfig } from '../lib/deck/types';
  import {
    parseDeckYaml,
    serializeDeckConfig,
    createEmptyDeckConfig
  } from '../lib/deck/yaml-utils';

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

  // Check if note is archived - reactively look up from store
  const isArchived = $derived.by(() => {
    const note = notesStore.allNotes.find((n) => n.id === doc.noteId);
    return note?.archived === true;
  });

  // Check if note is a deck
  const isDeck = $derived.by(() => {
    const note = notesStore.allNotes.find((n) => n.id === doc.noteId);
    return note?.flint_kind === 'deck';
  });

  // Check if note is a PDF
  const isPdf = $derived.by(() => {
    const note = notesStore.allNotes.find((n) => n.id === doc.noteId);
    return note?.flint_kind === 'pdf';
  });

  // Check if note is an EPUB
  const isEpub = $derived.by(() => {
    const note = notesStore.allNotes.find((n) => n.id === doc.noteId);
    return note?.flint_kind === 'epub';
  });

  // Check if note is a Type
  const isType = $derived.by(() => {
    const note = notesStore.allNotes.find((n) => n.id === doc.noteId);
    return note?.flint_kind === 'type';
  });

  // Parse deck config from content (only used for deck notes)
  const deckConfig = $derived.by((): DeckConfig => {
    if (!isDeck || !doc.content) return createEmptyDeckConfig();
    const parsed = parseDeckYaml(doc.content);
    return parsed || createEmptyDeckConfig();
  });

  // Handle deck config changes
  function handleDeckConfigChange(newConfig: DeckConfig): void {
    const yamlContent = serializeDeckConfig(newConfig);
    onContentChange(yamlContent);
  }

  // Handle note open from DeckWidget
  function handleDeckNoteOpen(noteId: string): void {
    wikilinkService.handleWikilinkClick(noteId, '', false, false);
  }

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
      // Check for special note kinds first
      if (note.flint_kind === 'pdf') {
        return { type: 'svg', value: 'pdf' };
      }
      if (note.flint_kind === 'epub') {
        return { type: 'svg', value: 'epub' };
      }
      // Then check note type icon
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
      case 'pdf':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
          <text x="6" y="17" font-size="6" fill="currentColor" font-weight="bold">PDF</text>
        </svg>`;
      case 'epub':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          <line x1="8" y1="7" x2="16" y2="7"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>`;
      default:
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
        </svg>`;
    }
  }
</script>

<div class="shelf-note" class:archived={isArchived}>
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
      readonly={isArchived}
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
      {#if isDeck}
        <div class="deck-content">
          <DeckWidget
            config={deckConfig}
            onConfigChange={handleDeckConfigChange}
            onNoteOpen={handleDeckNoteOpen}
          />
        </div>
      {:else if isPdf}
        <div class="reader-content">
          <PdfShelfView noteId={doc.noteId} content={doc.content} {onContentChange} />
        </div>
      {:else if isEpub}
        <div class="reader-content">
          <EpubShelfView noteId={doc.noteId} content={doc.content} {onContentChange} />
        </div>
      {:else if isType}
        <div class="type-content">
          <TypeShelfView content={doc.content} />
        </div>
      {:else}
        <CodeMirrorEditor
          bind:this={editorRef}
          content={doc.content}
          {onContentChange}
          {onWikilinkClick}
          placeholder="Note content..."
          variant="shelf-note"
          readOnly={isArchived}
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .shelf-note {
    margin-bottom: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
  }

  .shelf-note.archived {
    opacity: 0.6;
  }

  .shelf-note.archived .title-input {
    font-style: italic;
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
    color: var(--text-muted);
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

  .deck-content {
    padding: 0.5rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .reader-content {
    max-height: 400px;
    overflow: hidden;
  }

  .type-content {
    max-height: 400px;
    overflow: hidden;
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
