<script lang="ts">
  import { inboxStore } from '../stores/inboxStore.svelte';
  import { getChatService } from '../services/chatService';
  import { notesStore } from '../services/noteStore.svelte';
  import { wikilinkService } from '../services/wikilinkService.svelte';

  let newNoteTitle = $state('');
  let isCreatingNote = $state(false);
  let currentVaultId = $state<string | null>(null);

  // Reactive getters from store
  const notes = $derived(inboxStore.notes);
  const loading = $derived(inboxStore.isLoading);
  const error = $derived(inboxStore.error);
  const showProcessed = $derived(inboxStore.showProcessed);

  // Helper function to format relative time
  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins < 1) return 'just now';
        return `${diffMins} min ago`;
      }
      if (diffHours === 1) return '1 hour ago';
      return `${diffHours} hours ago`;
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // Helper function to get type icon
  function getTypeIcon(typeName: string): string | undefined {
    const noteType = notesStore.noteTypes.find((t) => t.name === typeName);
    return noteType?.icon;
  }

  // Load inbox notes when component mounts
  $effect(() => {
    loadInboxData();
  });

  async function loadInboxData(): Promise<void> {
    try {
      const chatService = getChatService();
      const vault = await chatService.getCurrentVault();
      if (vault) {
        currentVaultId = vault.id;
        await inboxStore.loadInboxNotes(vault.id);
      }
    } catch (error) {
      console.error('Failed to load inbox:', error);
    }
  }

  async function handleCreateNote(): Promise<void> {
    if (!newNoteTitle.trim() || isCreatingNote || !currentVaultId) {
      return;
    }

    isCreatingNote = true;

    try {
      const chatService = getChatService();

      // Create the note with the entered title
      await chatService.createNote({
        type: 'note',
        identifier: newNoteTitle.trim(),
        content: '',
        vaultId: currentVaultId
      });

      // Note: The message bus will automatically update the note cache when IPC events are published

      // Refresh inbox to show the new note
      await inboxStore.refresh(currentVaultId);

      // Clear the input
      newNoteTitle = '';
    } catch (error) {
      console.error('Failed to create note:', error);
    } finally {
      isCreatingNote = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCreateNote();
    }
  }

  async function handleMarkAsProcessed(noteId: string): Promise<void> {
    if (!currentVaultId) return;

    await inboxStore.markAsProcessed(noteId, currentVaultId);
  }

  async function handleUnmarkAsProcessed(noteId: string): Promise<void> {
    if (!currentVaultId) return;

    await inboxStore.unmarkAsProcessed(noteId, currentVaultId);
  }

  async function handleToggleView(): Promise<void> {
    inboxStore.showProcessed = !showProcessed;
    if (currentVaultId) {
      await inboxStore.loadInboxNotes(currentVaultId);
    }
  }

  async function handleMarkAllAsProcessed(): Promise<void> {
    if (!currentVaultId) return;
    await inboxStore.markAllAsProcessed(currentVaultId);
  }

  async function handleMarkAllAsUnprocessed(): Promise<void> {
    if (!currentVaultId) return;
    await inboxStore.markAllAsUnprocessed(currentVaultId);
  }

  function handleNoteClick(noteId: string, event: MouseEvent): void {
    // Find the full note metadata
    const note = notesStore.notes.find((n) => n.id === noteId);
    if (note) {
      wikilinkService.handleWikilinkClick(noteId, note.title, false, event.shiftKey);
    }
  }
</script>

