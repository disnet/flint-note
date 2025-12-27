<script lang="ts">
  /**
   * Note editor component using Automerge for data storage with CodeMirror editor
   */
  import { onMount, untrack, tick } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import type { DocHandle } from '@automerge/automerge-repo';
  import type { NoteMetadata, NoteContentDocument } from '../lib/automerge';
  import {
    getBacklinks,
    getAllNotes,
    createNote,
    setActiveNoteId,
    setActiveConversationId,
    addNoteToWorkspace,
    addItemToWorkspace,
    getConversationEntry,
    EditorConfig,
    forceWikilinkRefresh,
    getSelectedWikilink,
    getNoteType,
    setNoteProp,
    getNoteContentHandle,
    type ContextBlock
  } from '../lib/automerge';
  import type { WikilinkTargetType } from '../lib/automerge';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';
  import WikilinkActionPopover from './WikilinkActionPopover.svelte';
  import WikilinkEditPopover from './WikilinkEditPopover.svelte';
  import EditorChips from './EditorChips.svelte';

  interface Props {
    note: NoteMetadata;
    onTitleChange: (title: string) => void;
    onArchive: () => void;
    onNavigate?: (noteId: string) => void;
  }

  let { note, onTitleChange, onNavigate }: Props = $props();

  let editorContainer: HTMLElement | null = $state(null);
  let editorView: EditorView | null = null;
  let titleTextarea: HTMLTextAreaElement | null = $state(null);

  // Track current note ID for detecting note switches
  let currentNoteId = $state(note.id);

  // Edit popover state
  let editPopoverVisible = $state(false);
  let editPopoverX = $state(0);
  let editPopoverY = $state(0);
  let editPopoverIdentifier = $state('');
  let editPopoverDisplayText = $state('');
  let editPopoverFrom = $state(0);
  let editPopoverTo = $state(0);
  let editPopoverRef: WikilinkEditPopover | undefined = $state();
  let savedSelection: { anchor: number; head: number } | null = null;

  // Action popover state
  let actionPopoverVisible = $state(false);
  let actionPopoverX = $state(0);
  let actionPopoverY = $state(0);
  let actionPopoverIsFromHover = $state(false);
  let actionPopoverWikilinkData = $state<{
    identifier: string;
    title: string;
    exists: boolean;
    noteId?: string;
    targetType: WikilinkTargetType;
    conversationId?: string;
  } | null>(null);
  let linkRect = $state<{
    top: number;
    bottom: number;
    height: number;
    left: number;
  } | null>(null);

  // Hover timeouts
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let leaveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Content handle for automerge sync (loaded async)
  let contentHandle = $state<DocHandle<NoteContentDocument> | null>(null);
  let isLoadingContent = $state(true);
  let initialContent = $state('');

  // Track which note's content is currently loaded (plain variable, not reactive)
  let loadedNoteId: string | null = null;

  // Create editor config factory function for note-specific configuration
  function createEditorConfig(
    handle: DocHandle<NoteContentDocument> | null
  ): EditorConfig {
    return new EditorConfig({
      onWikilinkClick: handleWikilinkClick,
      onWikilinkHover: handleWikilinkHover,
      placeholder: 'Start writing...',
      // Deck widget support - navigate to notes when clicked in embedded decks
      onDeckNoteOpen: (deckNoteId) => {
        if (onNavigate) {
          onNavigate(deckNoteId);
        } else {
          // Fallback to default navigation
          setActiveNoteId(deckNoteId);
          addNoteToWorkspace(deckNoteId);
        }
      },
      // Automerge sync for CRDT text editing - uses content document
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

  // Load content handle when note ID changes
  $effect(() => {
    const noteId = note.id;

    // Only reload if the note ID actually changed
    if (noteId === loadedNoteId) {
      return;
    }
    loadedNoteId = noteId;

    isLoadingContent = true;
    contentHandle = null;

    getNoteContentHandle(noteId).then((handle) => {
      if (handle && note.id === noteId) {
        contentHandle = handle;
        const doc = handle.doc();
        initialContent = doc?.content || '';
        isLoadingContent = false;
      }
    });
  });

  function handleTitleInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    onTitleChange(target.value);
    adjustTitleHeight();
  }

  function handleTitleKeyDown(event: KeyboardEvent): void {
    // Prevent newlines in title - move focus to editor instead
    if (event.key === 'Enter') {
      event.preventDefault();
      editorView?.focus();
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
        onNavigate?.(newId);
      } else {
        // Navigate to existing note
        setActiveNoteId(targetId);
        onNavigate?.(targetId);
      }
    }
  }

  // Backlinks state (loaded async)
  let backlinks = $state<Array<{ note: NoteMetadata; contexts: ContextBlock[] }>>([]);

  // Load backlinks when note changes
  $effect(() => {
    const noteId = note.id;
    getBacklinks(noteId).then((result) => {
      if (note.id === noteId) {
        backlinks = result;
      }
    });
  });

  // Get the note type for property definitions
  const noteType = $derived(getNoteType(note.type));

  // Handle property changes
  function handlePropChange(propName: string, value: unknown): void {
    setNoteProp(note.id, propName, value);
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

  // Create or recreate editor when container is available and content is loaded
  $effect(() => {
    if (editorContainer && !isLoadingContent && contentHandle) {
      // Check if we need to create/recreate the editor
      const needsNewEditor = !editorView || note.id !== currentNoteId;

      if (needsNewEditor) {
        // Destroy existing editor if any
        if (editorView) {
          editorView.destroy();
          editorView = null;
        }

        // Create new config with the current content handle
        editorConfig.destroy();
        editorConfig = createEditorConfig(contentHandle);
        editorConfig.initializeTheme();

        // Create the editor
        createEditor();

        // Update tracking
        currentNoteId = note.id;
      }
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

  // Wikilink hover handler
  function handleWikilinkHover(
    data: {
      identifier: string;
      displayText: string;
      from: number;
      to: number;
      x: number;
      y: number;
      yTop: number;
      exists: boolean;
      noteId?: string;
      targetType: WikilinkTargetType;
      conversationId?: string;
    } | null
  ): void {
    // Clear any pending leave timeout
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeout = null;
    }

    if (data) {
      // Don't show action popover if edit popover is visible
      if (editPopoverVisible) {
        return;
      }

      // If already visible from hover, update immediately
      if (actionPopoverVisible && actionPopoverIsFromHover) {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }

        actionPopoverWikilinkData = {
          identifier: data.identifier,
          title: data.displayText,
          exists: data.exists,
          noteId: data.noteId,
          targetType: data.targetType,
          conversationId: data.conversationId
        };
        editPopoverFrom = data.from;
        editPopoverTo = data.to;
        editPopoverIdentifier = data.identifier;
        editPopoverDisplayText = data.displayText;

        linkRect = {
          left: data.x,
          top: data.yTop,
          bottom: data.y,
          height: data.y - data.yTop
        };

        const position = calculatePopoverPosition(
          linkRect.left,
          linkRect.top,
          linkRect.bottom,
          200,
          60
        );
        actionPopoverX = position.x;
        actionPopoverY = position.y;
        return;
      }

      // If visible from cursor position, don't interfere
      if (actionPopoverVisible) {
        return;
      }

      // Clear pending hover timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      // Delay before showing action popover
      hoverTimeout = setTimeout(() => {
        if (editPopoverVisible) {
          return;
        }

        actionPopoverWikilinkData = {
          identifier: data.identifier,
          title: data.displayText,
          exists: data.exists,
          noteId: data.noteId,
          targetType: data.targetType,
          conversationId: data.conversationId
        };
        editPopoverFrom = data.from;
        editPopoverTo = data.to;
        editPopoverIdentifier = data.identifier;
        editPopoverDisplayText = data.displayText;

        linkRect = {
          left: data.x,
          top: data.yTop,
          bottom: data.y,
          height: data.y - data.yTop
        };

        const position = calculatePopoverPosition(
          linkRect.left,
          linkRect.top,
          linkRect.bottom,
          200,
          60
        );
        actionPopoverX = position.x;
        actionPopoverY = position.y;

        actionPopoverVisible = true;
        actionPopoverIsFromHover = true;
        hoverTimeout = null;
      }, 300);
    } else {
      // Mouse left the wikilink
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }

      // Start leave timeout only if popover is from hover
      if (actionPopoverIsFromHover) {
        leaveTimeout = setTimeout(() => {
          actionPopoverVisible = false;
          actionPopoverIsFromHover = false;
          leaveTimeout = null;
        }, 200);
      }
    }
  }

  // Calculate popover position to avoid viewport edges
  function calculatePopoverPosition(
    linkLeft: number,
    linkTop: number,
    linkBottom: number,
    popoverWidth: number,
    popoverHeight: number
  ): { x: number; y: number } {
    const padding = 8;
    const gap = 4;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = linkLeft;
    let finalY: number;

    // Horizontal positioning
    if (finalX + popoverWidth + padding > viewportWidth) {
      finalX = viewportWidth - popoverWidth - padding;
    }
    if (finalX < padding) {
      finalX = padding;
    }

    // Vertical positioning
    const spaceBelow = viewportHeight - linkBottom;
    const canFitBelow = spaceBelow >= popoverHeight + padding + gap;

    if (canFitBelow) {
      finalY = linkBottom + gap;
    } else {
      finalY = linkTop - gap - popoverHeight;
    }

    // Final bounds check
    if (finalY + popoverHeight > viewportHeight - padding) {
      finalY = viewportHeight - popoverHeight - padding;
    }
    if (finalY < padding) {
      finalY = padding;
    }

    return { x: finalX, y: finalY };
  }

  // Action popover handlers
  function handleActionPopoverOpen(): void {
    if (!actionPopoverWikilinkData) return;

    const data = actionPopoverWikilinkData;

    if (data.targetType === 'conversation') {
      // Conversations: only navigate if exists, never create
      if (data.exists && data.conversationId) {
        handleWikilinkClick(data.conversationId, data.title, {
          targetType: 'conversation'
        });
      }
      // For broken conversation links: do nothing
    } else {
      // Notes: existing behavior
      if (data.exists && data.noteId) {
        handleWikilinkClick(data.noteId, data.title, {
          targetType: 'note'
        });
      } else {
        handleWikilinkClick(data.identifier, data.title, {
          shouldCreate: true,
          targetType: 'note'
        });
      }
    }

    actionPopoverVisible = false;
    actionPopoverIsFromHover = false;
  }

  function handleActionPopoverEdit(): void {
    if (!editorView || !actionPopoverWikilinkData || !linkRect) return;

    // Save current selection
    const selection = editorView.state.selection.main;
    savedSelection = { anchor: selection.anchor, head: selection.head };

    // Hide action popover
    actionPopoverVisible = false;

    // Set edit popover data
    editPopoverIdentifier = actionPopoverWikilinkData.identifier;

    // For ID-only links, show the target's title
    if (actionPopoverWikilinkData.identifier === actionPopoverWikilinkData.title) {
      if (actionPopoverWikilinkData.targetType === 'conversation') {
        // Look up conversation title
        if (
          actionPopoverWikilinkData.conversationId &&
          actionPopoverWikilinkData.exists
        ) {
          const conv = getConversationEntry(actionPopoverWikilinkData.conversationId);
          editPopoverDisplayText = conv?.title || actionPopoverWikilinkData.title;
        } else {
          editPopoverDisplayText = actionPopoverWikilinkData.title;
        }
      } else if (actionPopoverWikilinkData.noteId && actionPopoverWikilinkData.exists) {
        // Look up note title
        const notes = getAllNotes();
        const linkedNote = notes.find((n) => n.id === actionPopoverWikilinkData!.noteId);
        editPopoverDisplayText = linkedNote?.title || actionPopoverWikilinkData.title;
      } else {
        editPopoverDisplayText = actionPopoverWikilinkData.title;
      }
    } else {
      editPopoverDisplayText = actionPopoverWikilinkData.title;
    }

    // Get wikilink position
    const selected = getSelectedWikilink(editorView);
    if (selected) {
      editPopoverFrom = selected.from;
      editPopoverTo = selected.to;
    }

    // Position edit popover
    const position = calculatePopoverPosition(
      linkRect.left,
      linkRect.top,
      linkRect.bottom,
      400,
      100
    );
    editPopoverX = position.x;
    editPopoverY = position.y;

    editPopoverVisible = true;
  }

  // Edit popover handlers
  function handleEditPopoverSave(newDisplayText: string): void {
    if (!editorView) return;

    // Create new wikilink text with updated display
    const newText = `[[${editPopoverIdentifier}|${newDisplayText}]]`;

    // Calculate length difference
    const oldLength = editPopoverTo - editPopoverFrom;
    const newLength = newText.length;
    const lengthDiff = newLength - oldLength;

    // Replace old wikilink
    editorView.dispatch({
      changes: {
        from: editPopoverFrom,
        to: editPopoverTo,
        insert: newText
      }
    });

    // Update position for continued editing
    editPopoverTo = editPopoverTo + lengthDiff;
    editPopoverDisplayText = newDisplayText;
  }

  function handleEditPopoverCommit(): void {
    editPopoverVisible = false;
    restoreFocusAndSelection();
  }

  function handleEditPopoverCancel(): void {
    editPopoverVisible = false;
    restoreFocusAndSelection();
  }

  function restoreFocusAndSelection(): void {
    if (!editorView) return;

    editorView.focus();

    if (savedSelection) {
      editorView.dispatch({
        selection: savedSelection,
        scrollIntoView: true
      });
      savedSelection = null;
    }
  }

  // Mouse handlers for popovers
  function handleEditPopoverMouseEnter(): void {
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeout = null;
    }
  }

  function handleEditPopoverMouseLeave(): void {
    leaveTimeout = setTimeout(() => {
      if (editPopoverRef && editPopoverRef.hasFocus()) {
        return;
      }
      editPopoverVisible = false;
      leaveTimeout = null;
    }, 200);
  }

  function handleActionPopoverMouseEnter(): void {
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeout = null;
    }
  }

  function handleActionPopoverMouseLeave(): void {
    if (actionPopoverIsFromHover) {
      leaveTimeout = setTimeout(() => {
        actionPopoverVisible = false;
        actionPopoverIsFromHover = false;
        leaveTimeout = null;
      }, 200);
    }
  }

  // Track selected wikilink for cursor-based popup
  $effect(() => {
    if (!editorView) return;

    const interval = setInterval(() => {
      if (!editorView) return;

      const selected = getSelectedWikilink(editorView);

      // Hide if editor doesn't have focus
      if (!editorView.hasFocus) {
        if (!actionPopoverIsFromHover) {
          actionPopoverVisible = false;
        }
        return;
      }

      if (selected && !editPopoverVisible && !actionPopoverIsFromHover) {
        // Show action popup for cursor-adjacent wikilink
        const coords = editorView.coordsAtPos(selected.from);
        if (coords) {
          actionPopoverWikilinkData = {
            identifier: selected.identifier,
            title: selected.title,
            exists: selected.exists,
            noteId: selected.noteId,
            targetType: selected.targetType,
            conversationId: selected.conversationId
          };

          linkRect = {
            left: coords.left,
            top: coords.top,
            bottom: coords.bottom,
            height: coords.bottom - coords.top
          };

          const position = calculatePopoverPosition(
            linkRect.left,
            linkRect.top,
            linkRect.bottom,
            200,
            60
          );
          actionPopoverX = position.x;
          actionPopoverY = position.y;
          actionPopoverVisible = true;
          actionPopoverIsFromHover = false;
        }
      } else if ((!selected || editPopoverVisible) && !actionPopoverIsFromHover) {
        actionPopoverVisible = false;
      }
    }, 100);

    return () => clearInterval(interval);
  });

  // Close popovers when editor loses focus
  $effect(() => {
    if (!editorView) return;

    const handleBlur = (): void => {
      untrack(() => {
        if (!editorView?.hasFocus) {
          if (editPopoverVisible || (editPopoverRef && editPopoverRef.hasFocus())) {
            setTimeout(() => {
              if (editPopoverRef && editPopoverRef.hasFocus()) {
                return;
              }
              if (!editorView?.hasFocus) {
                actionPopoverVisible = false;
                actionPopoverIsFromHover = false;
                editPopoverVisible = false;
              }
            }, 50);
            return;
          }

          actionPopoverVisible = false;
          actionPopoverIsFromHover = false;
          editPopoverVisible = false;

          if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
          }
          if (leaveTimeout) {
            clearTimeout(leaveTimeout);
            leaveTimeout = null;
          }
        }
      });
    };

    const handleFocus = (): void => {
      untrack(() => {
        if (editPopoverVisible && editPopoverRef && !editPopoverRef.hasFocus()) {
          editPopoverVisible = false;
        }
        if (actionPopoverVisible) {
          actionPopoverVisible = false;
          actionPopoverIsFromHover = false;
        }
      });
    };

    editorView.dom.addEventListener('blur', handleBlur, true);
    editorView.dom.addEventListener('focus', handleFocus, true);

    return () => {
      editorView?.dom.removeEventListener('blur', handleBlur, true);
      editorView?.dom.removeEventListener('focus', handleFocus, true);
    };
  });

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
    <div class="header-row">
      <div class="title-area">
        <NoteTypeDropdown noteId={note.id} currentTypeId={note.type} compact />
        <textarea
          bind:this={titleTextarea}
          class="title-input"
          value={note.title}
          oninput={handleTitleInput}
          onkeydown={handleTitleKeyDown}
          placeholder="Untitled"
          rows="1"
        ></textarea>
      </div>
    </div>
    <!-- Property Chips -->
    <EditorChips
      {note}
      {noteType}
      onPropChange={handlePropChange}
      onNoteClick={onNavigate}
    />
  </div>

  <!-- Content - CodeMirror Editor -->
  <div class="editor-content">
    {#if isLoadingContent}
      <div class="editor-loading">
        <span class="loading-text">Loading...</span>
      </div>
    {:else}
      <div class="editor-container editor-font" bind:this={editorContainer}></div>
    {/if}
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

<!-- Wikilink Edit Popover -->
<div
  role="tooltip"
  onmouseenter={handleEditPopoverMouseEnter}
  onmouseleave={handleEditPopoverMouseLeave}
>
  <WikilinkEditPopover
    bind:this={editPopoverRef}
    bind:visible={editPopoverVisible}
    x={editPopoverX}
    y={editPopoverY}
    displayText={editPopoverDisplayText}
    {linkRect}
    onSave={handleEditPopoverSave}
    onCancel={handleEditPopoverCancel}
    onCommit={handleEditPopoverCommit}
  />
</div>

<!-- Wikilink Action Popover -->
<div
  role="tooltip"
  onmouseenter={handleActionPopoverMouseEnter}
  onmouseleave={handleActionPopoverMouseLeave}
>
  <WikilinkActionPopover
    bind:visible={actionPopoverVisible}
    x={actionPopoverX}
    y={actionPopoverY}
    {linkRect}
    onOpen={handleActionPopoverOpen}
    onEdit={handleActionPopoverEdit}
  />
</div>

<style>
  .note-editor {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 100%;
    background: var(--bg-primary);
  }

  /* Header */
  .editor-header {
    display: flex;
    flex-direction: column;
    padding: 0;
    flex-shrink: 0;
  }

  /* Header row with title and actions */
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
    text-indent: 2.3rem; /* Space for the type icon */
  }

  .title-input::placeholder {
    color: var(--text-muted);
    opacity: 0.5;
  }

  /* Content */
  .editor-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .editor-loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: var(--text-muted);
  }

  .loading-text {
    font-size: 0.875rem;
  }

  .editor-container {
    flex: 1;
    min-height: 300px;
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
