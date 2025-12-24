<script lang="ts">
  /**
   * Daily note editor component for the Automerge daily view
   * Uses CodeMirror with collapsible expansion behavior
   */
  import { onMount } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import {
    getAllNotes,
    createNote,
    setActiveNoteId,
    setActiveConversationId,
    addNoteToWorkspace,
    addItemToWorkspace,
    EditorConfig,
    forceWikilinkRefresh
  } from '../lib/automerge';
  import type { WikilinkTargetType } from '../lib/automerge';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';

  interface Props {
    content: string;
    onContentChange?: (content: string) => void;
  }

  let { content, onContentChange }: Props = $props();

  let editorContainer: HTMLElement | null = $state(null);
  let editorView: EditorView | null = null;
  let isFocused = $state(false);
  let isManuallyExpanded = $state(false);
  let showControlsDelayed = $state(true);
  let controlsTimeout: ReturnType<typeof setTimeout> | null = null;

  // Calculate max height based on focus and expansion state
  const maxHeight = $derived.by(() => {
    if (isFocused || isManuallyExpanded) {
      return '10000px'; // Very large height for smooth transition
    }
    return '240px'; // 5 lines default
  });

  // Show expand button and fade gradient when not focused
  const showExpandControls = $derived(
    !isFocused && !isManuallyExpanded && showControlsDelayed
  );

  // Editor config
  const editorConfig = new EditorConfig({
    onWikilinkClick: handleWikilinkClick,
    onContentChange: handleEditorContentChange,
    placeholder: 'Start typing to create entry...'
  });

  function handleEditorContentChange(newContent: string): void {
    onContentChange?.(newContent);
  }

  function handleWikilinkClick(
    targetId: string,
    title: string,
    options?: {
      shouldCreate?: boolean;
      targetType?: WikilinkTargetType;
    }
  ): void {
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
        const newId = createNote({ title });
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

  // Update editor content when prop changes
  function updateEditorContent(): void {
    if (editorView && content !== undefined) {
      const currentDoc = editorView.state.doc.toString();
      if (currentDoc !== content) {
        editorView.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: content
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
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
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
    void editorConfig.isDarkMode;
    if (editorView) {
      editorView.dispatch({
        effects: StateEffect.reconfigure.of(editorConfig.getExtensions())
      });
      measureAndUpdateMarkerWidths();
    }
  });

  // Update editor content when prop changes
  $effect(() => {
    void content;
    updateEditorContent();
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

  {#if showExpandControls && content.trim()}
    <div class="expand-controls">
      <div class="fade-gradient"></div>
      <button class="expand-btn" onclick={toggleExpansion} type="button">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6,9 12,15 18,9"></polyline>
        </svg>
        Expand
      </button>
    </div>
  {/if}
</div>

<style>
  .daily-note-editor-wrapper {
    position: relative;
    width: 100%;
    border-radius: 0.5rem;
    border: 2px solid transparent;
    transition:
      border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .daily-note-editor-wrapper.focused {
    border-color: var(--accent-primary);
    box-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
  }

  .editor-container {
    transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .expand-controls {
    position: relative;
    width: 100%;
  }

  .fade-gradient {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    height: 40px;
    background: linear-gradient(to bottom, transparent, var(--bg-primary));
    pointer-events: none;
  }

  .expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    width: 100%;
    padding: 0.5rem;
    border: none;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 0 0 0.375rem 0.375rem;
    transition: all 0.2s ease;
  }

  .expand-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
