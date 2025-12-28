<script lang="ts">
  /**
   * ToolOverlay - Popup overlay showing all tool calls from conversation
   *
   * Displays as a floating panel above the tool widget with:
   * - Scrollable list of tool calls
   * - Expandable details for each tool call (args and result)
   * - Copy button for each tool call
   * Dismissable by clicking outside or pressing Escape.
   */
  import type { AggregatedToolCall } from '../lib/automerge/chat-service.svelte';

  interface Props {
    /** All tool calls to display */
    toolCalls: AggregatedToolCall[];
    /** Callback when overlay should close */
    onClose: () => void;
    /** Callback to copy tool call JSON */
    onCopy?: (toolCall: AggregatedToolCall) => void;
  }

  let { toolCalls, onClose, onCopy }: Props = $props();

  // Track which tool calls are expanded
  let expandedIds = $state<Set<string>>(new Set());

  function toggleExpanded(id: string): void {
    const newSet = new Set(expandedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    expandedIds = newSet;
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function formatToolName(name: string): string {
    return name.replace(/_/g, ' ');
  }

  function formatJson(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  // Get status icon
  function getStatusIcon(status: AggregatedToolCall['status']): string {
    switch (status) {
      case 'running':
        return 'spinner';
      case 'completed':
        return 'check';
      case 'error':
        return 'error';
      default:
        return 'pending';
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tool-overlay-backdrop" onclick={handleBackdropClick}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="tool-overlay" onclick={(e) => e.stopPropagation()}>
    <div class="tool-overlay-header">
      <span class="tool-overlay-title">Tool Calls ({toolCalls.length})</span>
      <button type="button" class="close-btn" onclick={onClose} aria-label="Close">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <div class="tool-overlay-list">
      {#each toolCalls as toolCall (toolCall.id)}
        {@const isExpanded = expandedIds.has(toolCall.id)}
        {@const statusIcon = getStatusIcon(toolCall.status)}
        <div class="tool-item" class:expanded={isExpanded}>
          <button
            type="button"
            class="tool-item-header"
            onclick={() => toggleExpanded(toolCall.id)}
          >
            <span
              class="tool-status"
              class:running={statusIcon === 'spinner'}
              class:completed={statusIcon === 'check'}
              class:error={statusIcon === 'error'}
            >
              {#if statusIcon === 'spinner'}
                <span class="spinner"></span>
              {:else if statusIcon === 'check'}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              {:else if statusIcon === 'error'}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              {:else}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>
              {/if}
            </span>
            <div class="tool-info">
              <span class="tool-name">{formatToolName(toolCall.name)}</span>
              {#if toolCall.commentary}
                <span class="tool-commentary">{toolCall.commentary}</span>
              {/if}
            </div>
            <span class="expand-icon">
              {#if isExpanded}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              {:else}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              {/if}
            </span>
          </button>

          {#if isExpanded}
            <div class="tool-item-details">
              {#if toolCall.args && Object.keys(toolCall.args).length > 0}
                <div class="detail-section">
                  <div class="detail-label">Arguments</div>
                  <pre class="detail-code">{formatJson(toolCall.args)}</pre>
                </div>
              {/if}

              {#if toolCall.result !== undefined}
                <div class="detail-section">
                  <div class="detail-label">Result</div>
                  <pre class="detail-code">{formatJson(toolCall.result)}</pre>
                </div>
              {/if}

              {#if toolCall.error}
                <div class="detail-section error">
                  <div class="detail-label">Error</div>
                  <pre class="detail-code">{toolCall.error}</pre>
                </div>
              {/if}

              {#if onCopy}
                <button type="button" class="copy-btn" onclick={() => onCopy(toolCall)}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                    ></path>
                  </svg>
                  Copy JSON
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .tool-overlay-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(2px);
    z-index: 100;
  }

  .tool-overlay {
    position: absolute;
    bottom: 60px;
    right: 24px;
    width: 400px;
    max-height: 350px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.15),
      0 4px 16px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    animation: slideUp 0.15s ease-out;
    display: flex;
    flex-direction: column;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tool-overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .tool-overlay-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tool-overlay-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .tool-item {
    border-bottom: 1px solid var(--border-light);
  }

  .tool-item:last-child {
    border-bottom: none;
  }

  .tool-item-header {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 16px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    font-size: 0.8125rem;
    color: var(--text-primary);
  }

  .tool-item-header:hover {
    background: var(--bg-hover);
  }

  .tool-status {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .tool-status.running {
    color: var(--accent-primary);
  }

  .tool-status.completed {
    color: var(--success-text, #22c55e);
  }

  .tool-status.error {
    color: var(--error-text, #dc3545);
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .tool-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tool-name {
    text-transform: capitalize;
    font-weight: 500;
  }

  .tool-commentary {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .tool-item-details {
    padding: 0 16px 12px;
    background: var(--bg-secondary);
    animation: expandIn 0.15s ease-out;
  }

  @keyframes expandIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .detail-section {
    margin-top: 10px;
  }

  .detail-section.error .detail-code {
    color: var(--error-text, #dc3545);
  }

  .detail-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 4px;
  }

  .detail-code {
    margin: 0;
    padding: 8px 10px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    font-size: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    color: var(--text-secondary);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 120px;
    overflow-y: auto;
  }

  .copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding: 6px 10px;
    border: 1px solid var(--border-light);
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .copy-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--border-medium, var(--border-light));
  }

  /* Scrollbar styling */
  .tool-overlay-list::-webkit-scrollbar,
  .detail-code::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .tool-overlay-list::-webkit-scrollbar-track,
  .detail-code::-webkit-scrollbar-track {
    background: transparent;
  }

  .tool-overlay-list::-webkit-scrollbar-thumb,
  .detail-code::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(0, 0, 0, 0.2));
    border-radius: 3px;
  }

  .tool-overlay-list::-webkit-scrollbar-thumb:hover,
  .detail-code::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover, rgba(0, 0, 0, 0.3));
  }
</style>
