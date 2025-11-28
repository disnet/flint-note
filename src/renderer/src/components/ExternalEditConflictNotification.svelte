<script lang="ts">
  import { messageBus } from '../services/messageBus.svelte';
  import { noteDocumentRegistry } from '../stores/noteDocumentRegistry.svelte';

  interface ConflictNotification {
    id: string;
    noteId: string;
    path: string;
    timestamp: number;
  }

  let conflicts = $state<ConflictNotification[]>([]);

  // Listen for conflict events
  $effect(() => {
    console.log('[Conflict] Setting up listener for external-edit-conflict events');
    const unsubscribe = messageBus.subscribe('file.external-edit-conflict', (event) => {
      console.log('[Conflict] ⚠️ External edit conflict detected:', event);

      // Add to conflicts list
      const conflict: ConflictNotification = {
        id: `${event.noteId}-${Date.now()}`,
        noteId: event.noteId,
        path: event.path,
        timestamp: Date.now()
      };

      conflicts = [...conflicts, conflict];
    });

    return () => {
      unsubscribe();
    };
  });

  function dismissConflict(id: string): void {
    conflicts = conflicts.filter((c) => c.id !== id);
  }

  async function reloadNote(noteId: string, conflictId: string): Promise<void> {
    try {
      // Get the document for this note
      const doc = noteDocumentRegistry.get(noteId);
      if (doc) {
        // Reload from disk
        await doc.reload();
        console.log('[Conflict] Note reloaded from disk:', noteId);
      }

      // Dismiss the conflict notification
      dismissConflict(conflictId);
    } catch (error) {
      console.error('[Conflict] Failed to reload note:', error);
    }
  }

  function keepLocalVersion(conflictId: string): void {
    // Just dismiss - user wants to keep their local changes
    dismissConflict(conflictId);
  }
</script>

{#if conflicts.length > 0}
  <div class="conflict-notifications">
    {#each conflicts as conflict (conflict.id)}
      <div class="conflict-notification">
        <div class="conflict-content">
          <div class="conflict-icon">⚠️</div>
          <div class="conflict-message">
            <strong>External Edit Detected</strong>
            <p>The note you're editing was modified externally</p>
          </div>
        </div>
        <div class="conflict-actions">
          <button
            class="conflict-btn reload-btn"
            onclick={() => reloadNote(conflict.noteId, conflict.id)}
          >
            Reload from Disk
          </button>
          <button
            class="conflict-btn keep-btn"
            onclick={() => keepLocalVersion(conflict.id)}
          >
            Keep My Changes
          </button>
          <button
            class="conflict-btn dismiss-btn"
            onclick={() => dismissConflict(conflict.id)}
          >
            Dismiss
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .conflict-notifications {
    position: fixed;
    top: 60px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 400px;
  }

  .conflict-notification {
    background: var(--bg-secondary);
    border: 2px solid var(--accent-warning, #f59e0b);
    border-radius: 0.5rem;
    padding: 1rem;
    box-shadow:
      0 4px 6px rgba(0, 0, 0, 0.1),
      0 2px 4px rgba(0, 0, 0, 0.06);
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .conflict-content {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .conflict-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .conflict-message {
    flex: 1;
  }

  .conflict-message strong {
    display: block;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .conflict-message p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .conflict-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .conflict-btn {
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border-light);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .conflict-btn:hover {
    background: var(--bg-primary);
    border-color: var(--border-medium);
  }

  .reload-btn {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  .reload-btn:hover {
    background: var(--accent-primary-hover, var(--accent-primary));
    filter: brightness(1.1);
  }

  .keep-btn {
    background: var(--bg-secondary);
  }

  .dismiss-btn {
    background: var(--bg-tertiary);
    color: var(--text-tertiary);
  }
</style>
