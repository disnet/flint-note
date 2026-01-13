<script lang="ts">
  /**
   * Note editor component using Automerge for data storage with CodeMirror editor
   */
  import { onMount, untrack } from 'svelte';
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
    setActiveSystemView,
    setSelectedNoteTypeId,
    applyFormat,
    type BacklinkResult,
    type SelectionToolbarData,
    type FormatType,
    type GutterMenuData,
    type SlashMenuData
  } from '../lib/automerge';
  import type { WikilinkTargetType, SelectedWikilink } from '../lib/automerge';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';
  import NoteHeader from './NoteHeader.svelte';
  import WikilinkActionPopover from './WikilinkActionPopover.svelte';
  import WikilinkEditPopover from './WikilinkEditPopover.svelte';
  import SelectionToolbar from './SelectionToolbar.svelte';
  import InsertMenu from './InsertMenu.svelte';
  import EditorChips from './EditorChips.svelte';
  import BacklinksPanel from './BacklinksPanel.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import {
    createPositionTracker,
    hasSavedScrollPosition
  } from '../lib/editorPosition.svelte';
  import { editorFocusState } from '../stores/editorFocusState.svelte';

  interface Props {
    note: NoteMetadata;
    previewMode?: boolean;
    onTitleChange: (title: string) => void;
    onArchive: () => void;
    onUnarchive?: () => void;
    onNavigate?: (noteId: string) => void;
  }

  let {
    note,
    previewMode = false,
    onTitleChange,
    onUnarchive,
    onNavigate
  }: Props = $props();

  // Archived notes are always readonly
  const isReadonly = $derived(note.archived);
  const effectivePreviewMode = $derived(previewMode || isReadonly);

  let editorContainer: HTMLElement | null = $state(null);
  let editorView: EditorView | null = $state(null);

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

  // Selection toolbar state
  let selectionToolbarVisible = $state(false);
  let selectionToolbarX = $state(0);
  let selectionToolbarRect = $state<{
    top: number;
    bottom: number;
    left: number;
    right: number;
  } | null>(null);

  // Insert menu state (used by both gutter button and slash commands)
  let insertMenuVisible = $state(false);
  let insertMenuX = $state(0);
  let insertMenuY = $state(0);
  let insertMenuMode = $state<
    | { type: 'gutter'; linePos: number }
    | { type: 'slash'; slashFrom: number; slashTo: number }
  >({ type: 'gutter', linePos: 0 });

  // Hover timeouts
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let leaveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Content handle for automerge sync (loaded async)
  let contentHandle = $state<DocHandle<NoteContentDocument> | null>(null);
  let isLoadingContent = $state(true);
  let initialContent = $state('');

  // Derived content for preview mode (reactive to document changes)
  const previewContent = $derived.by(() => {
    if (!contentHandle) return initialContent;
    const doc = contentHandle.doc();
    return doc?.content || initialContent;
  });

  // Track which note's content is currently loaded (plain variable, not reactive)
  let loadedNoteId: string | null = null;

  // Position tracking for scroll/cursor persistence
  let positionTracker: ReturnType<typeof createPositionTracker> | null = null;

  // Selection toolbar handler
  function handleShowSelectionToolbar(data: SelectionToolbarData | null): void {
    if (data) {
      selectionToolbarX = data.x;
      selectionToolbarRect = data.selectionRect;
      selectionToolbarVisible = true;
    } else {
      selectionToolbarVisible = false;
    }
  }

  // Handle formatting from selection toolbar
  function handleSelectionFormat(format: FormatType): void {
    if (!editorView) return;
    applyFormat(editorView, format);
    // Keep focus on editor
    editorView.focus();
  }

  // Close selection toolbar
  function handleSelectionToolbarClose(): void {
    selectionToolbarVisible = false;
  }

  // Gutter menu handler
  function handleShowGutterMenu(data: GutterMenuData | null): void {
    if (data) {
      insertMenuX = data.x;
      insertMenuY = data.y;
      insertMenuMode = { type: 'gutter', linePos: data.linePos };
      insertMenuVisible = true;
      // Hide selection toolbar if visible
      selectionToolbarVisible = false;
    } else {
      insertMenuVisible = false;
    }
  }

  // Slash menu handler
  function handleShowSlashMenu(data: SlashMenuData | null): void {
    if (data) {
      insertMenuX = data.x;
      insertMenuY = data.y;
      insertMenuMode = {
        type: 'slash',
        slashFrom: data.slashFrom,
        slashTo: data.slashTo
      };
      insertMenuVisible = true;
      // Hide selection toolbar if visible
      selectionToolbarVisible = false;
    } else {
      insertMenuVisible = false;
    }
  }

  // Close insert menu
  function handleInsertMenuClose(): void {
    insertMenuVisible = false;
  }

  // Create editor config factory function for note-specific configuration
  function createEditorConfig(
    handle: DocHandle<NoteContentDocument> | null
  ): EditorConfig {
    return new EditorConfig({
      onWikilinkClick: handleWikilinkClick,
      onWikilinkHover: handleWikilinkHover,
      onWikilinkEditDisplayText: handleWikilinkEditDisplayText,
      onCursorChange: () => positionTracker?.savePosition(),
      onShowSelectionToolbar: handleShowSelectionToolbar,
      onShowSlashMenu: handleShowSlashMenu,
      onShowGutterMenu: handleShowGutterMenu,
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

    // Save position of current note BEFORE loading new content
    // This must happen before isLoadingContent=true which hides the editor
    positionTracker?.cleanup();
    positionTracker = null;

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

  function handleTitleEnterKey(): void {
    editorView?.focus();
  }

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

    // Close hover popup when navigating via wikilink click
    actionPopoverVisible = false;
    actionPopoverIsFromHover = false;
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeout = null;
    }

    if (targetType === 'conversation') {
      // Navigate to conversation (never create via wikilink)
      setActiveConversationId(targetId);
      addItemToWorkspace({ type: 'conversation', id: targetId });
    } else if (targetType === 'type') {
      // Navigate to note type definition screen
      setSelectedNoteTypeId(targetId);
      setActiveSystemView('types');
    } else {
      // Note handling
      if (shouldCreate) {
        // Create a new note with the given title
        // Note: createNote() triggers global wikilink stabilization which will
        // update this link (and any others matching the title) to use the new ID.
        // The automerge-codemirror sync will update the editor automatically.
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
  let backlinks = $state<BacklinkResult[]>([]);

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

  // Handle click on editor content area - focus and move cursor to end if clicking outside editor
  function handleContentClick(event: MouseEvent): void {
    if (!editorView || !editorContainer) return;

    // Get the CodeMirror content area bounds
    const contentRect = editorView.contentDOM.getBoundingClientRect();

    // Check if click is below the actual content
    if (event.clientY > contentRect.bottom) {
      // Click was below editor content, focus and move cursor to end
      const docLength = editorView.state.doc.length;
      editorView.dispatch({
        selection: { anchor: docLength },
        scrollIntoView: true
      });
      editorView.focus();
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

    // Add focus/blur handlers for mobile keyboard control panel
    editorView.contentDOM.addEventListener('focus', handleEditorFocus);
    editorView.contentDOM.addEventListener('blur', handleEditorBlur);

    measureAndUpdateMarkerWidths();
  }

  function handleEditorFocus(): void {
    editorFocusState.setFocused(true, editorView);
  }

  function handleEditorBlur(): void {
    editorFocusState.setFocused(false, null);
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
      positionTracker?.cleanup();
      positionTracker = null;
      if (editorView) {
        // Remove focus/blur handlers before destroying
        editorView.contentDOM.removeEventListener('focus', handleEditorFocus);
        editorView.contentDOM.removeEventListener('blur', handleEditorBlur);
        editorFocusState.setFocused(false, null);
        editorView.destroy();
        editorView = null;
      }
      editorConfig.destroy();
    };
  });

  // Helper to find the scroll container
  function findScrollContainer(element: HTMLElement | null): HTMLElement | null {
    if (!element) return null;
    let parent = element.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  // Create or recreate editor when container is available and content is loaded
  $effect(() => {
    if (editorContainer && !isLoadingContent && contentHandle) {
      // Check if we need to create/recreate the editor
      // Also check if editor is attached to a different (stale) container - happens when toggling preview mode
      const editorDetached =
        editorView && editorView.dom.parentElement !== editorContainer;
      const needsNewEditor = !editorView || note.id !== currentNoteId || editorDetached;

      if (needsNewEditor) {
        // Pre-hide scroll container if we have a saved scroll position
        // This prevents the flash of content at top before scrolling
        const scrollContainer = findScrollContainer(editorContainer);
        const shouldPreHide = hasSavedScrollPosition(note.id);
        if (scrollContainer && shouldPreHide) {
          scrollContainer.style.visibility = 'hidden';
        }

        // Destroy existing editor if any
        // Note: position was already saved in the content loading effect
        if (editorView) {
          // Remove focus/blur handlers before destroying
          editorView.contentDOM.removeEventListener('focus', handleEditorFocus);
          editorView.contentDOM.removeEventListener('blur', handleEditorBlur);
          editorFocusState.setFocused(false, null);
          editorView.destroy();
          editorView = null;
        }

        // Create new config with the current content handle
        editorConfig.destroy();
        editorConfig = createEditorConfig(contentHandle);
        editorConfig.initializeTheme();

        // Create the editor
        createEditor();

        // Set up position tracking for the new editor
        positionTracker = createPositionTracker(note.id, () => editorView);
        positionTracker.attachScrollListener();

        // Delay position restoration to allow Automerge sync to complete
        setTimeout(() => {
          positionTracker?.restorePosition(() => {
            editorView?.focus();
          });
        }, 100);

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

      // If visible from cursor position, allow hover to take over
      // Don't return - continue below to start delayed show

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

  // Handler for Alt-Enter keyboard shortcut to edit wikilink display text
  function handleWikilinkEditDisplayText(wikilink: SelectedWikilink): void {
    if (!editorView) return;

    // Save current selection
    const selection = editorView.state.selection.main;
    savedSelection = { anchor: selection.anchor, head: selection.head };

    // Hide action popover if visible
    actionPopoverVisible = false;

    // Set edit popover data
    editPopoverIdentifier = wikilink.identifier;

    // Resolve display text (same logic as handleActionPopoverEdit)
    if (wikilink.identifier === wikilink.title) {
      if (wikilink.targetType === 'conversation') {
        if (wikilink.conversationId && wikilink.exists) {
          const conv = getConversationEntry(wikilink.conversationId);
          editPopoverDisplayText = conv?.title || wikilink.title;
        } else {
          editPopoverDisplayText = wikilink.title;
        }
      } else if (wikilink.noteId && wikilink.exists) {
        const notes = getAllNotes();
        const linkedNote = notes.find((n) => n.id === wikilink.noteId);
        editPopoverDisplayText = linkedNote?.title || wikilink.title;
      } else {
        editPopoverDisplayText = wikilink.title;
      }
    } else {
      editPopoverDisplayText = wikilink.title;
    }

    // Set position info
    editPopoverFrom = wikilink.from;
    editPopoverTo = wikilink.to;

    // Position edit popover
    const coords = editorView.coordsAtPos(wikilink.from);
    if (coords) {
      linkRect = {
        left: coords.left,
        top: coords.top,
        bottom: coords.bottom,
        height: coords.bottom - coords.top
      };
      const position = calculatePopoverPosition(
        coords.left,
        coords.top,
        coords.bottom,
        400,
        100
      );
      editPopoverX = position.x;
      editPopoverY = position.y;
    }

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
  <!-- Archived Banner -->
  {#if note.archived}
    <div class="archived-banner">
      <span class="archived-text">This note is archived</span>
      <button class="unarchive-button" onclick={() => onUnarchive?.()}>
        Unarchive
      </button>
    </div>
  {/if}

  <!-- Header -->
  <div class="editor-header">
    <NoteHeader
      {note}
      readonly={isReadonly}
      {onTitleChange}
      onEnterKey={handleTitleEnterKey}
    >
      {#snippet chips()}
        <EditorChips
          {note}
          {noteType}
          onPropChange={handlePropChange}
          onNoteClick={onNavigate}
        />
      {/snippet}
    </NoteHeader>
  </div>

  <!-- Content - CodeMirror Editor or Preview -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="editor-content" onclick={handleContentClick}>
    {#if isLoadingContent}
      <div class="editor-loading">
        <span class="loading-text">Loading...</span>
      </div>
    {:else if effectivePreviewMode}
      <div class="preview-container editor-font">
        <MarkdownRenderer
          text={previewContent}
          onNoteClick={(noteId) => onNavigate?.(noteId)}
        />
      </div>
    {:else}
      <div class="editor-container editor-font" bind:this={editorContainer}></div>
    {/if}
  </div>

  <!-- Footer with backlinks -->
  <BacklinksPanel
    {backlinks}
    onNavigate={handleBacklinkClick}
    onWikilinkClick={handleWikilinkClick}
  />
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

<!-- Selection Toolbar -->
<SelectionToolbar
  bind:visible={selectionToolbarVisible}
  x={selectionToolbarX}
  selectionRect={selectionToolbarRect}
  onFormat={handleSelectionFormat}
  onClose={handleSelectionToolbarClose}
/>

<!-- Insert Menu (for slash commands and gutter button) -->
<InsertMenu
  bind:visible={insertMenuVisible}
  x={insertMenuX}
  y={insertMenuY}
  {editorView}
  mode={insertMenuMode}
  onClose={handleInsertMenuClose}
/>

<style>
  .note-editor {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
    background: var(--bg-primary);
  }

  /* Archived Banner */
  .archived-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--bg-warning, #fef3c7);
    border-radius: 6px;
    border: 1px solid var(--border-warning, #fcd34d);
  }

  :global(.dark) .archived-banner {
    background: rgba(251, 191, 36, 0.15);
    border-color: rgba(251, 191, 36, 0.3);
  }

  .archived-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-warning, #92400e);
  }

  :global(.dark) .archived-text {
    color: #fbbf24;
  }

  .unarchive-button {
    padding: 0.25rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-warning, #92400e);
    background: transparent;
    border: 1px solid var(--border-warning, #fcd34d);
    border-radius: 4px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .unarchive-button:hover {
    background: var(--bg-warning-hover, #fde68a);
  }

  :global(.dark) .unarchive-button {
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.4);
  }

  :global(.dark) .unarchive-button:hover {
    background: rgba(251, 191, 36, 0.25);
  }

  /* Header */
  .editor-header {
    flex-shrink: 0;
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

  .preview-container {
    flex: 1;
    min-height: 300px;
    padding: 0;
    line-height: 1.6;
    color: var(--text-primary);
  }
</style>
