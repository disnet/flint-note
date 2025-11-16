<script lang="ts">
  import MarkdownRenderer from '../MarkdownRenderer.svelte';

  interface Props {
    prompt: string;
    userResponse: string;
    feedback: string;
    onPass: () => void;
    onFail: () => void;
    isProcessing?: boolean;
  }

  let {
    prompt,
    userResponse,
    feedback,
    onPass,
    onFail,
    isProcessing = false
  }: Props = $props();

  // Handle keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent): void {
    if (isProcessing) return;

    if (event.key === 'p' || event.key === 'P') {
      event.preventDefault();
      onPass();
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      onFail();
    }
  }

  $effect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="review-feedback">
  <div class="feedback-content">
    <div class="prompt-section collapsed">
      <div class="section-label">Review Prompt:</div>
      <div class="section-content">
        <MarkdownRenderer text={prompt} />
      </div>
    </div>

    <div class="response-section">
      <div class="section-label">Your Response:</div>
      <div class="section-content user-response">
        {userResponse}
      </div>
    </div>

    <div class="feedback-section">
      <div class="section-label">Feedback:</div>
      <div class="section-content">
        <MarkdownRenderer text={feedback} />
      </div>
    </div>
  </div>

  <div class="feedback-controls">
    <div class="rating-section">
      <div class="rating-prompt">Did you understand this concept well?</div>
      <div class="rating-buttons">
        <button
          class="rating-btn fail-btn"
          onclick={onFail}
          disabled={isProcessing}
          title="Press F"
        >
          <span class="icon">✗</span>
          <span class="label">Fail</span>
          <span class="schedule">Review tomorrow</span>
        </button>
        <button
          class="rating-btn pass-btn"
          onclick={onPass}
          disabled={isProcessing}
          title="Press P"
        >
          <span class="icon">✓</span>
          <span class="label">Pass</span>
          <span class="schedule">Review in 7 days</span>
        </button>
      </div>
      <div class="keyboard-hint">Keyboard shortcuts: P for Pass · F for Fail</div>
    </div>
  </div>
</div>

<style>
  .review-feedback {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
  }

  .feedback-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
    min-height: 0;
  }

  .feedback-controls {
    flex-shrink: 0;
  }

  .prompt-section,
  .response-section,
  .feedback-section {
    padding: 1.5rem;
    border-radius: 4px;
    border-left: 4px solid var(--border);
  }

  .prompt-section.collapsed {
    background: var(--bg-tertiary);
    border-left-color: var(--text-tertiary);
  }

  .response-section {
    background: var(--bg-secondary);
    border-left-color: var(--accent-secondary);
  }

  .feedback-section {
    background: var(--bg-secondary);
    border-left-color: var(--success);
  }

  .section-label {
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
    color: var(--text-secondary);
  }

  .section-content {
    color: var(--text-primary);
    line-height: 1.6;
  }

  .user-response {
    white-space: pre-wrap;
    font-family: inherit;
  }

  .rating-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 2px solid var(--border);
  }

  .rating-prompt {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .rating-buttons {
    display: flex;
    gap: 1rem;
  }

  .rating-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem 2rem;
    border: 2px solid;
    border-radius: 8px;
    background: var(--bg-primary);
    cursor: pointer;
    transition: all 0.2s;
    min-width: 150px;
  }

  .rating-btn .icon {
    font-size: 2rem;
    font-weight: bold;
  }

  .rating-btn .label {
    font-size: 1.125rem;
    font-weight: 600;
  }

  .rating-btn .schedule {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .fail-btn {
    border-color: var(--warning);
    color: var(--warning);
  }

  .fail-btn:hover:not(:disabled) {
    background: var(--warning-hover);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);
  }

  .pass-btn {
    border-color: var(--success);
    color: var(--success);
  }

  .pass-btn:hover:not(:disabled) {
    background: var(--success-hover);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .rating-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .rating-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .keyboard-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-style: italic;
  }
</style>
