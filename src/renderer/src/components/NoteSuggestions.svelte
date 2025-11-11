<script lang="ts">
  import { onMount } from 'svelte';

  interface NoteSuggestion {
    id: string;
    type: string;
    text: string;
    priority?: 'high' | 'medium' | 'low';
    data?: Record<string, unknown>;
    reasoning?: string;
  }

  interface Props {
    noteId: string;
    contentHash?: string;
  }

  let { noteId, contentHash }: Props = $props();

  let suggestions = $state<NoteSuggestion[]>([]);
  let loading = $state(false);
  let generating = $state(false);
  let error = $state<string | null>(null);
  let expanded = $state(true);

  onMount(() => {
    loadSuggestions();
  });

  // Reload suggestions when note changes
  $effect(() => {
    // Create dependency on noteId
    void noteId;
    loadSuggestions();
  });

  async function loadSuggestions() {
    if (!noteId) return;

    loading = true;
    error = null;
    try {
      const result = await window.api?.getNoteSuggestions({ noteId });
      suggestions = result?.suggestions || [];
    } catch (err) {
      error = 'Failed to load suggestions';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function dismissSuggestion(suggestionId: string) {
    try {
      await window.api?.dismissNoteSuggestion({ noteId, suggestionId });
      suggestions = suggestions.filter((s) => s.id !== suggestionId);
    } catch (err) {
      console.error('Failed to dismiss suggestion:', err);
    }
  }

  async function regenerate() {
    generating = true;
    error = null;
    try {
      const result = await window.api?.generateNoteSuggestions({ noteId });
      suggestions = result?.suggestions || [];
    } catch (err) {
      error = 'Failed to generate suggestions';
      console.error(err);
    } finally {
      generating = false;
    }
  }

  function toggleExpanded() {
    expanded = !expanded;
  }

  function getPriorityClass(priority?: string): string {
    switch (priority) {
      case 'high':
        return 'priority-high';
      case 'medium':
        return 'priority-medium';
      case 'low':
        return 'priority-low';
      default:
        return '';
    }
  }
</script>

<div class="suggestions-panel">
  <div class="suggestions-header">
    <button
      class="expand-button"
      onclick={toggleExpanded}
      aria-label={expanded ? 'Collapse suggestions' : 'Expand suggestions'}
    >
      <span class="expand-icon">{expanded ? '▼' : '▶'}</span>
      <h3>Suggestions</h3>
      {#if suggestions.length > 0}
        <span class="badge">{suggestions.length}</span>
      {/if}
    </button>
    <button
      class="regenerate-button"
      onclick={regenerate}
      disabled={loading || generating}
      title="Generate new suggestions"
    >
      {generating ? '⟳' : '↻'}
    </button>
  </div>

  {#if expanded}
    <div class="suggestions-content">
      {#if loading}
        <div class="loading">
          <div class="spinner"></div>
          <span>Loading suggestions...</span>
        </div>
      {:else if error}
        <div class="error">{error}</div>
      {:else if generating}
        <div class="generating">
          <div class="spinner"></div>
          <span>Generating suggestions...</span>
        </div>
      {:else if suggestions.length === 0}
        <div class="empty">
          <p>No suggestions available</p>
          <button class="generate-button" onclick={regenerate}>Generate Suggestions</button>
        </div>
      {:else}
        <ul class="suggestions-list">
          {#each suggestions as suggestion (suggestion.id)}
            <li class="suggestion-item {getPriorityClass(suggestion.priority)}">
              <div class="suggestion-content">
                <div class="suggestion-header">
                  <span class="suggestion-type">{suggestion.type}</span>
                  {#if suggestion.priority}
                    <span class="suggestion-priority">{suggestion.priority}</span>
                  {/if}
                </div>
                <p class="suggestion-text">{suggestion.text}</p>
                {#if suggestion.reasoning}
                  <details class="suggestion-reasoning">
                    <summary>Why?</summary>
                    <p>{suggestion.reasoning}</p>
                  </details>
                {/if}
              </div>
              <button
                class="dismiss-button"
                onclick={() => dismissSuggestion(suggestion.id)}
                title="Dismiss"
                aria-label="Dismiss suggestion"
              >
                ×
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .suggestions-panel {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .suggestions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-color);
  }

  .expand-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--text-primary);
    font-size: inherit;
    flex: 1;
  }

  .expand-button:hover {
    color: var(--accent-color);
  }

  .expand-icon {
    font-size: 0.75rem;
    transition: transform 0.2s;
  }

  .suggestions-header h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .badge {
    background: var(--accent-color);
    color: white;
    padding: 0.125rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .regenerate-button {
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 0.25rem;
    transition: all 0.2s;
  }

  .regenerate-button:hover:not(:disabled) {
    color: var(--accent-color);
    transform: rotate(180deg);
  }

  .regenerate-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .suggestions-content {
    padding: 1rem;
  }

  .loading,
  .generating {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem;
    justify-content: center;
    color: var(--text-secondary);
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--border-color);
    border-top-color: var(--accent-color);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error {
    padding: 1rem;
    background: var(--error-bg);
    color: var(--error-color);
    border-radius: 4px;
  }

  .empty {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--text-secondary);
  }

  .empty p {
    margin: 0 0 1rem;
  }

  .generate-button {
    background: var(--accent-color);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: opacity 0.2s;
  }

  .generate-button:hover {
    opacity: 0.9;
  }

  .suggestions-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .suggestion-item {
    display: flex;
    gap: 0.75rem;
    padding: 0.875rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    transition: border-color 0.2s;
  }

  .suggestion-item:hover {
    border-color: var(--accent-color-dim);
  }

  .suggestion-item.priority-high {
    border-left: 3px solid var(--error-color);
  }

  .suggestion-item.priority-medium {
    border-left: 3px solid var(--warning-color);
  }

  .suggestion-item.priority-low {
    border-left: 3px solid var(--info-color);
  }

  .suggestion-content {
    flex: 1;
    min-width: 0;
  }

  .suggestion-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .suggestion-type {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--accent-color);
    letter-spacing: 0.5px;
  }

  .suggestion-priority {
    font-size: 0.7rem;
    padding: 0.125rem 0.375rem;
    background: var(--bg-tertiary);
    border-radius: 3px;
    color: var(--text-secondary);
  }

  .suggestion-text {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--text-primary);
  }

  .suggestion-reasoning {
    margin-top: 0.5rem;
    font-size: 0.8rem;
  }

  .suggestion-reasoning summary {
    cursor: pointer;
    color: var(--text-secondary);
    user-select: none;
  }

  .suggestion-reasoning summary:hover {
    color: var(--accent-color);
  }

  .suggestion-reasoning p {
    margin: 0.5rem 0 0;
    padding: 0.5rem;
    background: var(--bg-tertiary);
    border-radius: 4px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .dismiss-button {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    background: none;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    color: var(--text-secondary);
    transition: color 0.2s;
  }

  .dismiss-button:hover {
    color: var(--error-color);
  }
</style>
