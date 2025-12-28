<script lang="ts">
  /**
   * InlineToolWidget - Inline widget showing tool activity per message
   *
   * Displays in the message thread to show:
   * - Thinking state: pulsing "Thinking..." when no tool calls yet
   * - Working state: spinner + current tool name during execution
   * - Complete state: checkmark + tool count summary
   * Click to expand in-place and see all tool calls with details.
   */
  import { SvelteSet } from 'svelte/reactivity';
  import type { ToolCall } from '../lib/automerge/chat-service.svelte';

  interface Props {
    /** Tool calls for this message */
    toolCalls: ToolCall[];
    /** Whether tools are currently active (streaming) */
    isActive: boolean;
    /** Current step name if active */
    currentStep?: string;
    /** Callback to copy tool call JSON */
    onCopy?: (toolCall: ToolCall) => void;
  }

  let { toolCalls, isActive, currentStep, onCopy }: Props = $props();

  let isExpanded = $state(false);

  // Track which tool calls have expanded details
  let expandedIds = new SvelteSet<string>();

  // Determine display state
  const widgetState = $derived.by(() => {
    if (isActive && toolCalls.length === 0) return 'thinking';
    if (isActive) return 'working';
    return 'complete';
  });

  // Current running tool (for working state)
  const runningTool = $derived(toolCalls.find((tc) => tc.status === 'running'));

  // Display text for collapsed state
  const summaryText = $derived.by(() => {
    switch (widgetState) {
      case 'thinking':
        return 'Thinking...';
      case 'working':
        return formatToolName(runningTool?.name ?? currentStep ?? 'Working...');
      case 'complete':
        return `Used ${toolCalls.length} tool${toolCalls.length !== 1 ? 's' : ''}`;
    }
  });

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

  function toggleExpanded(): void {
    isExpanded = !isExpanded;
  }

  function toggleToolDetails(id: string): void {
    if (expandedIds.has(id)) {
      expandedIds.delete(id);
    } else {
      expandedIds.add(id);
    }
  }

  function getStatusIcon(status: ToolCall['status']): string {
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

<div
  class="inline-tool-widget"
  class:thinking={widgetState === 'thinking'}
  class:working={widgetState === 'working'}
  class:complete={widgetState === 'complete'}
>
  <!-- Collapsed header -->
  <button
    type="button"
    class="widget-header"
    onclick={toggleExpanded}
    disabled={widgetState === 'thinking'}
    aria-expanded={isExpanded}
    aria-label={summaryText}
  >
    <span class="widget-icon">
      {#if widgetState === 'thinking'}
        <span class="pulse-dot"></span>
      {:else if widgetState === 'working'}
        <span class="spinner"></span>
      {:else}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      {/if}
    </span>

    <span class="widget-text">{summaryText}</span>

    {#if widgetState !== 'thinking'}
      <span class="widget-expand">
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
    {/if}
  </button>

  <!-- Expanded details (in-place, not overlay) -->
  {#if isExpanded && toolCalls.length > 0}
    <div class="widget-details">
      {#each toolCalls as toolCall (toolCall.id)}
        {@const isToolExpanded = expandedIds.has(toolCall.id)}
        {@const statusIcon = getStatusIcon(toolCall.status)}
        <div class="tool-item" class:expanded={isToolExpanded}>
          <button
            type="button"
            class="tool-item-header"
            onclick={() => toggleToolDetails(toolCall.id)}
          >
            <span
              class="tool-status"
              class:running={statusIcon === 'spinner'}
              class:completed={statusIcon === 'check'}
              class:error={statusIcon === 'error'}
            >
              {#if statusIcon === 'spinner'}
                <span class="spinner small"></span>
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
              {#if isToolExpanded}
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

          {#if isToolExpanded}
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
  {/if}
</div>

<style>
  .inline-tool-widget {
    width: 100%;
    margin: 8px 0;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border-light);
    background: var(--bg-tertiary, var(--bg-secondary));
  }

  /* State-specific styling */
  .inline-tool-widget.thinking {
    background: var(--bg-tertiary, var(--bg-secondary));
    border-color: var(--border-light);
  }

  .inline-tool-widget.working {
    background: var(--accent-primary-light, rgba(59, 130, 246, 0.1));
    border-color: var(--accent-primary);
  }

  .inline-tool-widget.complete {
    background: var(--success-bg, rgba(34, 197, 94, 0.1));
    border-color: var(--success-text, #22c55e);
  }

  /* Header button */
  .widget-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.8125rem;
    text-align: left;
    transition: background 0.15s ease;
  }

  .widget-header:disabled {
    cursor: default;
  }

  .widget-header:not(:disabled):hover {
    background: rgba(0, 0, 0, 0.05);
  }

  .widget-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .inline-tool-widget.thinking .widget-icon,
  .inline-tool-widget.thinking .widget-text {
    color: var(--text-muted);
  }

  .inline-tool-widget.working .widget-icon,
  .inline-tool-widget.working .widget-text {
    color: var(--accent-primary);
  }

  .inline-tool-widget.complete .widget-icon,
  .inline-tool-widget.complete .widget-text {
    color: var(--success-text, #22c55e);
  }

  .widget-text {
    flex: 1;
    text-transform: capitalize;
  }

  .widget-expand {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  /* Pulse animation for thinking state */
  .pulse-dot {
    width: 10px;
    height: 10px;
    background: currentColor;
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Spinner animation */
  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 10px;
    height: 10px;
    border-width: 1.5px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Expanded details section */
  .widget-details {
    border-top: 1px solid var(--border-light);
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
    background: var(--bg-primary);
    animation: expandIn 0.15s ease-out;
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
    background: var(--bg-secondary);
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
    background: var(--bg-secondary);
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
  .detail-code::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .detail-code::-webkit-scrollbar-track {
    background: transparent;
  }

  .detail-code::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(0, 0, 0, 0.2));
    border-radius: 3px;
  }

  .detail-code::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover, rgba(0, 0, 0, 0.3));
  }
</style>
