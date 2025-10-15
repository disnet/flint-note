<script lang="ts">
  interface Props {
    stepCount: number;
    maxSteps: number;
    onContinue: () => void;
    onStop: () => void;
  }

  let { stepCount, maxSteps, onContinue, onStop }: Props = $props();
</script>

<div class="tool-call-limit-widget">
  <div class="limit-content">
    <div class="limit-icon">⚠️</div>
    <div class="limit-info">
      <div class="limit-title">
        Tool call limit reached ({stepCount}/{maxSteps} steps used)
      </div>
      <div class="limit-description">
        The agent was stopped to prevent excessive API usage. You can continue if needed.
      </div>
    </div>
    <div class="limit-actions">
      <button class="continue-btn" onclick={onContinue}>Continue</button>
      <button class="stop-btn" onclick={onStop}>Stop</button>
    </div>
  </div>
</div>

<style>
  .tool-call-limit-widget {
    margin: 1rem 0;
    padding: 1rem;
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .limit-content {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .limit-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .limit-info {
    flex: 1;
    min-width: 0;
  }

  .limit-title {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .limit-description {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .limit-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .continue-btn,
  .stop-btn {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .continue-btn {
    background-color: var(--primary-color, #007bff);
    color: white;
  }

  .continue-btn:hover {
    background-color: var(--primary-color-hover, #0056b3);
  }

  .stop-btn {
    background-color: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
  }

  .stop-btn:hover {
    background-color: var(--bg-hover);
  }

  @media (max-width: 640px) {
    .limit-content {
      flex-direction: column;
      align-items: stretch;
    }

    .limit-actions {
      width: 100%;
      justify-content: stretch;
    }

    .continue-btn,
    .stop-btn {
      flex: 1;
    }
  }
</style>
