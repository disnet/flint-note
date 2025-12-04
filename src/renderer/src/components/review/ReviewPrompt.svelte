<script lang="ts">
  import MarkdownRenderer from '../MarkdownRenderer.svelte';
  import CodeMirrorEditor from '../CodeMirrorEditor.svelte';
  import { wikilinkService } from '../../services/wikilinkService.svelte.js';

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
    onRegenerateChallenge: () => void;
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
    onRegenerateChallenge,
    isSubmitting = false
  }: Props = $props();

  // Handle wikilink clicks for autocomplete
  async function handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean,
    shiftKey?: boolean
  ): Promise<void> {
    // Use centralized wikilink service
    await wikilinkService.handleWikilinkClick(noteId, title, shouldCreate, shiftKey);
  }

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

  <div class="content-area">
    <div class="prompt-section">
      <div class="prompt-header">
        <div class="prompt-label">Review Challenge:</div>
        <button
          class="regenerate-btn"
          onclick={onRegenerateChallenge}
          disabled={isSubmitting}
          aria-label="Regenerate challenge"
        >
          Regenerate
        </button>
      </div>
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
          onWikilinkClick={handleWikilinkClick}
          placeholder="Type your explanation here... You can use [[wikilinks]] to reference other notes."
          variant="default"
          readOnly={isSubmitting}
        />
      </div>
    </div>
  </div>

  <div class="bottom-bar">
    <div class="response-hint">
      Tip: Press Cmd/Ctrl+Enter to submit · Escape to end session · Use [[wikilinks]] to
      link notes
    </div>
    <div class="actions">
      <div class="secondary-actions">
        <button class="action-btn secondary" onclick={onShowNote} disabled={isSubmitting}>
          Show Note Content
        </button>
        <button class="action-btn secondary" onclick={onSkip} disabled={isSubmitting}>
          Skip
        </button>
        <button
          class="action-btn secondary"
          onclick={onEndSession}
          disabled={isSubmitting}
        >
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
</div>

<style>
  .review-prompt {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
    gap: 0;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid var(--border);
    flex-shrink: 0;
  }

  .content-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
    min-height: 0;
  }

  .header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    word-wrap: break-word;
  }

  .progress {
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .prompt-section {
    background: var(--bg-secondary);
    border-left: 4px solid var(--accent-primary);
    padding: 1.5rem;
    border-radius: 4px;
  }

  .prompt-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .prompt-label {
    font-weight: 600;
    color: var(--accent-primary);
    text-transform: uppercase;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  .regenerate-btn {
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .regenerate-btn:hover:not(:disabled) {
    background: var(--bg-primary);
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .regenerate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
    min-height: 80px;
    max-height: 400px;
    overflow: auto;
    transition: border-color 0.2s;
  }

  /* Make CodeMirror grow with content */
  .editor-wrapper :global(.cm-editor) {
    height: auto;
    min-height: 80px;
  }

  .editor-wrapper :global(.cm-scroller) {
    overflow-y: visible;
    min-height: 80px;
  }

  .editor-wrapper :global(.cm-content) {
    min-height: 80px;
  }

  .editor-wrapper:focus-within {
    border-color: var(--accent-primary);
  }

  .bottom-bar {
    flex-shrink: 0;
    background: var(--bg-primary);
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
  }

  .response-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
    margin-bottom: 0.75rem;
    text-align: center;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
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
