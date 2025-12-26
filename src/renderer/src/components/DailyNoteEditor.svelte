<script lang="ts">
  /**
   * Daily note editor component for the Automerge daily view
   * Uses CodeMirror with collapsible expansion behavior and automerge-codemirror sync
   */
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
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
  let isFocused = $state(false);
  let isManuallyExpanded = $state(false);
  let showControlsDelayed = $state(true);
  let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
  let isContentClipped = $state(false);

  // Content handle and state (loaded async)
  let contentHandle = $state<DocHandle<NoteContentDocument> | null>(null);
  let isLoadingContent = $state(true);
  let content = $state('');

  // Load content handle when noteId changes
  $effect(() => {
    const id = noteId;
    isLoadingContent = true;
    contentHandle = null;

    getNoteContentHandle(id).then((handle) => {
      if (handle && noteId === id) {
        contentHandle = handle;
        const doc = handle.doc();
        content = doc?.content || '';
        isLoadingContent = false;

        // Subscribe to content changes
        handle.on('change', ({ doc }) => {
          if (doc) {
            content = doc.content || '';
          }
        });
      }
    });
  });

  // Check if content is empty
  const hasContent = $derived(content.trim().length > 0);

  // Calculate max height based on focus, expansion state, and content
  const maxHeight = $derived.by(() => {
    if (isFocused || isManuallyExpanded) {
      return 'none'; // No constraint when focused - match content height
    }
    if (!hasContent) {
      return '72px'; // ~2-3 lines for empty entries
    }
    return '168px'; // ~7 lines for entries with content
  });

  // Show expand button when not focused and content is clipped
  const showExpandControls = $derived(
    !isFocused &&
      !isManuallyExpanded &&
      showControlsDelayed &&
      hasContent &&
      isContentClipped
  );

  // Show fade gradient when content is clipped (even without expand button visible)
  const showFadeGradient = $derived(
    !isFocused && !isManuallyExpanded && hasContent && isContentClipped
  );

  // Create editor config with content handle
  function createEditorConfig(
    handle: DocHandle<NoteContentDocument> | null
  ): EditorConfig {
    return new EditorConfig({
      onWikilinkClick: handleWikilinkClick,
      placeholder: 'Start typing to create entry...',
      variant: 'daily-note',
      automergeSync: handle
        ? {
            handle: handle,
            path: ['content']
          }
        : undefined
    });
  }

  // Initial editor config (without sync until content handle loads)
  let editorConfig = createEditorConfig(null);

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

  function handleFocusChange(focused: boolean): void {
    isFocused = focused;

    if (focused) {
      showControlsDelayed = false;
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
        controlsTimeout = null;
      }
    } else {
      isManuallyExpanded = false;
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
      controlsTimeout = setTimeout(() => {
        showControlsDelayed = true;
        controlsTimeout = null;
      }, 500);
    }
  }

  function toggleExpansion(): void {
    isManuallyExpanded = !isManuallyExpanded;
    if (isManuallyExpanded && editorView) {
      editorView.focus();
    }
  }

  // Create the editor
  function createEditor(): void {
    if (!editorContainer || editorView) return;

    const startState = EditorState.create({
      doc: content,
      extensions: editorConfig.getExtensions()
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    });

    // Track focus changes
    editorView.dom.addEventListener('focusin', () => handleFocusChange(true));
    editorView.dom.addEventListener('focusout', () => {
      // Small delay to handle focus moving within editor
      setTimeout(() => {
        if (editorView && !editorView.hasFocus) {
          handleFocusChange(false);
        }
      }, 10);
    });

    measureAndUpdateMarkerWidths();
    checkContentClipped();
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

  // Check if content is being clipped (scrollHeight > clientHeight)
  function checkContentClipped(): void {
    if (!editorContainer) {
      isContentClipped = false;
      return;
    }
    // Give time for layout to settle
    setTimeout(() => {
      if (editorContainer) {
        isContentClipped = editorContainer.scrollHeight > editorContainer.clientHeight;
      }
    }, 50);
  }

  onMount(() => {
    editorConfig.initializeTheme();
    return () => {
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }
      editorConfig.destroy();
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
    };
  });

  // Create editor when container is available and content is loaded
  $effect(() => {
    if (editorContainer && !editorView && !isLoadingContent && contentHandle) {
      // Reconfigure with content handle now that it's available
      editorConfig.destroy();
      editorConfig = createEditorConfig(contentHandle);
      editorConfig.initializeTheme();
      createEditor();
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

  // Check if content is clipped when content, focus, or expansion state changes
  $effect(() => {
    void content;
    void isFocused;
    void isManuallyExpanded;
    if (!isFocused && !isManuallyExpanded) {
      checkContentClipped();
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

<div class="daily-note-editor-wrapper" class:focused={isFocused || isManuallyExpanded}>
  <div
    class="editor-container editor-font"
    bind:this={editorContainer}
    style:max-height={maxHeight}
    style:overflow={isFocused || isManuallyExpanded ? 'visible' : 'hidden'}
  ></div>

  {#if showFadeGradient}
    <div class="fade-overlay" transition:fade={{ duration: 200, easing: cubicOut }}>
      <div class="fade-gradient"></div>
      {#if showExpandControls}
        <button
          class="expand-btn"
          onclick={toggleExpansion}
          type="button"
          in:fly={{ y: 8, duration: 250, delay: 100, easing: cubicOut }}
          out:fade={{ duration: 150 }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <polyline points="6,9 12,15 18,9"></polyline>
          </svg>
          <span>Show more</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .daily-note-editor-wrapper {
    position: relative;
    width: 100%;
    border-radius: 0.5rem;
    transition: box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .daily-note-editor-wrapper.focused {
    box-shadow:
      0 0 0 2px var(--accent-primary),
      0 0 10px rgba(99, 102, 241, 0.3);
  }

  .editor-container {
    padding: 0.25rem;
    transition: max-height 0.35s cubic-bezier(0.25, 0.1, 0.25, 1);
  }

  .fade-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 80px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 1;
  }

  .fade-gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 0%, var(--bg-primary) 85%);
    pointer-events: none;
  }

  .expand-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.25rem 0.75rem;
    margin-bottom: 0.25rem;
    border: none;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.6875rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 1rem;
    transition:
      background 0.2s ease,
      color 0.2s ease,
      transform 0.15s ease,
      box-shadow 0.2s ease;
    opacity: 0.95;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .expand-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    transform: scale(1.02);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }

  .expand-btn:active {
    transform: scale(0.98);
  }
</style>