<div class="inbox-view">
  <div class="inbox-header">
    <h2>📥 Inbox</h2>
    <div class="header-actions">
      {#if notes.length > 0}
        {#if showProcessed}
          <button
            class="action-button"
            onclick={handleMarkAllAsUnprocessed}
            title="Mark all as unprocessed"
          >
            ✕ All
          </button>
        {:else}
          <button
            class="action-button"
            onclick={handleMarkAllAsProcessed}
            title="Mark all as processed"
          >
            ✓ All
          </button>
        {/if}
      {/if}
      <button
        class="toggle-button"
        onclick={handleToggleView}
        title="Toggle between unprocessed and processed notes"
      >
        <span class="toggle-option" class:active={!showProcessed}>
          <span class="toggle-icon">⏺</span>
          Unprocessed
        </span>
        <span class="toggle-separator">|</span>
        <span class="toggle-option" class:active={showProcessed}>
          <span class="toggle-icon">✓</span>
          Processed
        </span>
      </button>
    </div>
  </div>

  {#if error}
    <div class="error-message">
      <p>{error}</p>
    </div>
  {/if}

  <div class="inbox-content">
    <!-- Quick create input -->
    <div class="quick-create">
      <input
        type="text"
        class="create-input"
        placeholder="enter title to create new note..."
        bind:value={newNoteTitle}
        onkeydown={handleKeyDown}
        disabled={isCreatingNote}
      />
    </div>

    <!-- Notes list -->
    <div class="notes-container">
      {#if loading && notes.length === 0}
        <div class="empty-state">Loading notes...</div>
      {:else if notes.length > 0}
        <div class="notes-list">
          {#each notes as note (note.id)}
            <div class="note-card">
              <div class="note-header">
                <button
                  class="note-title"
                  onclick={(e) => handleNoteClick(note.id, e)}
                  title="Open note"
                >
                  {note.title || 'Untitled'}
                </button>
                {#if showProcessed}
                  <button
                    class="check-button"
                    onclick={() => handleUnmarkAsProcessed(note.id)}
                    title="Move back to unprocessed"
                    aria-label="Move note back to unprocessed"
                  >
                    ↻
                  </button>
                {:else}
                  <button
                    class="check-button"
                    onclick={() => handleMarkAsProcessed(note.id)}
                    title="Mark as processed"
                    aria-label="Mark note as processed"
                  >
                    ✓
                  </button>
                {/if}
              </div>
              <div class="note-meta">
                <span class="meta-date">{formatRelativeTime(note.created)}</span>
                {#if getTypeIcon(note.type)}
                  <span class="type-icon">{getTypeIcon(note.type)}</span>
                {/if}
                <span class="type-name">{note.type}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <p>{showProcessed ? 'No processed notes' : 'No unprocessed notes'}</p>
          <p class="empty-hint">
            {showProcessed
              ? 'Notes you process will appear here'
              : 'Create a note above or notes you create will appear here'}
          </p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .inbox-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    padding: 0.5rem;
  }

  .inbox-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .inbox-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .action-button {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
  }

  .action-button:hover {
    background: var(--accent-light);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .toggle-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toggle-button:hover {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .toggle-option {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    color: var(--text-secondary);
    transition: all 0.2s ease;
    font-weight: 500;
    min-width: 5.5rem;
    white-space: nowrap;
  }

  .toggle-option.active {
    background: var(--accent-primary);
    color: white;
  }

  .toggle-icon {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .toggle-option.active .toggle-icon {
    opacity: 1;
  }

  .toggle-separator {
    color: var(--border-medium);
    font-weight: 300;
  }

  .error-message {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 0.75rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
    border-left: 4px solid var(--error-border, #ef4444);
  }

  .error-message p {
    margin: 0;
    font-size: 0.875rem;
  }

  .inbox-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 0 0.5rem;
  }

  .quick-create {
    margin-bottom: 1rem;
  }

  .create-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .create-input::placeholder {
    color: var(--text-placeholder);
  }

  .create-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    background: var(--bg-primary);
  }

  .create-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .notes-container {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .notes-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: fadeIn 0.2s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .note-card {
    background: var(--bg-secondary);
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .note-card:hover {
    border-color: var(--accent-primary);
  }

  .note-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }

  .note-title {
    margin: 0;
    padding: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.4;
    flex: 1;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: color 0.2s;
  }

  .note-title:hover {
    color: var(--accent-primary);
    text-decoration: underline;
  }

  .check-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .check-button:hover {
    background: var(--accent-light);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .note-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .meta-date {
    font-weight: 500;
  }

  .type-icon {
    font-size: 0.875rem;
  }

  .type-name {
    font-weight: 500;
    text-transform: capitalize;
  }

  .empty-state {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary);
    animation: fadeIn 0.2s ease-in-out;
  }

  .empty-state p {
    margin: 0.25rem 0;
  }

  .empty-hint {
    font-size: 0.875rem;
    opacity: 0.7;
  }
</style>
