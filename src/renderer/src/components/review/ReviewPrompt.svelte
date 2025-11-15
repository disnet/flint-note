<script lang="ts">
  import MarkdownRenderer from '../MarkdownRenderer.svelte';
  import CodeMirrorEditor from '../CodeMirrorEditor.svelte';

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

  // Handle keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent): void {
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

  // Set up keyboard listener
  $effect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
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
    <div class="response-label">Your Response:</div>
    <div class="editor-wrapper">
      <CodeMirrorEditor
        content={userResponse}
        onContentChange={onResponseChange}
        placeholder="Type your explanation here... You can use [[wikilinks]] to reference other notes."
        variant="default"
        readOnly={isSubmitting}
      />
    </div>
    <div class="response-hint">
      Tip: Press Cmd/Ctrl+Enter to submit · Escape to end session · Use [[wikilinks]] to
      link notes
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
    border-bottom: 2px solid var(--border);
  }

  .header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--text-primary);
  }

  .progress {
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  .prompt-section {
    background: var(--bg-secondary);
    border-left: 4px solid var(--accent-primary);
    padding: 1.5rem;
    border-radius: 4px;
  }

  .prompt-label {
    font-weight: 600;
    color: var(--accent-primary);
    margin-bottom: 1rem;
    text-transform: uppercase;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  .prompt-content {
    color: var(--text-primary);
    line-height: 1.6;
  }

  .response-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .response-label {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .editor-wrapper {
    border: 2px solid var(--border);
    border-radius: 4px;
    min-height: 200px;
    max-height: 400px;
    overflow: auto;
    transition: border-color 0.2s;
  }

  .editor-wrapper:focus-within {
    border-color: var(--accent-primary);
  }

  .response-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-style: italic;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
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
    background: var(--accent-primary);
    color: var(--bg-primary);
  }

  .action-btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  .action-btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.secondary {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .action-btn.secondary:hover:not(:disabled) {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .action-btn.secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
