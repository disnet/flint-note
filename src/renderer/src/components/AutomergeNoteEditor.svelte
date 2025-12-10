<script lang="ts">
  /**
   * Note editor component using Automerge for data storage with CodeMirror editor
   */
  import { onMount } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import type { Note } from '../lib/automerge';
  import {
    getBacklinks,
    getAllNotes,
    createNote,
    setActiveNoteId,
    addNoteToWorkspace,
    AutomergeEditorConfig,
    forceWikilinkRefresh
  } from '../lib/automerge';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';

  interface Props {
    note: Note;
    onTitleChange: (title: string) => void;
    onContentChange: (content: string) => void;
    onArchive: () => void;
    onNavigate?: (noteId: string) => void;
  }

  let { note, onTitleChange, onContentChange, onArchive, onNavigate }: Props = $props();

  let editorContainer: HTMLElement | null = $state(null);
  let editorView: EditorView | null = null;

  // Debounce content changes
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  // Editor config
  const editorConfig = new AutomergeEditorConfig({
    onWikilinkClick: handleWikilinkClick,
    onContentChange: handleEditorContentChange,
    placeholder: 'Start writing...'
  });

  function handleTitleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    onTitleChange(target.value);
  }

  function handleEditorContentChange(content: string): void {
    // Debounce content updates
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      onContentChange(content);
    }, 300);
  }

  function handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean
  ): void {
    if (shouldCreate) {
      // Create a new note with the given title
      const newId = createNote({ title });
      addNoteToWorkspace(newId);
      setActiveNoteId(newId);
      onNavigate?.(newId);
    } else {
      // Navigate to existing note
      setActiveNoteId(noteId);
      onNavigate?.(noteId);
    }
  }

  // Get backlinks for this note
  const backlinks = $derived(getBacklinks(note.id));

  // Format date
  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Handle keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent): void {
    // Save on Cmd/Ctrl+S (no-op since autosave, but prevent browser save dialog)
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
    }
  }

  // Create the editor
  function createEditor(): void {
    if (!editorContainer || editorView) return;

    const startState = EditorState.create({
      doc: note.content,
      extensions: editorConfig.getExtensions()
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    });

    measureAndUpdateMarkerWidths();
  }

  function measureAndUpdateMarkerWidths(): void {
    if (!editorView) return;

    setTimeout(() => {
      if (editorView) {
        const widths = measureMarkerWidths(editorView.dom);
        updateCSSCustomProperties(widths);
      }
    }, 10);
  }

  // Update editor content when note changes
  function updateEditorContent(): void {
    if (editorView && note.content !== undefined) {
      const currentDoc = editorView.state.doc.toString();
      if (currentDoc !== note.content) {
        editorView.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: note.content
          }
        });
      }
    }
  }

  onMount(() => {
    editorConfig.initializeTheme();
    return () => {
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }
      editorConfig.destroy();
    };
  });

  // Create editor when container is available
  $effect(() => {
    if (editorContainer && !editorView) {
      createEditor();
    }
  });

  // Reconfigure editor when theme changes
  $effect(() => {
    // Track isDarkMode to trigger on theme change
    void editorConfig.isDarkMode;
    if (editorView) {
      editorView.dispatch({
        effects: StateEffect.reconfigure.of(editorConfig.getExtensions())
      });
      measureAndUpdateMarkerWidths();
    }
  });

  // Update editor content when note changes
  $effect(() => {
    // Track note.content to trigger on change
    void note.content;
    updateEditorContent();
  });

  // Refresh wikilinks when notes change
  $effect(() => {
    // Track all notes to trigger on changes
    void getAllNotes();
    if (editorView) {
      setTimeout(() => {
        if (editorView) {
          forceWikilinkRefresh(editorView);
        }
      }, 50);
    }
  });

  // Handle click on backlink
  function handleBacklinkClick(backlinkNoteId: string): void {
    setActiveNoteId(backlinkNoteId);
    onNavigate?.(backlinkNoteId);
  }

  // Public API
  export function focus(): void {
    if (editorView) {
      editorView.focus();
    }
  }

  export function refreshWikilinks(): void {
    if (editorView) {
      forceWikilinkRefresh(editorView);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="note-editor" onkeydown={handleKeyDown}>
  <!-- Header -->
  <div class="editor-header">
    <input
      type="text"
      class="title-input"
      value={note.title}
      oninput={handleTitleInput}
      placeholder="Untitled"
    />
    <div class="header-actions">
      <span class="last-modified" title="Last modified">
        {formatDate(note.updated)}
      </span>
      <button class="archive-btn" onclick={onArchive} title="Archive note"> 🗑️ </button>
    </div>
  </div>

  <!-- Content - CodeMirror Editor -->
  <div class="editor-content">
    <div class="editor-container editor-font" bind:this={editorContainer}></div>
  </div>

  <!-- Footer with backlinks -->
  {#if backlinks.length > 0}
    <div class="backlinks-section">
      <div class="backlinks-header">
        <span>Backlinks ({backlinks.length})</span>
      </div>
      <div class="backlinks-list">
        {#each backlinks as backlink (backlink.note.id)}
          <button
            type="button"
            class="backlink-item"
            onclick={() => handleBacklinkClick(backlink.note.id)}
          >
            <span class="backlink-title">{backlink.note.title || 'Untitled'}</span>
            {#each backlink.contexts as context, contextIndex (contextIndex)}
              <div class="backlink-context">
                {#each context.lines as line, lineIndex (lineIndex)}
                  <span class:highlight={line.isLinkLine}>{line.text}</span>
                {/each}
              </div>
            {/each}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .note-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
  }

  /* Header */
  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .title-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    outline: none;
    padding: 0;
  }

  .title-input::placeholder {
    color: var(--text-muted);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .last-modified {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .archive-btn {
    padding: 0.375rem 0.5rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 1rem;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .archive-btn:hover {
    opacity: 1;
  }

  /* Content */
  .editor-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-container {
    flex: 1;
    overflow: hidden;
  }

  /* Backlinks */
  .backlinks-section {
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
    max-height: 200px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .backlinks-header {
    padding: 0.75rem 1.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border-light);
  }

  .backlinks-list {
    padding: 0.5rem 1rem;
  }

  .backlink-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.5rem;
    border-radius: 0.375rem;
    margin-bottom: 0.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .backlink-item:hover {
    background: var(--bg-hover);
  }

  .backlink-title {
    font-weight: 500;
    color: var(--text-primary);
    display: block;
    margin-bottom: 0.25rem;
  }

  .backlink-context {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
    padding: 0.25rem 0;
  }

  .backlink-context .highlight {
    background: rgba(59, 130, 246, 0.1);
    color: var(--accent-primary);
    border-radius: 0.125rem;
    padding: 0 0.125rem;
  }
</style>
