<script lang="ts">
  import MarkdownRenderer from '../MarkdownRenderer.svelte';

  interface Props {
    noteTitle: string;
    currentIndex: number;
    totalNotes: number;
    prompt: string;
    userResponse: string;
    onResponseChange: (value: string) => void;
    onSubmit: () => void;
    onShowNote: () => void;
    onSkip: () => void;
    onEndSession: () => void;
    isSubmitting?: boolean;
  }

  let {
    noteTitle,
    currentIndex,
    totalNotes,
    prompt,
    userResponse,
    onResponseChange,
    onSubmit,
    onShowNote,
    onSkip,
    onEndSession,
    isSubmitting = false
  }: Props = $props();

  let textareaRef: HTMLTextAreaElement;

  // Handle keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!isSubmitting && userResponse.trim()) {
        onSubmit();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onEndSession();
    }
  }

  // Auto-focus textarea when component mounts
  $effect(() => {
    if (textareaRef) {
      textareaRef.focus();
    }
  });
</script>

<div class="review-prompt">
  <div class="header">
    <h2>Reviewing: {noteTitle}</h2>
    <div class="progress">Note {currentIndex + 1} of {totalNotes}</div>
  </div>

  <div class="prompt-section">
    <div class="prompt-label">Review Challenge:</div>
    <div class="prompt-content">
      <MarkdownRenderer text={prompt} />
    </div>
  </div>

  <div class="response-section">
    <label for="response-textarea" class="response-label">Your Response:</label>
    <textarea
      id="response-textarea"
      bind:this={textareaRef}
      bind:value={userResponse}
      oninput={(e) => onResponseChange((e.target as HTMLTextAreaElement).value)}
      onkeydown={handleKeyDown}
      placeholder="Type your explanation here..."
      rows="8"
      disabled={isSubmitting}
    ></textarea>
    <div class="response-hint">
      Tip: Press Cmd/Ctrl+Enter to submit · Escape to end session
    </div>
  </div>

  <div class="actions">
    <div class="secondary-actions">
      <button class="action-btn secondary" onclick={onShowNote} disabled={isSubmitting}>
        Show Note Content
      </button>
      <button class="action-btn secondary" onclick={onSkip} disabled={isSubmitting}>
        Skip
      </button>
      <button class="action-btn secondary" onclick={onEndSession} disabled={isSubmitting}>
        End Session
      </button>
    </div>
    <button
      class="action-btn primary"
      onclick={onSubmit}
      disabled={isSubmitting || !userResponse.trim()}
    >
      {isSubmitting ? 'Submitting...' : 'Submit Response'}
    </button>
  </div>
</div>

<style>
  .review-prompt {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--color-border);
  }

  .header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--color-text-primary);
  }

  .progress {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    background: var(--color-background-secondary);
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  .prompt-section {
    background: var(--color-background-secondary);
    border-left: 4px solid var(--color-accent);
    padding: 1.5rem;
    border-radius: 4px;
  }

  .prompt-label {
    font-weight: 600;
    color: var(--color-accent);
    margin-bottom: 1rem;
    text-transform: uppercase;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  .prompt-content {
    color: var(--color-text-primary);
    line-height: 1.6;
  }

  .response-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .response-label {
    font-weight: 600;
    color: var(--color-text-primary);
    font-size: 0.875rem;
  }

  textarea {
    width: 100%;
    padding: 1rem;
    border: 2px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-background-primary);
    color: var(--color-text-primary);
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.6;
    resize: vertical;
    min-height: 150px;
    transition: border-color 0.2s;
  }

  textarea:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .response-hint {
    font-size: 0.75rem;
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
  }

  .secondary-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-size: 0.875rem;
  }

  .action-btn.primary {
    background: var(--color-accent);
    color: white;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .action-btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.secondary {
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  .action-btn.secondary:hover:not(:disabled) {
    background: var(--color-background-secondary);
    color: var(--color-text-primary);
  }

  .action-btn.secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
