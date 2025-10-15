<script lang="ts">
  import type { ToolCall } from '../services/types';
  import JsonViewer from './JsonViewer.svelte';

  let { toolCalls }: { toolCalls: ToolCall[] } = $props();
  let isExpanded = $state(false);

  function toggleExpanded(): void {
    isExpanded = !isExpanded;
  }

  // Derive status counts from tool calls
  const statusCounts = $derived.by(() => {
    let pending = 0;
    let running = 0;
    let success = 0;
    let error = 0;

    toolCalls.forEach((tc) => {
      if (tc.error) {
        error++;
      } else if (tc.result) {
        success++;
      } else if (tc.result === undefined && !tc.error) {
        // Tool call exists but no result yet - could be running or pending
        running++;
      } else {
        pending++;
      }
    });

    return { pending, running, success, error };
  });

  const overallStatus = $derived.by(() => {
    if (statusCounts.error > 0) return 'error';
    if (statusCounts.running > 0) return 'running';
    if (statusCounts.pending > 0) return 'pending';
    return 'success';
  });

  const summaryText = $derived.by(() => {
    const parts: string[] = [];

    if (statusCounts.success > 0) {
      parts.push(`${statusCounts.success} completed`);
    }
    if (statusCounts.running > 0) {
      parts.push(`${statusCounts.running} running`);
    }
    if (statusCounts.pending > 0) {
      parts.push(`${statusCounts.pending} pending`);
    }
    if (statusCounts.error > 0) {
      parts.push(`${statusCounts.error} failed`);
    }

    return parts.join(', ');
  });

  function getToolIcon(toolName: string): string {
    // Map common tool names to icons
    const iconMap: Record<string, string> = {
      get_note: '📄',
      create_note: '➕',
      update_note: '✏️',
      delete_note: '🗑️',
      search_notes: '🔍',
      list_notes: '📋',
      get_vault_info: '🏛️',
      create_note_type: '🏗️',
      update_note_type: '🔧',
      evaluate_note_code: '⚙️'
    };

    return iconMap[toolName] || '🔧';
  }

  function getToolCallStatus(
    toolCall: ToolCall
  ): 'pending' | 'running' | 'success' | 'error' {
    if (toolCall.error) return 'error';
    if (toolCall.result) return 'success';
    if (toolCall.result === undefined && !toolCall.error) return 'running';
    return 'pending';
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'running':
        return '⚙️';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '🔧';
    }
  }
</script>

<div class="agent-activity" class:expanded={isExpanded}>
  <button class="activity-header" onclick={toggleExpanded}>
    <div class="activity-info">
      <span class="activity-icon">{getStatusIcon(overallStatus)}</span>
      <span class="activity-title">Agent Activity</span>
      <span class="activity-summary">({summaryText})</span>
    </div>
    <span class="expand-icon" class:rotated={isExpanded}>▼</span>
  </button>

  {#if isExpanded}
    <div class="activity-details">
      {#each toolCalls as toolCall (toolCall.id)}
        {@const status = getToolCallStatus(toolCall)}
        <div class="tool-item" class:error={status === 'error'}>
          <div class="tool-header">
            <span class="tool-status-icon">{getStatusIcon(status)}</span>
            <span class="tool-icon">{getToolIcon(toolCall.name)}</span>
            <span class="tool-name">{toolCall.name}</span>
          </div>

          {#if toolCall.arguments && Object.keys(toolCall.arguments).length > 0}
            <div class="tool-section">
              <h5>Arguments</h5>
              <div class="json-container">
                <JsonViewer value={toolCall.arguments} isRoot={true} />
              </div>
            </div>
          {/if}

          {#if toolCall.result}
            <div class="tool-section">
              <h5>Result</h5>
              <div class="json-container">
                {#if typeof toolCall.result === 'string'}
                  <div class="result-content">{toolCall.result}</div>
                {:else}
                  <JsonViewer value={toolCall.result} isRoot={true} />
                {/if}
              </div>
            </div>
          {/if}

          {#if toolCall.error}
            <div class="tool-section">
              <h5>Error</h5>
              <div class="error-content">{toolCall.error}</div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .agent-activity {
    background: var(--tool-call-bg, #f8f9fa);
    border: 1px solid var(--tool-call-border, #e9ecef);
    border-radius: 8px;
    margin: 0.5rem 0;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .agent-activity:hover {
    border-color: var(--tool-call-border-hover, #dee2e6);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .activity-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.2s ease;
  }

  .activity-header:hover {
    background: var(--tool-call-header-hover, #f1f3f4);
  }

  .activity-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .activity-icon {
    font-size: 1.2rem;
  }

  .activity-title {
    font-weight: 600;
    color: var(--tool-name-color, #495057);
  }

  .activity-summary {
    font-size: 0.875rem;
    color: var(--text-secondary, #6c757d);
    font-weight: 400;
  }

  .expand-icon {
    font-size: 0.75rem;
    transition: transform 0.2s ease;
    color: var(--expand-icon-color, #6c757d);
  }

  .expand-icon.rotated {
    transform: rotate(180deg);
  }

  .activity-details {
    border-top: 1px solid var(--tool-call-border, #e9ecef);
    padding: 1rem;
    background: var(--tool-call-details-bg, #ffffff);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .tool-item {
    padding: 0.75rem;
    background: var(--bg-secondary, #f8f9fa);
    border: 1px solid var(--border-light, #e9ecef);
    border-radius: 6px;
  }

  .tool-item.error {
    border-color: var(--error-border, #f5c2c7);
    background: var(--error-bg-light, #fff5f5);
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .tool-status-icon {
    font-size: 1rem;
  }

  .tool-icon {
    font-size: 1.1rem;
  }

  .tool-name {
    font-weight: 600;
    color: var(--tool-name-color, #495057);
    font-family:
      'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New',
      monospace;
    font-size: 0.875rem;
  }

  .tool-section {
    margin-top: 0.75rem;
  }

  .tool-section h5 {
    margin: 0 0 0.5rem 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--details-heading-color, #495057);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .json-container {
    background: var(--code-bg, #f8f9fa);
    border: 1px solid var(--code-border, #e9ecef);
    border-radius: 4px;
    padding: 0.5rem;
    overflow-x: auto;
    font-size: 0.8rem;
  }

  .result-content {
    background: var(--result-bg, #f8f9fa);
    border: 1px solid var(--result-border, #e9ecef);
    border-radius: 4px;
    padding: 0.75rem;
    font-size: 0.875rem;
    color: var(--result-text, #495057);
    white-space: pre-wrap;
    line-height: 1.5;
  }

  .error-content {
    background: var(--error-content-bg, #f8d7da);
    border: 1px solid var(--error-content-border, #f5c2c7);
    border-radius: 4px;
    padding: 0.75rem;
    font-size: 0.875rem;
    color: var(--error-content-text, #721c24);
    white-space: pre-wrap;
    line-height: 1.5;
  }
</style>
