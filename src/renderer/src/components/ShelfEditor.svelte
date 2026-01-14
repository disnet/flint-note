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
    setActiveSystemView,
    setSelectedNoteTypeId,
    addNoteToWorkspace,
    addItemToWorkspace,
    EditorConfig,
    forceWikilinkRefresh,
    getNoteContentHandle,
    getConversationEntry,
    getSelectedWikilink,
    applyFormat,
    type SelectionToolbarData,
    type FormatType,
    type GutterMenuData,
    type SlashMenuData
  } from '../lib/automerge';
  import type { WikilinkTargetType, SelectedWikilink } from '../lib/automerge';
  import type {
    SelectedMarkdownLink,
    MarkdownLinkHoverData
  } from '../lib/automerge/markdown-links.svelte';
  import { isElectron } from '../lib/platform.svelte';
  import { measureMarkerWidths, updateCSSCustomProperties } from '../lib/textMeasurement';
  import { portal } from '../lib/portal.svelte';
  import WikilinkActionPopover from './WikilinkActionPopover.svelte';
  import WikilinkEditPopover from './WikilinkEditPopover.svelte';
  import MarkdownLinkEditPopover from './MarkdownLinkEditPopover.svelte';
  import SelectionToolbar from './SelectionToolbar.svelte';
  import InsertMenu from './InsertMenu.svelte';

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

  // Action popover state
  let actionPopoverVisible = $state(false);
  let actionPopoverX = $state(0);
  let actionPopoverY = $state(0);
  let actionPopoverIsFromHover = $state(false);
  let actionPopoverLinkType = $state<'wikilink' | 'markdown'>('wikilink');
  let actionPopoverWikilinkData = $state<{
    identifier: string;
    title: string;
    exists: boolean;
    noteId?: string;
    targetType: WikilinkTargetType;
    conversationId?: string;
  } | null>(null);
  let actionPopoverMarkdownLinkData = $state<{
    displayText: string;
    url: string;
    from: number;
    to: number;
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

  // Wikilink edit popover state
  let editPopoverVisible = $state(false);
  let editPopoverX = $state(0);
  let editPopoverY = $state(0);
  let editPopoverIdentifier = $state('');
  let editPopoverDisplayText = $state('');
  let editPopoverFrom = $state(0);
  let editPopoverTo = $state(0);
  let editPopoverRef: WikilinkEditPopover | undefined = $state();
  let savedSelection: { anchor: number; head: number } | null = null;

  // Markdown link edit popover state
  let mdLinkEditPopoverVisible = $state(false);
  let mdLinkEditPopoverX = $state(0);
  let mdLinkEditPopoverY = $state(0);
  let mdLinkEditPopoverDisplayText = $state('');
  let mdLinkEditPopoverUrl = $state('');
  let mdLinkEditPopoverFrom = $state(0);
  let mdLinkEditPopoverTo = $state(0);
  let mdLinkRect = $state<{
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
        const newId = await createNote({ title });
        addNoteToWorkspace(newId);
        setActiveNoteId(newId);
      } else {
        // Navigate to existing note
        setActiveNoteId(targetId);
      }
    }
  }

  // Markdown link click handler - opens external URL
  function handleMarkdownLinkClick(url: string): void {
    if (isElectron()) {
      window.api?.openExternal({ url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
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

      // If already visible from hover for wikilinks, update immediately
      if (
        actionPopoverVisible &&
        actionPopoverIsFromHover &&
        actionPopoverLinkType === 'wikilink'
      ) {
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

      // Clear pending hover timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      // Delay before showing action popover
      hoverTimeout = setTimeout(() => {
        actionPopoverLinkType = 'wikilink';
        actionPopoverMarkdownLinkData = null;
        actionPopoverWikilinkData = {
          identifier: data.identifier,
          title: data.displayText,
          exists: data.exists,
          noteId: data.noteId,
          targetType: data.targetType,
          conversationId: data.conversationId
        };

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

  // Markdown link hover handler - shows action popover
  function handleMarkdownLinkHover(data: MarkdownLinkHoverData | null): void {
    // Clear any pending leave timeout
    if (leaveTimeout) {
      clearTimeout(leaveTimeout);
      leaveTimeout = null;
    }

    if (data) {
      // Don't show action popover if edit popover is visible
      if (mdLinkEditPopoverVisible) {
        return;
      }

      // If already visible from hover for markdown links, update immediately
      if (
        actionPopoverVisible &&
        actionPopoverIsFromHover &&
        actionPopoverLinkType === 'markdown'
      ) {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }

        actionPopoverMarkdownLinkData = {
          displayText: data.displayText,
          url: data.url,
          from: data.from,
          to: data.to
        };

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

      // Clear pending hover timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      // Delay before showing action popover
      hoverTimeout = setTimeout(() => {
        actionPopoverLinkType = 'markdown';
        actionPopoverWikilinkData = null;
        actionPopoverMarkdownLinkData = {
          displayText: data.displayText,
          url: data.url,
          from: data.from,
          to: data.to
        };

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
      // Mouse left the markdown link
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

  // Action popover handlers
  function handleActionPopoverOpen(): void {
    if (actionPopoverLinkType === 'markdown') {
      // Markdown link: open URL externally
      if (actionPopoverMarkdownLinkData) {
        handleMarkdownLinkClick(actionPopoverMarkdownLinkData.url);
      }
    } else {
      // Wikilink: navigate to note/conversation
      if (!actionPopoverWikilinkData) return;

      const data = actionPopoverWikilinkData;

      if (data.targetType === 'conversation') {
        // Conversations: only navigate if exists, never create
        if (data.exists && data.conversationId) {
          handleWikilinkClick(data.conversationId, data.title, {
            targetType: 'conversation'
          });
        }
      } else if (data.targetType === 'type') {
        // Types: navigate to type definition
        if (data.exists && data.noteId) {
          handleWikilinkClick(data.noteId, data.title, {
            targetType: 'type'
          });
        }
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
    }

    actionPopoverVisible = false;
    actionPopoverIsFromHover = false;
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

  function handleActionPopoverEdit(): void {
    if (!editorView || !linkRect) return;

    // Save current selection
    const selection = editorView.state.selection.main;
    savedSelection = { anchor: selection.anchor, head: selection.head };

    // Hide action popover
    actionPopoverVisible = false;

    if (actionPopoverLinkType === 'markdown') {
      // Markdown link: show the markdown link edit popover
      if (!actionPopoverMarkdownLinkData) return;

      mdLinkEditPopoverDisplayText = actionPopoverMarkdownLinkData.displayText;
      mdLinkEditPopoverUrl = actionPopoverMarkdownLinkData.url;
      mdLinkEditPopoverFrom = actionPopoverMarkdownLinkData.from;
      mdLinkEditPopoverTo = actionPopoverMarkdownLinkData.to;
      mdLinkRect = linkRect;

      // Position edit popover
      const position = calculatePopoverPosition(
        linkRect.left,
        linkRect.top,
        linkRect.bottom,
        450,
        120
      );
      mdLinkEditPopoverX = position.x;
      mdLinkEditPopoverY = position.y;

      mdLinkEditPopoverVisible = true;
    } else {
      // Wikilink: show the wikilink edit popover
      if (!actionPopoverWikilinkData) return;

      // Set edit popover data
      editPopoverIdentifier = actionPopoverWikilinkData.identifier;

      // For ID-only links, show the target's title
      if (actionPopoverWikilinkData.identifier === actionPopoverWikilinkData.title) {
        if (actionPopoverWikilinkData.targetType === 'conversation') {
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
          const notes = getAllNotes();
          const linkedNote = notes.find(
            (n) => n.id === actionPopoverWikilinkData!.noteId
          );
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

    // Resolve display text
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

  // Markdown link edit handler (Alt+Enter)
  function handleMarkdownLinkEdit(link: SelectedMarkdownLink): void {
    if (!editorView) return;

    // Save current selection
    const selection = editorView.state.selection.main;
    savedSelection = { anchor: selection.anchor, head: selection.head };

    // Hide wikilink popovers if visible
    actionPopoverVisible = false;
    editPopoverVisible = false;

    // Set edit popover data
    mdLinkEditPopoverDisplayText = link.displayText;
    mdLinkEditPopoverUrl = link.url;
    mdLinkEditPopoverFrom = link.from;
    mdLinkEditPopoverTo = link.to;

    // Position edit popover
    const coords = editorView.coordsAtPos(link.from);
    if (coords) {
      mdLinkRect = {
        left: coords.left,
        top: coords.top,
        bottom: coords.bottom,
        height: coords.bottom - coords.top
      };
      const position = calculatePopoverPosition(
        coords.left,
        coords.top,
        coords.bottom,
        450,
        120
      );
      mdLinkEditPopoverX = position.x;
      mdLinkEditPopoverY = position.y;
    }

    mdLinkEditPopoverVisible = true;
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

  // Markdown link edit popover handlers
  function handleMdLinkEditPopoverSave(newDisplayText: string, newUrl: string): void {
    if (!editorView) return;

    // Create new markdown link text
    const newText = `[${newDisplayText}](${newUrl})`;

    // Calculate length difference
    const oldLength = mdLinkEditPopoverTo - mdLinkEditPopoverFrom;
    const newLength = newText.length;
    const lengthDiff = newLength - oldLength;

    // Replace old link
    editorView.dispatch({
      changes: {
        from: mdLinkEditPopoverFrom,
        to: mdLinkEditPopoverTo,
        insert: newText
      }
    });

    // Update position for continued editing
    mdLinkEditPopoverTo = mdLinkEditPopoverTo + lengthDiff;
    mdLinkEditPopoverDisplayText = newDisplayText;
    mdLinkEditPopoverUrl = newUrl;
  }

  function handleMdLinkEditPopoverCommit(): void {
    mdLinkEditPopoverVisible = false;
    restoreFocusAndSelection();
  }

  function handleMdLinkEditPopoverCancel(): void {
    mdLinkEditPopoverVisible = false;
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

  // Mouse handlers for edit popovers
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
      selectionToolbarVisible = false;
    } else {
      insertMenuVisible = false;
    }
  }

  // Close insert menu
  function handleInsertMenuClose(): void {
    insertMenuVisible = false;
  }

  // Create editor config with automerge sync
  function createEditorConfig(
    handle: DocHandle<NoteContentDocument> | null
  ): EditorConfig {
    return new EditorConfig({
      onWikilinkClick: handleWikilinkClick,
      onWikilinkHover: handleWikilinkHover,
      onWikilinkEditDisplayText: handleWikilinkEditDisplayText,
      onMarkdownLinkClick: handleMarkdownLinkClick,
      onMarkdownLinkHover: handleMarkdownLinkHover,
      onMarkdownLinkEdit: handleMarkdownLinkEdit,
      onLinkCreated: handleMarkdownLinkEdit,
      onShowSelectionToolbar: handleShowSelectionToolbar,
      onShowSlashMenu: handleShowSlashMenu,
      onShowGutterMenu: handleShowGutterMenu,
      automergeSync: handle
        ? {
            handle: handle,
            path: ['content']
          }
        : undefined,
      placeholder: 'Start typing. Type "/" for commands, "[[" for note links...'
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

<!-- Floating UI elements - portaled to body to escape transformed containers -->
<div use:portal>
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

  <!-- Markdown Link Edit Popover -->
  <div role="tooltip">
    <MarkdownLinkEditPopover
      bind:visible={mdLinkEditPopoverVisible}
      x={mdLinkEditPopoverX}
      y={mdLinkEditPopoverY}
      displayText={mdLinkEditPopoverDisplayText}
      url={mdLinkEditPopoverUrl}
      linkRect={mdLinkRect}
      onSave={handleMdLinkEditPopoverSave}
      onCancel={handleMdLinkEditPopoverCancel}
      onCommit={handleMdLinkEditPopoverCommit}
    />
  </div>

  <!-- Link Action Popover (for wikilinks and markdown links) -->
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
      editLabel={actionPopoverLinkType === 'markdown' ? 'Edit Link' : 'Edit Display Text'}
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
</div>

<style>
  .shelf-editor-wrapper {
    position: relative;
    width: 100%;
  }

  .editor-container {
    overflow: visible;
  }

  /* Override CodeMirror styling for shelf context */
  .editor-container :global(.cm-editor) {
    min-height: auto !important;
    font-size: calc(var(--font-editor-size) * 0.9) !important;
    background: transparent !important;
  }

  .editor-container :global(.cm-editor.cm-focused) {
    outline: none !important;
  }

  .editor-container :global(.cm-scroller) {
    padding: 0 !important;
  }
</style>
