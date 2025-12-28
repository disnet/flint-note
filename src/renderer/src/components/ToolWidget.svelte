<script lang="ts">
  /**
   * ToolWidget - Compact widget showing tool call status
   *
   * Displayed at the bottom of the chat panel (above input) to show:
   * - Running state: spinner + current tool name
   * - Idle state: checkmark + total tool call count
   * Click to expand the tool overlay.
   */
  import type { AggregatedToolCall } from '../lib/automerge/chat-service.svelte';

  interface Props {
    /** All tool calls aggregated from the conversation */
    allToolCalls: AggregatedToolCall[];
    /** Whether any tool is currently running */
    isRunning: boolean;
    /** Current running tool name */
    currentToolName?: string;
    /** Whether the overlay is currently open */
    isExpanded: boolean;
    /** Toggle overlay callback */
    onToggle: () => void;
  }

  let { allToolCalls, isRunning, currentToolName, isExpanded, onToggle }: Props =
    $props();

  // Format tool name for display (replace underscores with spaces)
  const displayToolName = $derived(currentToolName?.replace(/_/g, ' ') ?? 'Working...');

  // Total count of tool calls
  const toolCount = $derived(allToolCalls.length);
</script>

<button
  type="button"
  class="tool-widget"
  class:running={isRunning}
  class:idle={!isRunning}
  onclick={onToggle}
  aria-expanded={isExpanded}
  aria-label={isRunning ? `Tool running: ${displayToolName}` : `${toolCount} tool calls`}
>
  <span class="tool-widget-icon">
    {#if isRunning}
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

  <span class="tool-widget-text">
    {#if isRunning}
      {displayToolName}
    {:else}
      {toolCount} tool call{toolCount !== 1 ? 's' : ''}
    {/if}
  </span>

  <span class="tool-widget-expand">
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

<style>
  .tool-widget {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    margin-bottom: 8px;
    background: var(--bg-tertiary, var(--bg-secondary));
    border: 1px solid var(--border-light);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.8125rem;
  }

  .tool-widget:hover {
    background: var(--bg-hover);
    border-color: var(--border-medium, var(--border-light));
  }

  .tool-widget.running {
    background: var(--accent-primary-light, rgba(59, 130, 246, 0.1));
    border-color: var(--accent-primary);
  }

  .tool-widget.running .tool-widget-text,
  .tool-widget.running .tool-widget-icon {
    color: var(--accent-primary);
  }

  .tool-widget.idle {
    background: var(--success-bg, rgba(34, 197, 94, 0.1));
    border-color: var(--success-text, #22c55e);
  }

  .tool-widget.idle .tool-widget-text,
  .tool-widget.idle .tool-widget-icon {
    color: var(--success-text, #22c55e);
  }

  .tool-widget-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
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

  .tool-widget-text {
    flex: 1;
    color: var(--text-secondary);
    text-align: left;
    text-transform: capitalize;
  }

  .tool-widget-expand {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    flex-shrink: 0;
  }
</style>
