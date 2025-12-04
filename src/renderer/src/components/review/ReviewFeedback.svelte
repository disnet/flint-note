<script lang="ts">
  import MarkdownRenderer from '../MarkdownRenderer.svelte';
  import type { ReviewRating } from '../../types/review';
  import { RATING_LABELS, RATING_DESCRIPTIONS } from '../../types/review';

  interface Props {
    prompt: string;
    userResponse: string;
    feedback: string;
    onRate: (rating: ReviewRating) => void;
    isProcessing?: boolean;
  }

  let { prompt, userResponse, feedback, onRate, isProcessing = false }: Props = $props();

  // Handle keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent): void {
    if (isProcessing) return;

    // Number keys 1-4 for ratings
    if (event.key >= '1' && event.key <= '4') {
      event.preventDefault();
      onRate(parseInt(event.key) as ReviewRating);
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
      <div class="rating-prompt">How was this review session?</div>
      <div class="rating-buttons">
        <button
          class="rating-btn need-more-btn"
          onclick={() => onRate(1)}
          disabled={isProcessing}
          title="Press 1"
        >
          <span class="key-hint">1</span>
          <span class="label">{RATING_LABELS[1]}</span>
          <span class="schedule">{RATING_DESCRIPTIONS[1]}</span>
        </button>
        <button
          class="rating-btn productive-btn"
          onclick={() => onRate(2)}
          disabled={isProcessing}
          title="Press 2"
        >
          <span class="key-hint">2</span>
          <span class="label">{RATING_LABELS[2]}</span>
          <span class="schedule">{RATING_DESCRIPTIONS[2]}</span>
        </button>
        <button
          class="rating-btn familiar-btn"
          onclick={() => onRate(3)}
          disabled={isProcessing}
          title="Press 3"
        >
          <span class="key-hint">3</span>
          <span class="label">{RATING_LABELS[3]}</span>
          <span class="schedule">{RATING_DESCRIPTIONS[3]}</span>
        </button>
        <button
          class="rating-btn processed-btn"
          onclick={() => onRate(4)}
          disabled={isProcessing}
          title="Press 4"
        >
          <span class="key-hint">4</span>
          <span class="label">{RATING_LABELS[4]}</span>
          <span class="schedule">{RATING_DESCRIPTIONS[4]}</span>
        </button>
      </div>
      <div class="keyboard-hint">Press 1-4 to rate</div>
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
    border-left-color: var(--text-muted);
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
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .rating-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 1rem 1.25rem;
    border: 2px solid;
    border-radius: 8px;
    background: var(--bg-primary);
    cursor: pointer;
    transition: all 0.2s;
    min-width: 120px;
  }

  .rating-btn .key-hint {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  .rating-btn .label {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .rating-btn .schedule {
    font-size: 0.6875rem;
    color: var(--text-secondary);
  }

  .need-more-btn {
    border-color: var(--warning);
    color: var(--warning);
  }

  .need-more-btn:hover:not(:disabled) {
    background: var(--warning-hover);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);
  }

  .productive-btn {
    border-color: var(--success);
    color: var(--success);
  }

  .productive-btn:hover:not(:disabled) {
    background: var(--success-hover);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .familiar-btn {
    border-color: var(--accent-secondary);
    color: var(--accent-secondary);
  }

  .familiar-btn:hover:not(:disabled) {
    background: var(--accent-secondary);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .processed-btn {
    border-color: var(--text-muted);
    color: var(--text-muted);
  }

  .processed-btn:hover:not(:disabled) {
    background: var(--text-muted);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(107, 114, 128, 0.4);
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
    color: var(--text-muted);
    font-style: italic;
  }
</style>
