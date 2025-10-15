<script lang="ts">
  import type { ContextUsage } from '../services/types';

  interface Props {
    contextUsage: ContextUsage | null;
    onWarningClick?: () => void;
  }

  let { contextUsage, onWarningClick }: Props = $props();

  const warningColors = {
    none: 'var(--accent-primary)',
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
  <div class="context-widget" class:warning={shouldShowWarning()}>
    <svg class="progress-circle" viewBox="0 0 36 36">
      <!-- Background circle -->
      <circle
        class="circle-bg"
        cx="18"
        cy="18"
        r="15.5"
        fill="none"
        stroke="var(--border-medium)"
        stroke-width="2"
      />
      <!-- Progress circle -->
      <circle
        class="circle-progress"
        cx="18"
        cy="18"
        r="15.5"
        fill="none"
        stroke={getBarColor()}
        stroke-width="2"
        stroke-dasharray="{(contextUsage.percentage / 100) * 97.4}, 97.4"
        stroke-linecap="round"
        transform="rotate(-90 18 18)"
      />
    </svg>
    <div class="tooltip">
      <div class="tooltip-header">
        <span class="tooltip-label">Context Usage</span>
        <span class="tooltip-percentage" style="color: {getBarColor()}">
          {contextUsage.percentage.toFixed(1)}%
        </span>
      </div>
      <div class="tooltip-detail">
        <span class="detail-label">Total:</span>
        <span class="detail-value"
          >{formatNumber(contextUsage.totalTokens)} / {formatNumber(
            contextUsage.maxTokens
          )} tokens</span
        >
      </div>
      <div class="tooltip-detail">
        <span class="detail-label">System:</span>
        <span class="detail-value"
          >{formatNumber(contextUsage.systemPromptTokens)} tokens</span
        >
      </div>
      <div class="tooltip-detail">
        <span class="detail-label">Conversation:</span>
        <span class="detail-value"
          >{formatNumber(contextUsage.conversationHistoryTokens)} tokens</span
        >
      </div>
      <div class="tooltip-detail">
        <span class="detail-label">Est. messages left:</span>
        <span class="detail-value">{contextUsage.estimatedMessagesRemaining}</span>
      </div>
      <div class="tooltip-detail">
        <span class="detail-label">Status:</span>
        <span class="detail-value" style="color: {getBarColor()}">
          {warningLabels[contextUsage.warningLevel]}
        </span>
      </div>
      {#if shouldShowWarning() && onWarningClick}
        <button class="warning-button" onclick={onWarningClick}>
          Start New Thread
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .context-widget {
    position: relative;
    width: 24px;
    height: 24px;
    overflow: visible;
    cursor: help;
  }

  .context-widget.warning {
    animation: pulse-warning 2s ease-in-out infinite;
  }

  @keyframes pulse-warning {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }

  .progress-circle {
    width: 100%;
    height: 100%;
    transform: rotate(0deg);
  }

  .circle-progress {
    transition: stroke-dasharray 0.3s ease;
  }

  .tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    padding: 0.75rem;
    min-width: 240px;
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.1),
      0 2px 4px -2px rgb(0 0 0 / 0.1);
    opacity: 0;
    pointer-events: none;
    transform: translateY(4px);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
    z-index: 1000;
  }

  .context-widget:hover .tooltip {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    right: 12px;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--bg-secondary);
  }

  .tooltip-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .tooltip-label {
    font-weight: 600;
    font-size: 0.8125rem;
    color: var(--text-primary);
  }

  .tooltip-percentage {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .tooltip-detail {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0.375rem 0;
    font-size: 0.75rem;
  }

  .detail-label {
    color: var(--text-secondary);
  }

  .detail-value {
    font-weight: 500;
    color: var(--text-primary);
  }

  .warning-button {
    width: 100%;
    margin-top: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: var(--warning);
    color: var(--text-on-accent);
    border: none;
    border-radius: 0.25rem;
    font-weight: 500;
    font-size: 0.6875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .warning-button:hover {
    background: var(--warning-hover);
    transform: translateY(-1px);
  }

  .warning-button:active {
    transform: translateY(0);
  }
</style>
