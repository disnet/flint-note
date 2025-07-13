<script lang="ts">
  import type { ToolCallInfo } from '../types/chat';

  interface Props {
    toolCalls: ToolCallInfo[];
  }

  let { toolCalls }: Props = $props();
  let isExpanded = $state(false);

  const formatDuration = (duration?: number): string => {
    if (!duration) return '';
    if (duration < 1000) return `${Math.round(duration)}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const formatArguments = (args: Record<string, any>): string => {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  };

  const toggleExpanded = (): void => {
    isExpanded = !isExpanded;
  };
</script>

<div class="tool-call-widget">
  <button class="tool-call-header" onclick={toggleExpanded}>
    <div class="tool-call-summary">
      <span class="tool-icon">🔧</span>
      <span class="tool-text">
        Used {toolCalls.length} tool{toolCalls.length === 1 ? '' : 's'}
      </span>
      {#if toolCalls.some(tc => tc.error)}
        <span class="error-indicator">⚠️</span>
      {/if}
    </div>
    <div class="expand-icon" class:expanded={isExpanded}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M3 4.5L6 7.5L9 4.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  </button>

  {#if isExpanded}
    <div class="tool-call-details">
      {#each toolCalls as toolCall, index}
        <div class="tool-call-item">
          <div class="tool-call-name">
            <span class="tool-icon-small">🔧</span>
            <strong>{toolCall.name}</strong>
            {#if toolCall.duration}
              <span class="duration">({formatDuration(toolCall.duration)})</span>
            {/if}
            {#if toolCall.error}
              <span class="error-badge">Error</span>
            {/if}
          </div>

          <div class="tool-call-content">
            <div class="arguments-section">
              <div class="section-label">Arguments:</div>
              <pre class="code-block">{formatArguments(toolCall.arguments)}</pre>
            </div>

            {#if toolCall.result}
              <div class="result-section">
                <div class="section-label">Result:</div>
                <pre class="code-block result">{toolCall.result}</pre>
              </div>
            {/if}

            {#if toolCall.error}
              <div class="error-section">
                <div class="section-label">Error:</div>
                <pre class="code-block error">{toolCall.error}</pre>
              </div>
            {/if}
          </div>

          {#if index < toolCalls.length - 1}
            <div class="tool-call-separator"></div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tool-call-widget {
    margin: 0.75rem 0;
    border: 1px solid #e1e5e9;
    border-radius: 8px;
    background-color: #f8f9fa;
    overflow: hidden;
    max-width: 80%;
  }

  .tool-call-header {
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background-color 0.2s;
  }

  .tool-call-header:hover {
    background-color: #e9ecef;
  }

  .tool-call-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #495057;
  }

  .tool-icon {
    font-size: 1rem;
  }

  .tool-text {
    font-weight: 500;
  }

  .error-indicator {
    font-size: 0.75rem;
  }

  .expand-icon {
    color: #6c757d;
    transition: transform 0.2s;
  }

  .expand-icon.expanded {
    transform: rotate(180deg);
  }

  .tool-call-details {
    border-top: 1px solid #e1e5e9;
    background-color: #ffffff;
  }

  .tool-call-item {
    padding: 1rem;
  }

  .tool-call-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
  }

  .tool-icon-small {
    font-size: 0.875rem;
  }

  .duration {
    color: #6c757d;
    font-weight: normal;
    font-size: 0.8rem;
  }

  .error-badge {
    background-color: #dc3545;
    color: white;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: normal;
  }

  .tool-call-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #495057;
    margin-bottom: 0.25rem;
  }

  .code-block {
    background-color: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 4px;
    padding: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
    font-size: 0.8rem;
    line-height: 1.4;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .code-block.result {
    background-color: #f0f8f0;
    border-color: #c3e6c3;
  }

  .code-block.error {
    background-color: #fdf2f2;
    border-color: #f5c6cb;
    color: #721c24;
  }

  .tool-call-separator {
    height: 1px;
    background-color: #e9ecef;
    margin: 1rem 0 0 0;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .tool-call-widget {
      border-color: #495057;
      background-color: #343a40;
    }

    .tool-call-header:hover {
      background-color: #495057;
    }

    .tool-call-summary {
      color: #adb5bd;
    }

    .tool-call-details {
      border-top-color: #495057;
      background-color: #212529;
    }

    .section-label {
      color: #adb5bd;
    }

    .duration {
      color: #6c757d;
    }

    .code-block {
      background-color: #343a40;
      border-color: #495057;
      color: #e9ecef;
    }

    .code-block.result {
      background-color: #1e3a1e;
      border-color: #28a745;
    }

    .code-block.error {
      background-color: #3a1e1e;
      border-color: #dc3545;
      color: #f8d7da;
    }

    .tool-call-separator {
      background-color: #495057;
    }
  }
</style>
