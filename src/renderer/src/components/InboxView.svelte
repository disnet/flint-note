<script lang="ts">
  // Future props for inbox functionality can be added here

  let inboxText = $state('');

  function handleSaveToInbox(): void {
    // TODO: Implement inbox capture functionality
    if (inboxText.trim()) {
      console.log('Saving to inbox:', inboxText);
      // Clear the input after saving
      inboxText = '';
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    // Ctrl/Cmd + Enter to save
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSaveToInbox();
    }
  }
</script>

<div class="inbox-view">
  <div class="inbox-header">
    <h1>Inbox</h1>
    <p class="inbox-subtitle">Quick capture a note for later saving...</p>
  </div>

  <div class="inbox-content">
    <div class="capture-section">
      <textarea 
        bind:value={inboxText}
        class="inbox-input" 
        placeholder="Capture thoughts quickly for later organization..."
        rows="8"
        onkeydown={handleKeyDown}
      ></textarea>
      
      <div class="inbox-actions">
        <div class="keyboard-hint">
          <span>⌘↵ to save</span>
        </div>
        <button 
          class="btn-primary" 
          onclick={handleSaveToInbox}
          disabled={!inboxText.trim()}
        >
          Save to Inbox
        </button>
      </div>
    </div>

    <!-- Future: Show recent inbox captures -->
    <div class="recent-captures">
      <h3>Recent Captures</h3>
      <div class="empty-captures">
        <p>No recent captures. Start capturing thoughts above!</p>
      </div>
    </div>
  </div>
</div>

<style>
  .inbox-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }

  .inbox-header {
    padding: 2rem 2rem 1rem 2rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .inbox-header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .inbox-subtitle {
    margin: 0;
    color: var(--text-secondary);
    font-size: 1rem;
  }

  .inbox-content {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .capture-section {
    max-width: 800px;
    width: 100%;
  }

  .inbox-input {
    width: 100%;
    padding: 1rem;
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.5;
    resize: vertical;
    min-height: 200px;
    margin-bottom: 1rem;
    transition: all 0.2s ease;
  }

  .inbox-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-primary-alpha);
  }

  .inbox-input::placeholder {
    color: var(--text-tertiary);
  }

  .inbox-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .keyboard-hint {
    font-size: 0.875rem;
    color: var(--text-tertiary);
  }

  .keyboard-hint span {
    padding: 0.25rem 0.5rem;
    background: var(--bg-tertiary);
    border-radius: 0.375rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .btn-primary {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--accent-primary);
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .recent-captures {
    max-width: 800px;
    width: 100%;
  }

  .recent-captures h3 {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .empty-captures {
    padding: 2rem;
    text-align: center;
    border: 2px dashed var(--border-light);
    border-radius: 0.75rem;
    background: var(--bg-secondary);
  }

  .empty-captures p {
    margin: 0;
    color: var(--text-tertiary);
    font-style: italic;
  }

  @media (max-width: 768px) {
    .inbox-header {
      padding: 1.5rem 1rem 1rem 1rem;
    }

    .inbox-header h1 {
      font-size: 1.75rem;
    }

    .inbox-content {
      padding: 1.5rem 1rem;
      gap: 1.5rem;
    }

    .keyboard-hint {
      display: none;
    }

    .inbox-actions {
      justify-content: flex-end;
    }
  }
</style>