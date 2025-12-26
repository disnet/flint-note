<script lang="ts">
  /**
   * Shelf editor component for Automerge notes
   * Uses CodeMirror with automergeSyncPlugin for CRDT text editing
   */
  import { onMount } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import type { DocHandle } from '@automerge/automerge-repo';
  import type { NoteContentDocument } from '../lib/automerge';
  import {
    getAllNotes,
    createNote,
    setActiveNoteId,
    setActiveConversationId,
    addNoteToWorkspace,
    addItemToWorkspace,
    EditorConfig,
    forceWikilinkRefresh,
    getNoteContentHandle
  } from '../lib/automerge';
  import type { WikilinkTargetType } from '../lib/automerge';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';

  interface Props {
    noteId: string;
  }

  let { noteId }: Props = $props();

  let editorContainer: HTMLElement | null = $state(null);
  let editorView: EditorView | null = null;

  // Track current noteId for reactivity
  let currentNoteId = $state(noteId);

  // Content handle and state (loaded async)
  let contentHandle = $state<DocHandle<NoteContentDocument> | null>(null);
  let isLoadingContent = $state(true);
  let initialContent = $state('');

  // Load content handle when noteId changes
  $effect(() => {
    const id = noteId;
    isLoadingContent = true;
    contentHandle = null;

    getNoteContentHandle(id).then((handle) => {
      if (handle && noteId === id) {
        contentHandle = handle;
        const doc = handle.doc();
        initialContent = doc?.content || '';
        isLoadingContent = false;
      }
    });
  });

  async function handleWikilinkClick(
    targetId: string,
    title: string,
    options?: {
      shouldCreate?: boolean;
      targetType?: WikilinkTargetType;
    }
  ): Promise<void> {
    const targetType = options?.targetType || 'note';
    const shouldCreate = options?.shouldCreate || false;

    if (targetType === 'conversation') {
      // Navigate to conversation (never create via wikilink)
      setActiveConversationId(targetId);
      addItemToWorkspace({ type: 'conversation', id: targetId });
    } else {
      // Note handling
      if (shouldCreate) {
        // Create a new note with the given title
        const newId = await createNote({ title });
        addNoteToWorkspace(newId);
        setActiveNoteId(newId);
      } else {
        // Navigate to existing note
        setActiveNoteId(targetId);
      }
    }
  }

  // Create editor config with automerge sync
  function createEditorConfig(
    handle: DocHandle<NoteContentDocument> | null
  ): EditorConfig {
    return new EditorConfig({
      onWikilinkClick: handleWikilinkClick,
      automergeSync: handle
        ? {
            handle: handle,
            path: ['content']
          }
        : undefined,
      placeholder: 'Start typing...'
    });
  }

  let editorConfig = createEditorConfig(null);

  // Create the editor
  function createEditor(): void {
    if (!editorContainer || editorView) return;

    const startState = EditorState.create({
      doc: initialContent,
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

  // Recreate editor when content handle changes
  function recreateEditor(): void {
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
    editorConfig.destroy();
    editorConfig = createEditorConfig(contentHandle);
    editorConfig.initializeTheme();

    if (editorContainer) {
      createEditor();
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

  // Create editor when container is available and content is loaded
  $effect(() => {
    if (editorContainer && !editorView && !isLoadingContent && contentHandle) {
      editorConfig.destroy();
      editorConfig = createEditorConfig(contentHandle);
      editorConfig.initializeTheme();
      createEditor();
    }
  });

  // Handle noteId changes - content handle will be reloaded by the effect above
  $effect(() => {
    if (noteId !== currentNoteId && contentHandle && !isLoadingContent) {
      currentNoteId = noteId;
      recreateEditor();
    }
  });

  // Reconfigure editor when theme changes
  $effect(() => {
    void editorConfig.isDarkMode;
    if (editorView) {
      editorView.dispatch({
        effects: StateEffect.reconfigure.of(editorConfig.getExtensions())
      });
      measureAndUpdateMarkerWidths();
    }
  });

  // Refresh wikilinks when notes change
  $effect(() => {
    void getAllNotes();
    if (editorView) {
      setTimeout(() => {
        if (editorView) {
          forceWikilinkRefresh(editorView);
        }
      }, 50);
    }
  });

  // Public methods for external control
  export function focus(): void {
    editorView?.focus();
  }

  export function getContent(): string {
    return editorView?.state.doc.toString() || '';
  }

  export function setContent(newContent: string): void {
    if (editorView) {
      const currentDoc = editorView.state.doc.toString();
      editorView.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: newContent
        }
      });
    }
  }

  export function refreshWikilinks(): void {
    if (editorView) {
      forceWikilinkRefresh(editorView);
    }
  }
</script>

<div class="shelf-editor-wrapper">
  <div class="editor-container editor-font" bind:this={editorContainer}></div>
</div>

<style>
  .shelf-editor-wrapper {
    position: relative;
    width: 100%;
  }

  .editor-container {
    overflow: hidden;
  }

  /* Override CodeMirror styling for shelf context */
  .editor-container :global(.cm-editor) {
    min-height: auto !important;
    font-size: 0.8rem !important;
    background: transparent !important;
  }

  .editor-container :global(.cm-editor.cm-focused) {
    outline: none !important;
  }

  .editor-container :global(.cm-scroller) {
    padding: 0 !important;
  }
</style>
