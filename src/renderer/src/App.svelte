<script lang="ts">
  import LeftSidebar from './components/LeftSidebar.svelte';
  import MainView from './components/MainView.svelte';
  import RightSidebar from './components/RightSidebar.svelte';
  import SearchBar from './components/SearchBar.svelte';
  import VaultSwitcher from './components/VaultSwitcher.svelte';
  import FirstTimeExperience from './components/FirstTimeExperience.svelte';
  import UpdateIndicator from './components/UpdateIndicator.svelte';
  import ExternalEditConflictNotification from './components/ExternalEditConflictNotification.svelte';
  import ToastNotification from './components/ToastNotification.svelte';
  import ChangelogViewer from './components/ChangelogViewer.svelte';
  import HamburgerMenu from './components/HamburgerMenu.svelte';
  import ImportWebpageModal from './components/ImportWebpageModal.svelte';
  import type { Message } from './services/types';
  import type { NoteMetadata } from './services/noteStore.svelte';
  import { getChatService } from './services/chatService';
  import { notesStore } from './services/noteStore.svelte';
  import { modelStore } from './stores/modelStore.svelte';
  import { sidebarState } from './stores/sidebarState.svelte';
  import { workspacesStore } from './stores/workspacesStore.svelte';
  import { unifiedChatStore } from './stores/unifiedChatStore.svelte';
  import { noteNavigationService } from './services/noteNavigationService.svelte';
  import { activeNoteStore } from './stores/activeNoteStore.svelte';
  import { cursorPositionStore } from './services/cursorPositionStore.svelte';
  import { vaultAvailabilityService } from './services/vaultAvailabilityService.svelte';
  import { dailyViewStore } from './stores/dailyViewStore.svelte';
  import { inboxStore } from './stores/inboxStore.svelte';
  import { reviewStore } from './stores/reviewStore.svelte';
  import { notesShelfStore } from './stores/notesShelfStore.svelte';
  import { noteDocumentRegistry } from './stores/noteDocumentRegistry.svelte';
  import type { CreateVaultResult } from '@/server/api/types';
  import { messageBus } from './services/messageBus.svelte';
  import type {
    NoteEvent,
    WorkflowEvent,
    ReviewEvent
  } from './services/messageBus.svelte';
  import { settingsStore } from './stores/settingsStore.svelte';
  import { logger } from './utils/logger';

  // Forward note events from main process to message bus
  $effect(() => {
    const unsubscribe = window.api?.onNoteEvent((event) => {
      messageBus.publish(event as NoteEvent);
    });

    return () => {
      unsubscribe?.();
    };
  });

  // Forward workflow events from main process to message bus
  $effect(() => {
    const unsubscribe = window.api?.onWorkflowEvent((event) => {
      messageBus.publish(event as WorkflowEvent);
    });

    return () => {
      unsubscribe?.();
    };
  });

  // Forward review events from main process to message bus
  $effect(() => {
    const unsubscribe = window.api?.onReviewEvent((event) => {
      messageBus.publish(event as ReviewEvent);
    });

    return () => {
      unsubscribe?.();
    };
  });

  // Update menu state when active note changes
  $effect(() => {
    const hasActiveNote = activeNoteStore.activeNote !== null;
    window.api?.setMenuActiveNote(hasActiveNote);
  });

  // Update menu state when workspaces change
  $effect(() => {
    const workspaces = workspacesStore.workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      icon: w.icon
    }));
    const activeId = workspacesStore.activeWorkspaceId;
    window.api?.setMenuWorkspaces({ workspaces, activeWorkspaceId: activeId });
  });

  // Handle menu navigation events
  $effect(() => {
    const unsubscribe = window.api?.onMenuNavigate((view) => {
      const viewMap: Record<string, typeof activeSystemView> = {
        inbox: 'inbox',
        daily: 'daily',
        review: 'review',
        routines: 'workflows',
        'note-types': 'notes',
        settings: 'settings'
      };
      const mappedView = viewMap[view];
      if (mappedView) {
        handleSystemViewSelect(mappedView);

        // For daily view, dispatch event to focus on today's entry
        // Delay to ensure the component is mounted and listener is registered
        if (view === 'daily') {
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent('daily-view-focus-today'));
          }, 150);
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  });

  // Handle menu action events
  $effect(() => {
    const unsubscribe = window.api?.onMenuAction(async (action, ...args) => {
      switch (action) {
        case 'new-note':
          await handleCreateNote(undefined, true);
          break;
        case 'new-vault':
          document.dispatchEvent(new CustomEvent('vault-create-modal-open'));
          break;
        case 'switch-vault':
          document.dispatchEvent(new CustomEvent('vault-switcher-open'));
          break;
        case 'show-in-finder':
          if (activeNoteStore.activeNote) {
            const chatService = getChatService();
            const note = await chatService.getNote({
              identifier: activeNoteStore.activeNote.id
            });
            if (note?.path) {
              await window.api?.showItemInFolder({ path: note.path });
            }
          }
          break;
        case 'find': {
          // Focus the search bar
          const searchInput = document.getElementById('global-search');
          searchInput?.focus();
          break;
        }
        case 'toggle-sidebar':
          sidebarState.toggleLeftSidebar();
          break;
        case 'focus-title':
          // Dispatch event for NoteEditor to handle
          document.dispatchEvent(new CustomEvent('menu-focus-title'));
          break;
        case 'toggle-preview':
          // Dispatch event for NoteEditor to handle
          document.dispatchEvent(new CustomEvent('menu-toggle-preview'));
          break;
        case 'toggle-metadata':
          // Dispatch event for NoteEditor to handle
          document.dispatchEvent(new CustomEvent('menu-toggle-metadata'));
          break;
        case 'toggle-agent':
          setRightSidebarMode('ai');
          break;
        case 'toggle-shelf':
          setRightSidebarMode('notes');
          break;
        case 'toggle-pin':
          if (activeNoteStore.activeNote) {
            await workspacesStore.togglePin(activeNoteStore.activeNote.id);
          }
          break;
        case 'add-to-shelf':
          if (activeNoteStore.activeNote) {
            const noteId = activeNoteStore.activeNote.id;
            const doc = noteDocumentRegistry.get(noteId);
            if (doc) {
              await notesShelfStore.addNote(noteId, doc.title, doc.content);
              // Open the right sidebar in notes mode
              if (
                !sidebarState.rightSidebar.visible ||
                sidebarState.rightSidebar.mode !== 'notes'
              ) {
                if (!sidebarState.rightSidebar.visible) {
                  await sidebarState.toggleRightSidebar();
                }
                if (sidebarState.rightSidebar.mode !== 'notes') {
                  await sidebarState.setRightSidebarMode('notes');
                }
              }
            }
          }
          break;
        case 'toggle-review':
          if (activeNoteStore.activeNote) {
            const noteId = activeNoteStore.activeNote.id;
            const result = await window.api?.isReviewEnabled(noteId);
            if (result?.enabled) {
              await reviewStore.disableReview(noteId);
            } else {
              await reviewStore.enableReview(noteId);
            }
          }
          break;
        case 'change-type':
          // Dispatch event for NoteEditor to handle
          document.dispatchEvent(new CustomEvent('menu-change-type'));
          break;
        case 'generate-suggestions':
          if (activeNoteStore.activeNote) {
            await window.api?.generateNoteSuggestions({
              noteId: activeNoteStore.activeNote.id
            });
          }
          break;
        case 'archive-note':
          if (activeNoteStore.activeNote) {
            const chatService = getChatService();
            const vault = await chatService.getCurrentVault();
            if (vault) {
              await chatService.archiveNote({
                vaultId: vault.id,
                identifier: activeNoteStore.activeNote.id
              });
            }
          }
          break;
        case 'show-shortcuts':
          // TODO: Show keyboard shortcuts modal
          break;
        case 'check-updates':
          try {
            await window.api?.checkForUpdates();
          } catch (error) {
            console.error('Failed to check for updates:', error);
          }
          break;
        case 'show-changelog':
          showChangelog = true;
          break;
        case 'show-about':
          // TODO: Show about dialog
          break;
        case 'new-workspace':
          document.dispatchEvent(new CustomEvent('workspace-menu-new'));
          break;
        case 'edit-workspace':
          document.dispatchEvent(new CustomEvent('workspace-menu-edit'));
          break;
        case 'delete-workspace':
          document.dispatchEvent(new CustomEvent('workspace-menu-delete'));
          break;
        case 'switch-workspace':
          if (args[0] && typeof args[0] === 'string') {
            await workspacesStore.switchWorkspace(args[0]);
          }
          break;
        case 'import-file':
          await handleImportFile();
          break;
        case 'import-epub':
          await handleImportEpub();
          break;
        case 'import-pdf':
          await handleImportPdf();
          break;
        case 'import-webpage':
          showImportWebpageModal = true;
          break;
      }
    });

    return () => {
      unsubscribe?.();
    };
  });

  // Add app lifecycle integration for cursor position persistence
  $effect(() => {
    const handleBeforeUnload = async (): Promise<void> => {
      try {
        await cursorPositionStore.flushPendingSaves();
      } catch (error) {
        console.warn('Failed to flush cursor position saves on app close:', error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Initialize inbox count
    async function initializeInbox(): Promise<void> {
      try {
        const chatService = getChatService();
        const vault = await chatService.getCurrentVault();
        if (vault) {
          await inboxStore.updateUnprocessedCount(vault.id);
        }
      } catch (error) {
        console.error('Failed to initialize inbox count:', error);
      }
    }
    initializeInbox();

    // Initialize review stats
    async function initializeReviewStats(): Promise<void> {
      try {
        await reviewStore.loadStats();
      } catch (error) {
        console.error('Failed to initialize review stats:', error);
      }
    }
    initializeReviewStats();

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  });

  // Messages are now managed by unifiedChatStore
  const messages = $derived(unifiedChatStore.activeThread?.messages || []);

  let isLoadingResponse = $state(false);
  let currentRequestId = $state<string | null>(null);
  let activeSystemView = $state<
    'inbox' | 'daily' | 'notes' | 'settings' | 'workflows' | 'review' | null
  >(null);
  let toolCallLimitReached = $state<{
    stepCount: number;
    maxSteps: number;
  } | null>(null);
  let refreshCredits: (() => Promise<void>) | undefined = $state();

  // Changelog modal state
  let showChangelog = $state(false);
  let appVersion = $state('');
  let isCanary = $state(false);

  // Import webpage modal state
  let showImportWebpageModal = $state(false);

  // Drag and drop state for PDF/EPUB files
  let isDraggingFile = $state(false);
  let dragTimeout: ReturnType<typeof setTimeout> | null = null;
  // Track window focus - drag sensor only active when window is blurred (potential external drag)
  let windowBlurred = $state(false);
  // Prevent double-processing of drops (both sensor and window listener can fire)
  let isProcessingDrop = false;

  function isValidDropFile(file: File): boolean {
    const ext = file.name.toLowerCase();
    return ext.endsWith('.pdf') || ext.endsWith('.epub');
  }

  // Helper to create a note from an imported file result
  async function createNoteFromImportResult(
    result: { type: 'pdf' | 'epub'; filename: string; path: string; title?: string },
    currentVault: { id: string }
  ): Promise<NoteMetadata> {
    const chatService = getChatService();

    if (result.type === 'pdf') {
      const displayName = result.title || result.filename.replace(/\.pdf$/i, '');

      const createdNote = await chatService.createNote({
        type: 'note',
        kind: 'pdf',
        identifier: displayName,
        content: `# Notes on ${displayName}\n\n`,
        vaultId: currentVault.id,
        metadata: {
          flint_pdfPath: result.path,
          flint_pdfTitle: result.title || '',
          flint_progress: 0,
          flint_lastRead: new Date().toISOString()
        }
      });

      return {
        id: createdNote.id,
        type: createdNote.type,
        flint_kind: 'pdf',
        title: createdNote.title,
        filename: createdNote.filename,
        path: createdNote.path,
        created: createdNote.created,
        modified: createdNote.created,
        size: 0
      };
    } else {
      // EPUB
      const bookName = result.filename.replace(/\.epub$/i, '');

      const createdNote = await chatService.createNote({
        type: 'note',
        kind: 'epub',
        identifier: bookName,
        content: `# Notes on ${bookName}\n\n`,
        vaultId: currentVault.id,
        metadata: {
          flint_epubPath: result.path,
          flint_progress: 0,
          flint_lastRead: new Date().toISOString()
        }
      });

      return {
        id: createdNote.id,
        type: createdNote.type,
        flint_kind: 'epub',
        title: createdNote.title,
        filename: createdNote.filename,
        path: createdNote.path,
        created: createdNote.created,
        modified: createdNote.created,
        size: 0
      };
    }
  }

  function hasValidDropFiles(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer) return false;
    // Check items for file types during dragover
    if (dataTransfer.items) {
      return Array.from(dataTransfer.items).some(
        (item) =>
          item.kind === 'file' &&
          (item.type === 'application/pdf' || item.type === 'application/epub+zip')
      );
    }
    // Fallback to files (available on drop)
    if (dataTransfer.files) {
      return Array.from(dataTransfer.files).some(isValidDropFile);
    }
    return false;
  }

  // Handle drag events on the sensor (only visible when window blurred)
  function handleDragSensorDragEnter(event: DragEvent): void {
    if (hasValidDropFiles(event.dataTransfer)) {
      event.preventDefault();
      isDraggingFile = true;
    }
  }

  function handleDragSensorDragOver(event: DragEvent): void {
    if (hasValidDropFiles(event.dataTransfer)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      isDraggingFile = true;

      // Reset timeout on each dragover
      if (dragTimeout) clearTimeout(dragTimeout);
      dragTimeout = setTimeout(() => {
        isDraggingFile = false;
        dragTimeout = null;
      }, 100);
    }
  }

  function handleDragSensorDrop(event: DragEvent): void {
    if (!hasValidDropFiles(event.dataTransfer)) return;
    event.preventDefault();
    isDraggingFile = false;
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }
    void processFileDrop(event);
  }

  function handleDragSensorDragLeave(event: DragEvent): void {
    // Only hide if leaving the window entirely
    if (event.relatedTarget === null) {
      isDraggingFile = false;
      if (dragTimeout) {
        clearTimeout(dragTimeout);
        dragTimeout = null;
      }
    }
  }

  // Track window focus to know when to show drag sensor
  $effect(() => {
    const handleBlur = (): void => {
      windowBlurred = true;
    };
    const handleFocus = (): void => {
      // Small delay to allow drag events to fire first
      setTimeout(() => {
        windowBlurred = false;
      }, 100);
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  });

  // Window-level drag listeners for when mouse enters from within the app
  $effect(() => {
    const handleWindowDragEnter = (event: DragEvent): void => {
      if (event.dataTransfer && hasValidDropFiles(event.dataTransfer)) {
        event.preventDefault();
        isDraggingFile = true;
      }
    };

    const handleWindowDragOver = (event: DragEvent): void => {
      if (event.dataTransfer && hasValidDropFiles(event.dataTransfer)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        isDraggingFile = true;

        if (dragTimeout) clearTimeout(dragTimeout);
        dragTimeout = setTimeout(() => {
          isDraggingFile = false;
          dragTimeout = null;
        }, 100);
      }
    };

    const handleWindowDrop = (event: DragEvent): void => {
      if (!hasValidDropFiles(event.dataTransfer)) return;
      event.preventDefault();
      isDraggingFile = false;
      if (dragTimeout) {
        clearTimeout(dragTimeout);
        dragTimeout = null;
      }
      void processFileDrop(event);
    };

    window.addEventListener('dragenter', handleWindowDragEnter, { capture: true });
    window.addEventListener('dragover', handleWindowDragOver, { capture: true });
    window.addEventListener('drop', handleWindowDrop, { capture: true });

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter, { capture: true });
      window.removeEventListener('dragover', handleWindowDragOver, { capture: true });
      window.removeEventListener('drop', handleWindowDrop, { capture: true });
      if (dragTimeout) {
        clearTimeout(dragTimeout);
      }
    };
  });

  async function processFileDrop(event: DragEvent): Promise<void> {
    // Prevent double-processing (both sensor and window listener can fire)
    if (isProcessingDrop) return;
    isProcessingDrop = true;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      isProcessingDrop = false;
      return;
    }

    const validFiles = Array.from(files).filter(isValidDropFile);
    if (validFiles.length === 0) {
      isProcessingDrop = false;
      return;
    }

    try {
      // Get the current vault
      const chatService = getChatService();
      const currentVault = await chatService.getCurrentVault();
      if (!currentVault) {
        console.error('No current vault available for file import');
        return;
      }

      // Process all valid dropped files
      const createdNotes: NoteMetadata[] = [];
      for (const file of validFiles) {
        try {
          // Read file data
          const buffer = await file.arrayBuffer();
          const fileData = new Uint8Array(buffer);

          // Import via IPC
          const result = await window.api?.importFileFromData({
            fileData,
            filename: file.name
          });

          if (!result) {
            console.error('Failed to import dropped file:', file.name);
            continue;
          }

          const noteMetadata = await createNoteFromImportResult(result, currentVault);
          createdNotes.push(noteMetadata);
        } catch (fileError) {
          console.error('Error importing dropped file:', file.name, fileError);
          // Continue with other files
        }
      }

      // Add all notes to temporary tabs, then open the first one
      if (createdNotes.length > 0) {
        // Add remaining notes to tabs first (the first one will be added by openNote)
        for (let i = 1; i < createdNotes.length; i++) {
          await workspacesStore.addTab(createdNotes[i].id, 'navigation');
        }

        // Open the first imported note (this also adds it to tabs)
        await noteNavigationService.openNote(
          createdNotes[0],
          'navigation',
          openNoteEditor,
          () => {
            activeSystemView = null;
          }
        );
      }
    } catch (error) {
      console.error('Error importing dropped files:', error);
    } finally {
      // Reset flag after a short delay to handle any duplicate events
      setTimeout(() => {
        isProcessingDrop = false;
      }, 100);
    }
  }

  // Load app version for changelog
  $effect(() => {
    (async () => {
      try {
        const versionInfo = await window.api?.getAppVersion();
        if (versionInfo) {
          appVersion = versionInfo.version;
          isCanary = versionInfo.channel === 'canary';
        }
      } catch (error) {
        console.error('Failed to load app version:', error);
      }
    })();
  });

  async function handleNoteSelect(note: NoteMetadata): Promise<void> {
    await noteNavigationService.openNote(note, 'navigation', openNoteEditor, () => {
      activeSystemView = null;
    });
  }

  async function handleImportEpub(): Promise<void> {
    try {
      // Open file picker and import EPUB
      const result = await window.api?.importEpub();
      if (!result) {
        // User cancelled the file picker
        return;
      }

      // Get the current vault
      const chatService = getChatService();
      const currentVault = await chatService.getCurrentVault();
      if (!currentVault) {
        console.error('No current vault available for EPUB import');
        return;
      }

      // Create the epub note with metadata
      const bookName = result.filename.replace(/\.epub$/i, '');
      const identifier = bookName; // Use book name as identifier

      // Create note with 'note' type and 'epub' kind, including EPUB-specific metadata
      const createdNote = await chatService.createNote({
        type: 'note',
        kind: 'epub',
        identifier,
        content: `# Notes on ${bookName}\n\n`,
        vaultId: currentVault.id,
        metadata: {
          flint_epubPath: result.path,
          flint_progress: 0,
          flint_lastRead: new Date().toISOString()
        }
      });

      // Convert to NoteMetadata format and open
      const noteMetadata: NoteMetadata = {
        id: createdNote.id,
        type: createdNote.type,
        flint_kind: 'epub',
        title: createdNote.title,
        filename: createdNote.filename,
        path: createdNote.path,
        created: createdNote.created,
        modified: createdNote.created,
        size: 0
      };

      // Open the note
      await noteNavigationService.openNote(
        noteMetadata,
        'navigation',
        openNoteEditor,
        () => {
          activeSystemView = null;
        }
      );
    } catch (error) {
      console.error('Failed to import EPUB:', error);
    }
  }

  async function handleImportPdf(): Promise<void> {
    try {
      // Open file picker and import PDF
      const result = await window.api?.importPdf();
      if (!result) {
        // User cancelled the file picker
        return;
      }

      // Get the current vault
      const chatService = getChatService();
      const currentVault = await chatService.getCurrentVault();
      if (!currentVault) {
        console.error('No current vault available for PDF import');
        return;
      }

      // Create the pdf note with metadata
      // Use PDF title from metadata if available, otherwise fall back to filename
      const docName = result.title || result.filename.replace(/\.pdf$/i, '');
      const identifier = docName;

      // Create note with 'note' type and 'pdf' kind, including PDF-specific metadata
      const createdNote = await chatService.createNote({
        type: 'note',
        kind: 'pdf',
        identifier,
        content: `# Notes on ${docName}\n\n`,
        vaultId: currentVault.id,
        metadata: {
          flint_pdfPath: result.path,
          flint_pdfTitle: result.title || '',
          flint_progress: 0,
          flint_lastRead: new Date().toISOString()
        }
      });

      // Convert to NoteMetadata format and open
      const noteMetadata: NoteMetadata = {
        id: createdNote.id,
        type: createdNote.type,
        flint_kind: 'pdf',
        title: createdNote.title,
        filename: createdNote.filename,
        path: createdNote.path,
        created: createdNote.created,
        modified: createdNote.created,
        size: 0
      };

      // Open the note
      await noteNavigationService.openNote(
        noteMetadata,
        'navigation',
        openNoteEditor,
        () => {
          activeSystemView = null;
        }
      );
    } catch (error) {
      console.error('Failed to import PDF:', error);
    }
  }

  async function handleImportFile(): Promise<void> {
    try {
      // Open file picker for PDF or EPUB (supports multiple selection)
      const results = await window.api?.importFile();
      if (!results || results.length === 0) {
        // User cancelled the file picker or no files imported
        return;
      }

      // Get the current vault
      const chatService = getChatService();
      const currentVault = await chatService.getCurrentVault();
      if (!currentVault) {
        console.error('No current vault available for file import');
        return;
      }

      // Create notes for all imported files
      const createdNotes: NoteMetadata[] = [];
      for (const result of results) {
        try {
          const noteMetadata = await createNoteFromImportResult(result, currentVault);
          createdNotes.push(noteMetadata);
        } catch (noteError) {
          console.error(
            'Failed to create note for imported file:',
            result.filename,
            noteError
          );
          // Continue with other files
        }
      }

      // Add all notes to temporary tabs, then open the first one
      if (createdNotes.length > 0) {
        // Add remaining notes to tabs first (the first one will be added by openNote)
        for (let i = 1; i < createdNotes.length; i++) {
          await workspacesStore.addTab(createdNotes[i].id, 'navigation');
        }

        // Open the first imported note (this also adds it to tabs)
        await noteNavigationService.openNote(
          createdNotes[0],
          'navigation',
          openNoteEditor,
          () => {
            activeSystemView = null;
          }
        );
      }
    } catch (error) {
      console.error('Failed to import files:', error);
    }
  }

  function handleCaptureWebpage(): void {
    showImportWebpageModal = true;
  }

  async function handleImportWebpage(url: string): Promise<void> {
    try {
      // Import the webpage
      const result = await window.api?.importWebpage({ url });
      if (!result) {
        throw new Error('Failed to import webpage');
      }

      // Get the current vault
      const chatService = getChatService();
      const currentVault = await chatService.getCurrentVault();
      if (!currentVault) {
        console.error('No current vault available for webpage import');
        return;
      }

      // Create the webpage note with metadata
      const identifier = result.title || result.slug;

      const createdNote = await chatService.createNote({
        type: 'note',
        kind: 'webpage',
        identifier,
        content: `# Notes on ${result.title}\n\n`,
        vaultId: currentVault.id,
        metadata: {
          flint_webpagePath: result.path,
          flint_webpageOriginalPath: result.originalPath,
          flint_webpageUrl: url,
          flint_webpageTitle: result.title || '',
          flint_webpageSiteName: result.siteName || '',
          flint_webpageAuthor: result.author || '',
          flint_progress: 0,
          flint_lastRead: new Date().toISOString()
        }
      });

      // Convert to NoteMetadata format and open
      const noteMetadata: NoteMetadata = {
        id: createdNote.id,
        type: createdNote.type,
        flint_kind: 'webpage',
        title: createdNote.title,
        filename: createdNote.filename,
        path: createdNote.path,
        created: createdNote.created,
        modified: createdNote.created,
        size: 0
      };

      // Open the note
      await noteNavigationService.openNote(
        noteMetadata,
        'navigation',
        openNoteEditor,
        () => {
          activeSystemView = null;
        }
      );
    } catch (error) {
      console.error('Failed to import webpage:', error);
      throw error;
    }
  }

  async function handleCreateNote(
    noteType?: string,
    fromKeyboard: boolean = false
  ): Promise<void> {
    // For keyboard shortcuts, create note directly
    if (fromKeyboard) {
      try {
        // Get the current vault ID
        const chatService = getChatService();
        const currentVault = await chatService.getCurrentVault();
        if (!currentVault) {
          console.error('No current vault available for note creation');
          return;
        }

        // Create note without title (empty string will generate unique identifier)
        const type = noteType || 'note'; // Default to 'note' type
        const identifier = ''; // Empty identifier for untitled notes
        const content = ``;

        // Create the note via the chat service
        // The IPC handler returns full note data synchronously, no need to wait for events
        const createdNote = await chatService.createNote({
          type,
          identifier,
          content,
          vaultId: currentVault.id
        });

        // Convert CreateNoteResult to NoteMetadata format
        const noteMetadata: NoteMetadata = {
          id: createdNote.id,
          type: createdNote.type,
          title: createdNote.title,
          filename: createdNote.filename,
          path: createdNote.path,
          created: createdNote.created,
          modified: createdNote.created, // New notes have same created/modified time
          size: 0
        };

        // Open the note immediately using the returned data
        // Background: note.created event will propagate and update caches
        await noteNavigationService.openNote(
          noteMetadata,
          'navigation',
          openNoteEditor,
          () => {
            activeSystemView = null;
          }
        );
      } catch (error) {
        console.error('Failed to create note:', error);
        // Log error for debugging
        console.error('Note creation failed, but no fallback modal available');
      }
    } else {
      // For UI clicks, create note directly (no modal)
      await handleCreateNote(noteType, true);
    }
  }

  async function handleSystemViewSelect(
    view: 'inbox' | 'daily' | 'notes' | 'settings' | 'workflows' | 'review' | null
  ): Promise<void> {
    // If clicking the same view that's already active and sidebar is visible, toggle the sidebar
    if (sidebarState.leftSidebar.visible && activeSystemView === view && view !== null) {
      sidebarState.toggleLeftSidebar();
    } else {
      activeSystemView = view;
      // Save the active view (clears note, sets system view)
      await activeNoteStore.setActiveSystemView(view);
      // If sidebar is closed, open it when selecting a view
      if (!sidebarState.leftSidebar.visible && view !== null) {
        sidebarState.toggleLeftSidebar();
      }
    }
  }

  function handleViewWorkflows(): void {
    handleSystemViewSelect('workflows');
  }

  async function handleNoteClick(noteId: string): Promise<void> {
    // Find the note in the notes store using the same logic as wikilink resolution
    const notes = notesStore.notes;
    const normalizedIdentifier = noteId.toLowerCase().trim();

    // First, try to match by note ID (exact match)
    let note = notes.find((n) => n.id.toLowerCase() === normalizedIdentifier);

    // Then try to match by type/filename format (e.g., "sketch/what-makes-a-good-thinking-system")
    if (!note && normalizedIdentifier.includes('/')) {
      const [type, ...filenameParts] = normalizedIdentifier.split('/');
      const filename = filenameParts.join('/'); // Handle nested paths if any

      note = notes.find(
        (n) =>
          n.type.toLowerCase() === type &&
          n.filename.toLowerCase().replace(/\.md$/, '').trim() === filename
      );

      // Fallback: try matching by type/title (for when agents use title instead of slugified filename)
      if (!note) {
        const titlePart = filenameParts.join('/'); // Reconstruct the title part
        note = notes.find(
          (n) =>
            n.type.toLowerCase() === type &&
            n.title.toLowerCase().trim() === titlePart.trim()
        );
      }
    }

    // Then try to match by title (case-insensitive)
    if (!note) {
      note = notes.find((n) => n.title.toLowerCase().trim() === normalizedIdentifier);
    }

    // Finally, try to match by filename without .md extension
    if (!note) {
      note = notes.find(
        (n) =>
          n.filename.toLowerCase().replace(/\.md$/, '').trim() === normalizedIdentifier
      );
    }

    if (note) {
      await noteNavigationService.openNote(note, 'wikilink', openNoteEditor);
    } else {
      console.warn('Note not found:', noteId);
    }
  }

  async function openNoteEditor(note: NoteMetadata): Promise<void> {
    await activeNoteStore.setActiveNote(note);
  }

  async function closeNoteEditor(): Promise<void> {
    await activeNoteStore.clearActiveNote();
  }

  function handleNavigationBack(): void {
    noteNavigationService.goBack();
  }

  function handleNavigationForward(): void {
    noteNavigationService.goForward();
  }

  // Platform detection setup
  $effect(() => {
    // Set data attribute for platform detection
    const isMacOS = navigator.platform.includes('Mac');
    document.documentElement.setAttribute('data-platform', isMacOS ? 'macos' : 'other');
  });

  // Theme application
  $effect(() => {
    const theme = settingsStore.settings.appearance.theme;

    // Apply theme based on user preference
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      // System/auto mode - remove the attribute to use CSS media query
      document.documentElement.removeAttribute('data-theme');
    }
  });

  // Restore active view (note or system view) on app startup
  $effect(() => {
    async function restoreView(): Promise<void> {
      try {
        // Wait for the notes store to finish loading before restoring the active view
        // This ensures wikilinks have the complete note data for proper resolution
        const checkNotesLoaded = (): Promise<void> => {
          return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
              if (!notesStore.loading && notesStore.notes.length >= 0) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 50);
          });
        };

        await checkNotesLoaded();

        const restoredView = await activeNoteStore.restoreActiveView();

        if (restoredView) {
          if (restoredView.type === 'note') {
            // Restore note
            await noteNavigationService.openNote(
              restoredView.note,
              'navigation',
              () => {
                // Note is already set in store, no need to set again
              },
              () => {
                activeSystemView = null;
              }
            );
          } else if (restoredView.type === 'system-view') {
            // Restore system view
            activeSystemView = restoredView.viewType;
          }
        }
      } catch (error) {
        console.warn('Failed to restore active view:', error);
      }
    }

    restoreView();
  });

  // Global keyboard shortcuts
  // Note: Many shortcuts are now handled by the application menu (Cmd+N, Cmd+O, Cmd+1-6, etc.)
  // These are supplementary shortcuts not covered by the menu
  $effect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Ctrl/Cmd + Shift + [ to go back
      if (event.key === '[' && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        handleNavigationBack();
      }

      // Ctrl/Cmd + Shift + ] to go forward
      if (event.key === ']' && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        handleNavigationForward();
      }

      // Workspace switching: Ctrl+1-9 on macOS, Alt+1-9 on Windows/Linux
      // (Regular Cmd+1-6 is now used for system views via menu)
      const isMacOS = navigator.platform.includes('Mac');
      const isWorkspaceShortcut = isMacOS
        ? event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
        : event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;

      if (isWorkspaceShortcut) {
        const num = parseInt(event.key);
        if (num >= 1 && num <= 9) {
          const workspaces = workspacesStore.workspaces;
          const targetIndex = num - 1;
          if (targetIndex < workspaces.length) {
            event.preventDefault();
            workspacesStore.switchWorkspace(workspaces[targetIndex].id);
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  // Wikilink navigation event listener
  $effect(() => {
    async function handleWikilinkNavigate(event: CustomEvent): Promise<void> {
      const { note } = event.detail;
      if (note) {
        await noteNavigationService.openNote(note, 'wikilink', openNoteEditor, () => {
          activeSystemView = null;
        });
      }
    }

    document.addEventListener(
      'wikilink-navigate',
      handleWikilinkNavigate as unknown as (event: Event) => void
    );
    return () =>
      document.removeEventListener(
        'wikilink-navigate',
        handleWikilinkNavigate as unknown as (event: Event) => void
      );
  });

  // Handle unpinned notes event from navigation service
  $effect(() => {
    const handleNotesUnpinned: (event: Event) => void = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { noteIds } = customEvent.detail;

      logger.debug('[App] notes-unpinned event received:', { noteIds });

      // Add unpinned notes to temporary tabs
      // BUT: only if the note actually exists in the notes store
      for (const noteId of noteIds) {
        const note = notesStore.notes.find((n) => n.id === noteId);
        if (note) {
          logger.debug('[App] Adding unpinned note to tabs:', {
            noteId,
            title: note.title
          });
          await workspacesStore.addTab(noteId, 'navigation');
        } else {
          console.warn('[App] Skipping unpinned note - not found in notes store:', {
            noteId,
            totalNotes: notesStore.notes.length
          });
        }
      }
    };

    document.addEventListener('notes-unpinned', handleNotesUnpinned);
    return () => document.removeEventListener('notes-unpinned', handleNotesUnpinned);
  });

  // Handle history navigation events from navigation service
  $effect(() => {
    async function handleHistoryNavigate(event: CustomEvent): Promise<void> {
      const { noteId, title, scrollPosition } = event.detail;

      // Find the note and open it
      const note = notesStore.notes.find((n) => n.id === noteId);
      if (note) {
        await noteNavigationService.openNote(note, 'history', openNoteEditor, () => {
          activeSystemView = null;
        });

        // Restore scroll position if available
        if (scrollPosition && typeof scrollPosition === 'number') {
          setTimeout(() => {
            window.scrollTo(0, scrollPosition);
          }, 100);
        }
      } else {
        console.warn('Note not found for history navigation:', noteId, title);
      }
    }

    document.addEventListener(
      'history-navigate',
      handleHistoryNavigate as unknown as (event: Event) => void
    );
    return () =>
      document.removeEventListener(
        'history-navigate',
        handleHistoryNavigate as unknown as (event: Event) => void
      );
  });

  function generateUniqueId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async function handleCancelMessage(): Promise<void> {
    if (currentRequestId) {
      try {
        await window.api?.cancelMessageStream({ requestId: currentRequestId });

        // Add a system message indicating cancellation
        const cancellationMessage: Message = {
          id: generateUniqueId(),
          text: '_Request cancelled by user._',
          sender: 'agent',
          timestamp: new Date()
        };
        await unifiedChatStore.addMessage(cancellationMessage);

        isLoadingResponse = false;
        currentRequestId = null;
      } catch (error) {
        console.error('Failed to cancel message:', error);
      }
    }
  }

  function handleToolCallLimitContinue(): void {
    // Clear the limit state and send a message to continue
    toolCallLimitReached = null;
    handleSendMessage('Please continue with your previous task.');
  }

  function handleToolCallLimitStop(): void {
    // Just clear the limit state
    toolCallLimitReached = null;
  }

  async function handleSendMessage(text: string): Promise<void> {
    // Clear any existing limit state when sending a new message
    toolCallLimitReached = null;

    // Check if message fits within context window
    const estimatedTokens = Math.ceil(text.length / 3.5);
    try {
      const canAccept = await window.api?.canAcceptMessage({
        estimatedTokens,
        conversationId: unifiedChatStore.activeThreadId ?? undefined
      });

      if (!canAccept?.canAccept) {
        // Show error message in a new agent message
        const errorMessage: Message = {
          id: generateUniqueId(),
          text: `⚠️ ${canAccept?.reason || 'Your message would exceed the context window limit. Please start a new thread or shorten your message.'}`,
          sender: 'agent',
          timestamp: new Date()
        };
        await unifiedChatStore.addMessage(errorMessage);
        return;
      }
    } catch (error) {
      console.error('Failed to check context usage:', error);
      // Continue anyway if check fails
    }

    const newMessage: Message = {
      id: generateUniqueId(),
      text,
      sender: 'user',
      timestamp: new Date()
    };
    await unifiedChatStore.addMessage(newMessage);

    isLoadingResponse = true;

    // Create a placeholder message for streaming response
    const agentResponseId = generateUniqueId();
    const agentResponse: Message = {
      id: agentResponseId,
      text: '',
      sender: 'agent',
      timestamp: new Date()
    };
    await unifiedChatStore.addMessage(agentResponse);

    // Track streaming state to handle tool call separation by step
    let currentMessageId = agentResponseId;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local tracking variable, not reactive state
    let toolCallMessageIdsByStep: Map<number, string> = new Map();
    let highestStepIndexSeen = 0;

    try {
      const chatService = getChatService();

      // Use streaming if available, otherwise fall back to regular sendMessage
      if (chatService.sendMessageStream) {
        currentRequestId = chatService.sendMessageStream(
          text,
          unifiedChatStore.activeThreadId || undefined,
          // onChunk: append text chunks to the current message
          async (chunk: string) => {
            const currentMessage = unifiedChatStore.activeThread?.messages?.find(
              (m) => m.id === currentMessageId
            );
            if (currentMessage) {
              await unifiedChatStore.updateMessage(currentMessageId, {
                text: currentMessage.text + chunk
              });
            }
          },
          // onComplete: streaming finished
          async (_fullText: string) => {
            // Mark the final step as completed
            if (toolCallMessageIdsByStep.size > 0) {
              const finalStepMessageId =
                toolCallMessageIdsByStep.get(highestStepIndexSeen);
              if (finalStepMessageId) {
                // Mark with a high index to indicate streaming is done
                await unifiedChatStore.updateMessage(finalStepMessageId, {
                  currentStepIndex: highestStepIndexSeen + 1
                });
              }
            }

            // Clean up any empty messages that were created
            const thread = unifiedChatStore.activeThread;
            if (thread) {
              // Filter out any empty messages (no text and no tool calls)
              const filteredMessages = thread.messages.filter((message) => {
                // Keep messages with text content
                if (message.text.trim() !== '') return true;
                // Keep messages with tool calls
                if (message.toolCalls && message.toolCalls.length > 0) return true;
                // Remove empty messages
                return false;
              });

              // Only update if we actually removed some messages
              if (filteredMessages.length !== thread.messages.length) {
                await unifiedChatStore.updateThread(thread.id, {
                  messages: filteredMessages
                });
              }
            }
            isLoadingResponse = false;
            currentRequestId = null;

            // Refresh OpenRouter credits after agent response completes
            if (refreshCredits) {
              await refreshCredits();
            }
          },
          // onError: handle streaming errors
          async (error: string) => {
            console.error('Streaming error:', error);
            await unifiedChatStore.updateMessage(currentMessageId, {
              text: 'Sorry, I encountered an error while processing your message.'
            });
            isLoadingResponse = false;
            currentRequestId = null;
          },
          modelStore.selectedModel,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (toolCall: any) => {
            // Group tool calls by step - each step gets its own message/widget
            const stepIndex = toolCall.stepIndex ?? 0;

            // If we've moved to a new step, mark the previous step's message as completed
            if (stepIndex > highestStepIndexSeen) {
              // Update the previous step's message with currentStepIndex to mark tools as completed
              const previousStepMessageId =
                toolCallMessageIdsByStep.get(highestStepIndexSeen);
              if (previousStepMessageId) {
                await unifiedChatStore.updateMessage(previousStepMessageId, {
                  currentStepIndex: stepIndex
                });
              }
              highestStepIndexSeen = stepIndex;
            }

            // Check if we already have a message for this step
            if (!toolCallMessageIdsByStep.has(stepIndex)) {
              // First tool call of this step - create a new message
              const toolCallMsg: Message = {
                id: generateUniqueId(),
                text: '',
                sender: 'agent',
                timestamp: new Date(),
                toolCalls: [toolCall],
                currentStepIndex: stepIndex // Track which step this message is for
              };
              toolCallMessageIdsByStep.set(stepIndex, toolCallMsg.id);
              await unifiedChatStore.addMessage(toolCallMsg);

              // Create a new message for any text that arrives after this step
              const postToolCallMessageId = generateUniqueId();
              const postToolCallMessage: Message = {
                id: postToolCallMessageId,
                text: '',
                sender: 'agent',
                timestamp: new Date()
              };
              await unifiedChatStore.addMessage(postToolCallMessage);
              currentMessageId = postToolCallMessageId;
            } else {
              // Add tool call to the existing message for this step
              const toolCallMessageId = toolCallMessageIdsByStep.get(stepIndex)!;
              const toolCallMessage = unifiedChatStore.activeThread?.messages?.find(
                (m) => m.id === toolCallMessageId
              );
              if (toolCallMessage) {
                const updatedToolCalls = [...(toolCallMessage.toolCalls || []), toolCall];
                await unifiedChatStore.updateMessage(toolCallMessageId, {
                  toolCalls: updatedToolCalls
                });
              }
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (toolResult: any) => {
            // Update the tool call with its result in the appropriate step's message
            const stepIndex = toolResult.stepIndex ?? 0;
            const toolCallMessageId = toolCallMessageIdsByStep.get(stepIndex);

            if (toolCallMessageId) {
              const toolCallMessage = unifiedChatStore.activeThread?.messages?.find(
                (m) => m.id === toolCallMessageId
              );
              if (toolCallMessage && toolCallMessage.toolCalls) {
                // Find the tool call by ID and update it with the result
                const updatedToolCalls = toolCallMessage.toolCalls.map((tc) =>
                  tc.id === toolResult.id ? { ...tc, result: toolResult.result } : tc
                );
                await unifiedChatStore.updateMessage(toolCallMessageId, {
                  toolCalls: updatedToolCalls
                });
              }
            }
          },
          (data) => {
            // Handle tool call limit reached
            toolCallLimitReached = {
              stepCount: data.stepCount,
              maxSteps: data.maxSteps
            };
          }
        );
      } else {
        // Fallback to non-streaming mode
        const response = await chatService.sendMessage(
          text,
          unifiedChatStore.activeThreadId || undefined,
          modelStore.selectedModel
        );

        // Update the placeholder message with the complete response
        await unifiedChatStore.updateMessage(agentResponseId, {
          text: response.text,
          toolCalls: response.toolCalls
        });

        isLoadingResponse = false;
        currentRequestId = null;
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      await unifiedChatStore.updateMessage(agentResponseId, {
        text: 'Sorry, I encountered an error while processing your message.'
      });
      isLoadingResponse = false;
      currentRequestId = null;
    }
  }

  // Hamburger menu state (for Windows/Linux)
  let hamburgerMenuOpen = $state(false);
  const isMacOS = $derived(
    typeof document !== 'undefined' &&
      document.documentElement.dataset.platform === 'macos'
  );

  function handleHamburgerClick(): void {
    if (isMacOS) {
      // On macOS, toggle the sidebar (menu is in system menu bar)
      sidebarState.toggleLeftSidebar();
    } else {
      // On Windows/Linux, toggle the hamburger menu
      hamburgerMenuOpen = !hamburgerMenuOpen;
    }
  }

  function closeHamburgerMenu(): void {
    hamburgerMenuOpen = false;
  }

  function setRightSidebarMode(mode: 'ai' | 'notes'): void {
    // If clicking the same mode that's already active and sidebar is visible, toggle the sidebar
    if (sidebarState.rightSidebar.visible && sidebarState.rightSidebar.mode === mode) {
      sidebarState.toggleRightSidebar();
    } else {
      // If sidebar is closed, open it first
      if (!sidebarState.rightSidebar.visible) {
        sidebarState.toggleRightSidebar();
      }
      sidebarState.setRightSidebarMode(mode);
    }
  }

  // Window control functions
  function minimizeWindow(): void {
    window.electron?.ipcRenderer.send('window-minimize');
  }

  function maximizeWindow(): void {
    window.electron?.ipcRenderer.send('window-maximize');
  }

  function closeWindow(): void {
    window.electron?.ipcRenderer.send('window-close');
  }

  // Handle vault creation from first-time experience
  async function handleVaultCreatedFromFirstTime(
    vault: CreateVaultResult
  ): Promise<void> {
    logger.debug('App.svelte: handleVaultCreatedFromFirstTime called with vault:', vault);
    logger.debug('App.svelte: vault.isNewVault =', vault.isNewVault);
    logger.debug('App.svelte: vault.initialNoteId =', vault.initialNoteId);

    // The vault availability service should already be updated by FirstTimeExperience
    // Now we need to trigger reinitialization of the note service and refresh stores
    try {
      // Reinitialize the note service in the main process
      const result = await window.api?.reinitializeNoteService();
      if (result?.success) {
        logger.debug('Note service reinitialized successfully');

        // Publish vault switched event - noteStore will automatically reinitialize
        messageBus.publish({
          type: 'vault.switched',
          vaultId: vault.id
        });
        logger.debug('Vault switched event published for vault:', vault.id);

        // Reinitialize the daily view store now that a vault is available
        await dailyViewStore.reinitialize();
        logger.debug('Daily view store reinitialized after vault creation');

        // NOW add initial note tab AFTER vault switching is complete
        // This ensures we have the correct vault ID in temporary tabs store
        logger.debug('App.svelte: Checking if should add initial note...');
        logger.debug('App.svelte: vault.isNewVault =', vault.isNewVault);
        logger.debug('App.svelte: vault.initialNoteId =', vault.initialNoteId);
        if (vault.isNewVault && vault.initialNoteId) {
          logger.debug('App.svelte: Adding initial note to tabs:', vault.initialNoteId);
          await workspacesStore.addTutorialNoteTabs([vault.initialNoteId]);
          logger.debug('App.svelte: Initial note added to tabs');
        } else {
          logger.debug('App.svelte: NOT adding initial note - conditions not met');
        }

        logger.debug(vault.isNewVault ? 'New vault created' : 'Existing vault opened');
      } else {
        console.error('Failed to reinitialize note service:', result?.error);
      }
    } catch (error) {
      console.error('Failed to reinitialize services after vault creation:', error);
    }
  }
</script>

{#if vaultAvailabilityService.isLoading}
  <!-- Loading state while checking for vaults -->
  <div class="app loading-state">
    <div class="loading-content">
      <div class="loading-spinner">🔥</div>
      <p>Loading Flint...</p>
    </div>
  </div>
{:else if !vaultAvailabilityService.hasVaults}
  <!-- First-time experience when no vaults exist -->
  <FirstTimeExperience onVaultCreated={handleVaultCreatedFromFirstTime} />
{:else}
  <!-- Normal app interface when vaults are available -->
  <div class="app">
    <!-- Drop overlay - captures all drag events when visible to prevent iframe interference -->
    {#if isDraggingFile}
      <div
        class="drop-overlay"
        role="region"
        aria-label="Drop zone"
        ondragover={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
          // Reset timeout to keep overlay visible
          if (dragTimeout) clearTimeout(dragTimeout);
          dragTimeout = setTimeout(() => {
            isDraggingFile = false;
            dragTimeout = null;
          }, 100);
        }}
        ondrop={(e) => {
          e.preventDefault();
          isDraggingFile = false;
          if (dragTimeout) {
            clearTimeout(dragTimeout);
            dragTimeout = null;
          }
          void processFileDrop(e);
        }}
        ondragleave={(e) => {
          // Only hide if leaving the window entirely
          if (e.relatedTarget === null) {
            isDraggingFile = false;
            if (dragTimeout) {
              clearTimeout(dragTimeout);
              dragTimeout = null;
            }
          }
        }}
      >
        <div class="drop-overlay-content">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <p>Drop PDF or EPUB to import</p>
        </div>
      </div>
    {/if}

    <!-- Invisible drag sensor - only visible when window is blurred (external drag) -->
    <!-- Catches drag events that enter directly over iframes when dragging from another app -->
    {#if windowBlurred && !isDraggingFile}
      <div
        class="drag-sensor"
        role="presentation"
        ondragenter={handleDragSensorDragEnter}
        ondragover={handleDragSensorDragOver}
        ondrop={handleDragSensorDrop}
        ondragleave={handleDragSensorDragLeave}
      ></div>
    {/if}

    <!-- Custom title bar with drag region -->
    <div class="title-bar">
      <div class="title-bar-content">
        <!-- Traffic light spacing for macOS -->
        <div class="traffic-light-spacer"></div>
        <div class="title-bar-left">
          <div class="hamburger-wrapper">
            <button
              class="hamburger-button"
              onclick={handleHamburgerClick}
              aria-label={isMacOS ? 'Toggle sidebar' : 'Open menu'}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <HamburgerMenu open={hamburgerMenuOpen} onClose={closeHamburgerMenu} />
          </div>
          <VaultSwitcher onNoteClose={closeNoteEditor} />
          <div class="navigation-controls">
            <button
              class="nav-btn"
              class:disabled={!noteNavigationService.canGoBack}
              onclick={handleNavigationBack}
              disabled={!noteNavigationService.canGoBack}
              aria-label="Go back"
              title="Go back (Cmd/Ctrl + Shift + [)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              class="nav-btn"
              class:disabled={!noteNavigationService.canGoForward}
              onclick={handleNavigationForward}
              disabled={!noteNavigationService.canGoForward}
              aria-label="Go forward"
              title="Go forward (Cmd/Ctrl + Shift + ])"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
          <SearchBar onNoteSelect={handleNoteSelect} />
        </div>
        <div class="title-bar-drag-center"></div>
        <div class="title-bar-controls">
          <UpdateIndicator />
          <div class="pillbox-controls">
            <button
              class="pillbox-btn pillbox-btn-left"
              class:active={sidebarState.rightSidebar.visible &&
                sidebarState.rightSidebar.mode === 'ai'}
              onclick={() => setRightSidebarMode('ai')}
              aria-label="AI Assistant"
              title="AI Assistant"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                ></path>
              </svg>
            </button>
            <button
              class="pillbox-btn pillbox-btn-middle"
              class:active={sidebarState.rightSidebar.visible &&
                sidebarState.rightSidebar.mode === 'notes'}
              onclick={() => setRightSidebarMode('notes')}
              aria-label="Notes Shelf"
              title="Notes Shelf"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                ></path>
              </svg>
            </button>
          </div>

          <!-- Window controls for non-macOS platforms -->
          <div class="window-controls">
            <button
              class="window-control-btn minimize-btn"
              onclick={minimizeWindow}
              aria-label="Minimize window"
              title="Minimize"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M 2,6 10,6" stroke="currentColor" stroke-width="1" />
              </svg>
            </button>
            <button
              class="window-control-btn maximize-btn"
              onclick={maximizeWindow}
              aria-label="Maximize window"
              title="Maximize"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  d="M 2,2 2,10 10,10 10,2 Z"
                  stroke="currentColor"
                  stroke-width="1"
                  fill="none"
                />
              </svg>
            </button>
            <button
              class="window-control-btn close-btn"
              onclick={closeWindow}
              aria-label="Close window"
              title="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M 3,3 9,9 M 9,3 3,9" stroke="currentColor" stroke-width="1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="app-layout">
      <LeftSidebar
        activeNote={activeNoteStore.activeNote}
        {activeSystemView}
        onNoteSelect={handleNoteSelect}
        onSystemViewSelect={handleSystemViewSelect}
        onCreateNote={(noteType) => handleCreateNote(noteType)}
        onImportFile={handleImportFile}
        onCaptureWebpage={handleCaptureWebpage}
      />

      <MainView
        activeNote={activeNoteStore.activeNote}
        {activeSystemView}
        noteTypes={notesStore.noteTypes}
        onClose={closeNoteEditor}
        onNoteSelect={handleNoteSelect}
        onCreateNote={handleCreateNote}
      />

      <RightSidebar
        {messages}
        isLoading={isLoadingResponse}
        onNoteClick={handleNoteClick}
        onSendMessage={handleSendMessage}
        onCancelMessage={handleCancelMessage}
        {toolCallLimitReached}
        onToolCallLimitContinue={handleToolCallLimitContinue}
        onToolCallLimitStop={handleToolCallLimitStop}
        onViewWorkflows={handleViewWorkflows}
        bind:refreshCredits
      />
    </div>

    <!-- External Edit Conflict Notifications -->
    <ExternalEditConflictNotification />

    <!-- Toast Notifications -->
    <ToastNotification />
  </div>

  <!-- Import Webpage Modal -->
  <ImportWebpageModal
    isOpen={showImportWebpageModal}
    onClose={() => (showImportWebpageModal = false)}
    onImport={handleImportWebpage}
  />

  <!-- Changelog Modal -->
  {#if showChangelog}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="changelog-modal-overlay" onclick={() => (showChangelog = false)}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="changelog-modal-content" onclick={(e) => e.stopPropagation()}>
        <ChangelogViewer
          version={appVersion}
          {isCanary}
          onClose={() => (showChangelog = false)}
        />
      </div>
    </div>
  {/if}
{/if}

<style>
  .app {
    height: 100vh;
    width: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
    display: flex;
    flex-direction: column;
  }

  .app.loading-state {
    align-items: center;
    justify-content: center;
  }

  .drop-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(var(--accent-primary-rgb, 59, 130, 246), 0.15);
    backdrop-filter: blur(2px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: all;
  }

  /* Invisible drag sensor - sits above everything to catch drag events even over iframes */
  .drag-sensor {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9998;
    pointer-events: all;
    background: transparent;
  }

  .drop-overlay-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem 3rem;
    background: var(--bg-primary);
    border: 2px dashed var(--accent-primary);
    border-radius: 12px;
    color: var(--accent-primary);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .drop-overlay-content svg {
    stroke: var(--accent-primary);
  }

  .drop-overlay-content p {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 500;
  }

  .loading-content {
    text-align: center;
    color: var(--text-secondary);
  }

  .loading-spinner {
    font-size: 3rem;
    margin-bottom: 1rem;
    animation: pulse 2s ease-in-out infinite alternate;
  }

  @keyframes pulse {
    from {
      opacity: 0.6;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1.05);
    }
  }

  .loading-content p {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 500;
  }

  .title-bar {
    height: 38px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
    -webkit-app-region: drag;
    user-select: none;
    flex-shrink: 0;
  }

  .title-bar-content {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0;
  }

  .traffic-light-spacer {
    width: 80px;
    height: 100%;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
  }

  /* Windows: hide traffic light spacer */
  :global(html[data-platform='other']) .traffic-light-spacer {
    display: none;
  }

  .title-bar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
  }

  .hamburger-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    height: 100%;
  }

  .hamburger-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .hamburger-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  /* Add padding around hamburger menu on Windows */
  :global(html[data-platform='other']) .hamburger-wrapper {
    margin-left: 0.5rem;
  }

  .title-bar-drag-center {
    flex: 1;
    height: 100%;
    -webkit-app-region: drag;
  }

  .navigation-controls {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.5rem;
    -webkit-app-region: no-drag;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .nav-btn:hover:not(.disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .nav-btn.disabled {
    color: var(--text-tertiary);
    cursor: not-allowed;
    opacity: 0.5;
  }

  .title-bar-controls {
    height: 100%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding-right: 0.75rem;
    -webkit-app-region: no-drag;
  }

  .pillbox-controls {
    display: flex;
    align-items: center;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    overflow: hidden;
  }

  .pillbox-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    width: 32px;
    height: 28px;
  }

  .pillbox-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .pillbox-btn.active {
    background: var(--accent-primary);
    color: var(--bg-primary);
  }

  .pillbox-btn-left {
    border-top-left-radius: 0.375rem;
    border-bottom-left-radius: 0.375rem;
  }

  .pillbox-btn.active + .pillbox-btn,
  .pillbox-btn + .pillbox-btn.active {
    border-left-color: transparent;
  }

  /* Window controls - shown on Windows/Linux, hidden on macOS (uses traffic lights) */
  .window-controls {
    display: flex;
    align-items: center;
    gap: 0;
  }

  :global(html[data-platform='macos']) .window-controls {
    display: none;
  }

  .window-control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 30px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background-color 0.2s ease;
    font-size: 12px;
  }

  .window-control-btn:hover {
    background: var(--bg-tertiary);
  }

  .window-control-btn.close-btn:hover {
    background: #e81123;
    color: white;
  }

  .window-control-btn svg {
    pointer-events: none;
  }

  .app-layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  /* Show title bar on all platforms when using custom frame */
  .title-bar {
    display: block;
  }

  /* Changelog modal styles */
  .changelog-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .changelog-modal-content {
    width: 90%;
    max-width: 800px;
    height: 80vh;
    background: var(--bg-primary);
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
</style>
