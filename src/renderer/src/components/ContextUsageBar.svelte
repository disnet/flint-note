<script lang="ts">
  import type { ContextUsage } from '../services/types';

  interface Props {
    contextUsage: ContextUsage | null;
    onWarningClick?: () => void;
  }

  let { contextUsage, onWarningClick }: Props = $props();

  let expanded = $state(false);

  const warningColors = {
    none: 'var(--accent)',
    warning: 'var(--warning)',
    critical: 'var(--error)',
    full: 'var(--error-dark)'
  };

  const warningLabels = {
    none: 'Normal',
    warning: 'Approaching limit',
    critical: 'Near capacity',
    full: 'At capacity'
  };

  function formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num);
  }

  function getBarColor(): string {
    if (!contextUsage) return warningColors.none;
    return warningColors[contextUsage.warningLevel];
  }

  function shouldShowWarning(): boolean {
    return (
      contextUsage !== null &&
      (contextUsage.warningLevel === 'warning' ||
        contextUsage.warningLevel === 'critical' ||
        contextUsage.warningLevel === 'full')
    );
  }
</script>

{#if contextUsage}
  <div class="context-usage-bar" class:has-warning={shouldShowWarning()}>
    <button
      class="usage-header"
      onclick={() => (expanded = !expanded)}
      title="Click to {expanded ? 'collapse' : 'expand'} context details"
    >
      <div class="usage-info">
        <span class="usage-label">Context:</span>
        <span class="usage-percentage" style="color: {getBarColor()}">
          {contextUsage.percentage.toFixed(1)}%
        </span>
        <span class="usage-tokens">
          {formatNumber(contextUsage.totalTokens)} / {formatNumber(
            contextUsage.maxTokens
          )}
        </span>
      </div>
      <div class="usage-bar-container">
        <div
          class="usage-bar-fill"
          style="width: {Math.min(
            100,
            contextUsage.percentage
          )}%; background-color: {getBarColor()}"
        ></div>
      </div>
      <span class="expand-icon">{expanded ? '▼' : '▶'}</span>
    </button>

    {#if expanded}
      <div class="usage-details">
        <div class="detail-row">
          <span class="detail-label">System Prompt:</span>
          <span class="detail-value"
            >{formatNumber(contextUsage.systemPromptTokens)} tokens</span
          >
        </div>
        <div class="detail-row">
          <span class="detail-label">Conversation History:</span>
          <span class="detail-value">
            {formatNumber(contextUsage.conversationHistoryTokens)} tokens
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Estimated Messages Remaining:</span>
          <span class="detail-value">{contextUsage.estimatedMessagesRemaining}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status:</span>
          <span class="detail-value" style="color: {getBarColor()}">
            {warningLabels[contextUsage.warningLevel]}
          </span>
        </div>
      </div>
    {/if}

    {#if shouldShowWarning() && onWarningClick}
      <button class="warning-action" onclick={onWarningClick}>
        ⚠️ Context {contextUsage.warningLevel === 'full' ? 'Full' : 'Warning'} - Start New
        Thread
      </button>
    {/if}
  </div>
{/if}

<style>
  .context-usage-bar {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 0.75rem;
    margin-bottom: 1rem;
    transition: all 0.2s ease;
  }

  .context-usage-bar.has-warning {
    border-color: var(--warning);
    background: var(--bg-warning);
  }

  .usage-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .usage-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .usage-label {
    font-weight: 500;
    color: var(--text-secondary);
  }

  .usage-percentage {
    font-weight: 600;
    font-size: 1rem;
  }

  .usage-tokens {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
  }

  .usage-bar-container {
    flex: 1;
    height: 6px;
    background: var(--bg-tertiary);
    border-radius: 3px;
    overflow: hidden;
  }

  .usage-bar-fill {
    height: 100%;
    transition:
      width 0.3s ease,
      background-color 0.3s ease;
  }

  .expand-icon {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    transition: transform 0.2s ease;
  }

  .usage-details {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8125rem;
  }

  .detail-label {
    color: var(--text-secondary);
  }

  .detail-value {
    font-weight: 500;
    color: var(--text-primary);
  }

  .warning-action {
    width: 100%;
    margin-top: 0.75rem;
    padding: 0.5rem;
    background: var(--warning);
    color: var(--text-on-accent);
    border: none;
    border-radius: 0.375rem;
    font-weight: 500;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .warning-action:hover {
    background: var(--warning-hover);
    transform: translateY(-1px);
  }

  .warning-action:active {
    transform: translateY(0);
  }
</style>
