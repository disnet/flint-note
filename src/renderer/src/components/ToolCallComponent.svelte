<script lang="ts">
  import type { ToolCall } from '../services/types';

  let { toolCall }: { toolCall: ToolCall } = $props();
  let isExpanded = $state(false);

  function toggleExpanded(): void {
    isExpanded = !isExpanded;
  }

  function formatArguments(args: Record<string, unknown> | null | undefined): string {
    if (!args) return 'No arguments';
    return JSON.stringify(args, null, 2);
  }

  function getToolIcon(toolName: string): string {
    switch (toolName) {
      case 'weather':
        return '🌤️';
      case 'get_weather':
        return '🌤️';
      case 'get_forecast':
        return '📅';
      default:
        return '🔧';
    }
  }
</script>

<div class="tool-call" class:expanded={isExpanded}>
  <button class="tool-call-header" onclick={toggleExpanded}>
    <div class="tool-call-info">
      <span class="tool-icon">{getToolIcon(toolCall.name)}</span>
      <span class="tool-name">{toolCall.name}</span>
      <span class="tool-args">
        {toolCall.arguments
          ? Object.keys(toolCall.arguments)
              .map((key) => `${key}: ${toolCall.arguments[key]}`)
              .join(', ')
          : ''}
      </span>
    </div>
    <div class="tool-call-status">
      {#if toolCall.error}
        <span class="status error">❌ Error</span>
      {:else if toolCall.result}
        <span class="status success">✅ Success</span>
      {:else}
        <span class="status pending">⏳ Running</span>
      {/if}
      <span class="expand-icon" class:rotated={isExpanded}>▼</span>
    </div>
  </button>

  {#if isExpanded}
    <div class="tool-call-details">
      <div class="details-section">
        <h4>Arguments</h4>
        <pre class="code-block">{formatArguments(toolCall.arguments)}</pre>
      </div>

      {#if toolCall.result}
        <div class="details-section">
          <h4>Result</h4>
          <div class="result-content">
            {typeof toolCall.result === 'string'
              ? toolCall.result
              : JSON.stringify(toolCall.result, null, 2)}
          </div>
        </div>
      {/if}

      {#if toolCall.error}
        <div class="details-section">
          <h4>Error</h4>
          <div class="error-content">{toolCall.error}</div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool-call {
    background: var(--tool-call-bg, #f8f9fa);
    border: 1px solid var(--tool-call-border, #e9ecef);
    border-radius: 8px;
    margin: 0.5rem 0;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .tool-call:hover {
    border-color: var(--tool-call-border-hover, #dee2e6);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .tool-call-header {
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

  .tool-call-header:hover {
    background: var(--tool-call-header-hover, #f1f3f4);
  }

  .tool-call-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .tool-icon {
    font-size: 1.2rem;
  }

  .tool-name {
    font-weight: 600;
    color: var(--tool-name-color, #495057);
    font-family:
      'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New',
      monospace;
  }

  .tool-args {
    color: var(--tool-args-color, #6c757d);
    font-size: 0.875rem;
    font-family:
      'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New',
      monospace;
  }

  .tool-call-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status.success {
    background: var(--success-bg, #d4edda);
    color: var(--success-text, #155724);
  }

  .status.error {
    background: var(--error-bg, #f8d7da);
    color: var(--error-text, #721c24);
  }

  .status.pending {
    background: var(--pending-bg, #fff3cd);
    color: var(--pending-text, #856404);
  }

  .expand-icon {
    font-size: 0.75rem;
    transition: transform 0.2s ease;
    color: var(--expand-icon-color, #6c757d);
  }

  .expand-icon.rotated {
    transform: rotate(180deg);
  }

  .tool-call-details {
    border-top: 1px solid var(--tool-call-border, #e9ecef);
    padding: 1rem;
    background: var(--tool-call-details-bg, #ffffff);
  }

  .details-section {
    margin-bottom: 1rem;
  }

  .details-section:last-child {
    margin-bottom: 0;
  }

  .details-section h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--details-heading-color, #495057);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .code-block {
    background: var(--code-bg, #f8f9fa);
    border: 1px solid var(--code-border, #e9ecef);
    border-radius: 4px;
    padding: 0.75rem;
    font-family:
      'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New',
      monospace;
    font-size: 0.8rem;
    color: var(--code-text, #495057);
    overflow-x: auto;
    margin: 0;
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
