<script lang="ts">
  import { onMount } from 'svelte';
  import { reviewStore } from '../stores/reviewStore.svelte';
  import ReviewStats from './review/ReviewStats.svelte';
  import ReviewPrompt from './review/ReviewPrompt.svelte';
  import ReviewFeedback from './review/ReviewFeedback.svelte';
  import ReviewSessionSummaryComponent from './review/ReviewSessionSummary.svelte';
  import NoteContentDrawer from './review/NoteContentDrawer.svelte';
  import type {
    ReviewSessionState,
    ReviewResult,
    ReviewSessionSummary,
    SessionReviewNote,
    AgentFeedback
  } from '../types/review';

  // State machine
  let sessionState = $state<ReviewSessionState>('idle');

  // Session data
  let notesToReview = $state<SessionReviewNote[]>([]);
  let currentNoteIndex = $state(0);
  let currentPrompt = $state('');
  let userResponse = $state('');
  let agentFeedback = $state<AgentFeedback | null>(null);
  let sessionResults = $state<ReviewResult[]>([]);
  let sessionStartTime = $state<Date | null>(null);

  // Note drawer
  let isNoteDrawerOpen = $state(false);

  // Loading states
  let isGeneratingPrompt = $state(false);
  let isAnalyzingResponse = $state(false);
  let isCompletingReview = $state(false);

  // Derived values
  const currentNote = $derived(notesToReview[currentNoteIndex]);
  const totalNotes = $derived(notesToReview.length);

  // Load review data on mount
  onMount(() => {
    reviewStore.loadStats();
  });

  /**
   * Start a new review session
   */
  async function startReviewSession(): Promise<void> {
    try {
      sessionState = 'loading';
      sessionStartTime = new Date();
      sessionResults = [];
      currentNoteIndex = 0;

      // Load today's notes
      const today = new Date().toISOString().split('T')[0];
      const notes = await window.api?.getNotesForReview(today);

      if (!notes || notes.length === 0) {
        sessionState = 'idle';
        return;
      }

      notesToReview = notes.map((note) => ({
        ...note,
        skipped: false
      }));

      // Start with the first note
      await loadNextNote();
    } catch (error) {
      console.error('Failed to start review session:', error);
      sessionState = 'idle';
    }
  }

  /**
   * Load the current note and generate a review prompt
   */
  async function loadNextNote(): Promise<void> {
    if (!currentNote) {
      // No more notes - complete the session
      completeSession();
      return;
    }

    try {
      sessionState = 'loading';
      isGeneratingPrompt = true;

      // Generate review prompt for the current note
      const response = await window.api?.generateReviewPrompt(currentNote.id);

      if (!response?.success) {
        console.error('Failed to generate prompt:', response?.error);
        // Use fallback prompt
        currentPrompt =
          response?.prompt || 'Explain the main concepts in this note in your own words.';
      } else {
        currentPrompt = response.prompt || '';
      }

      userResponse = '';
      agentFeedback = null;
      sessionState = 'prompting';
    } catch (error) {
      console.error('Error generating prompt:', error);
      currentPrompt = 'Explain the main concepts in this note in your own words.';
      sessionState = 'prompting';
    } finally {
      isGeneratingPrompt = false;
    }
  }

  /**
   * Submit user's response for analysis
   */
  async function submitResponse(): Promise<void> {
    if (!userResponse.trim() || !currentNote) return;

    try {
      isAnalyzingResponse = true;

      const response = await window.api?.analyzeReviewResponse({
        noteId: currentNote.id,
        prompt: currentPrompt,
        userResponse: userResponse
      });

      if (!response?.success || !response.feedback) {
        console.error('Failed to analyze response:', response?.error);
        agentFeedback = {
          feedback: 'Thank you for your response.',
          suggestedLinks: []
        };
      } else {
        agentFeedback = response.feedback;
      }

      sessionState = 'feedback';
    } catch (error) {
      console.error('Error analyzing response:', error);
      agentFeedback = {
        feedback: 'Thank you for your response.',
        suggestedLinks: []
      };
      sessionState = 'feedback';
    } finally {
      isAnalyzingResponse = false;
    }
  }

  /**
   * Mark current note as passed or failed and advance
   */
  async function markPassFail(passed: boolean): Promise<void> {
    if (!currentNote) return;

    try {
      isCompletingReview = true;

      // Call API to complete the review
      await window.api?.completeReview({
        noteId: currentNote.id,
        passed,
        userResponse
      });

      // Calculate next review date
      const nextDate = new Date();
      if (passed) {
        nextDate.setDate(nextDate.getDate() + 7);
      } else {
        nextDate.setDate(nextDate.getDate() + 1);
      }

      // Record the result
      const result: ReviewResult = {
        noteId: currentNote.id,
        noteTitle: currentNote.title,
        passed,
        userResponse,
        agentFeedback: agentFeedback?.feedback || '',
        timestamp: new Date().toISOString(),
        scheduledFor: nextDate.toISOString().split('T')[0]
      };
      sessionResults.push(result);

      // Mark note as reviewed
      notesToReview[currentNoteIndex] = {
        ...currentNote,
        reviewedAt: new Date().toISOString()
      };

      // Move to next note
      currentNoteIndex++;

      // Brief transition state
      sessionState = 'transition';
      setTimeout(() => {
        loadNextNote();
      }, 300);
    } catch (error) {
      console.error('Error completing review:', error);
    } finally {
      isCompletingReview = false;
    }
  }

  /**
   * Skip the current note
   */
  function skipNote(): void {
    if (!currentNote) return;

    // Mark note as skipped
    notesToReview[currentNoteIndex] = {
      ...currentNote,
      skipped: true
    };

    // Move to next note
    currentNoteIndex++;
    loadNextNote();
  }

  /**
   * End the session early
   */
  function endSession(): void {
    if (sessionResults.length > 0) {
      completeSession();
    } else {
      // No reviews completed - just go back to idle
      backToDashboard();
    }
  }

  /**
   * Complete the session and show summary
   */
  function completeSession(): void {
    sessionState = 'complete';
  }

  /**
   * Return to dashboard and reload stats
   */
  function backToDashboard(): void {
    sessionState = 'idle';
    notesToReview = [];
    currentNoteIndex = 0;
    sessionResults = [];
    reviewStore.loadStats();
  }

  /**
   * Show/hide note content drawer
   */
  function toggleNoteDrawer(): void {
    isNoteDrawerOpen = !isNoteDrawerOpen;
  }

  /**
   * Calculate session summary
   */
  const sessionSummary = $derived<ReviewSessionSummary>({
    totalNotes: sessionResults.length,
    passedCount: sessionResults.filter((r) => r.passed).length,
    failedCount: sessionResults.filter((r) => !r.passed).length,
    skippedCount: notesToReview.filter((n) => n.skipped).length,
    startTime: sessionStartTime?.toISOString() || '',
    endTime: new Date().toISOString(),
    durationMinutes: sessionStartTime
      ? Math.round((Date.now() - sessionStartTime.getTime()) / 60000)
      : 0,
    results: sessionResults
  });
</script>

<div class="review-view">
  {#if sessionState === 'idle'}
    <!-- Stats dashboard -->
    <ReviewStats stats={reviewStore.stats} onStartReview={startReviewSession} />
  {:else if sessionState === 'loading'}
    <!-- Loading state -->
    {#if isGeneratingPrompt && currentNote}
      <!-- Show skeleton of review screen while generating prompt -->
      <div class="review-prompt-skeleton">
        <div class="header">
          <h2>Reviewing: {currentNote.title}</h2>
          <div class="progress">Note {currentNoteIndex + 1} of {totalNotes}</div>
        </div>

        <div class="content-area">
          <div class="prompt-section loading">
            <div class="prompt-label">Review Challenge:</div>
            <div class="loading-content">
              <div class="loading-spinner"></div>
              <p>Generating review challenge...</p>
            </div>
          </div>

          <div class="response-section disabled">
            <div class="response-label">Your Response:</div>
            <div class="editor-placeholder">
              <p>Waiting for review challenge...</p>
            </div>
          </div>
        </div>

        <div class="bottom-bar">
          <div class="response-hint">
            Tip: Press Cmd/Ctrl+Enter to submit · Escape to end session · Use
            [[wikilinks]] to link notes
          </div>
          <div class="actions disabled">
            <div class="secondary-actions">
              <button class="action-btn secondary" disabled>Show Note Content</button>
              <button class="action-btn secondary" disabled>Skip</button>
              <button class="action-btn secondary" disabled>End Session</button>
            </div>
            <button class="action-btn primary" disabled>Submit Response</button>
          </div>
        </div>
      </div>
    {:else}
      <!-- Initial loading of notes -->
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p>Loading your notes...</p>
      </div>
    {/if}
  {:else if sessionState === 'transition'}
    <!-- Brief transition between notes -->
    <div class="transition-container">
      <div class="progress-bar">
        <div
          class="progress-fill"
          style="width: {(currentNoteIndex / totalNotes) * 100}%"
        ></div>
      </div>
      <p>Note {currentNoteIndex} of {totalNotes}</p>
    </div>
  {:else if sessionState === 'prompting'}
    <!-- Review prompt and response -->
    {#if currentNote}
      {#if isAnalyzingResponse}
        <!-- Loading skeleton while analyzing response -->
        <div class="review-feedback-skeleton">
          <div class="skeleton-content">
            <div class="prompt-section collapsed">
              <div class="section-label">Review Prompt:</div>
              <div class="skeleton-text-line"></div>
            </div>

            <div class="response-section">
              <div class="section-label">Your Response:</div>
              <div class="skeleton-text-block">{userResponse}</div>
            </div>

            <div class="feedback-section loading">
              <div class="section-label">Feedback:</div>
              <div class="loading-content">
                <div class="loading-spinner"></div>
                <p>Analyzing your response...</p>
              </div>
            </div>
          </div>

          <div class="skeleton-controls">
            <div class="rating-section disabled">
              <div class="rating-prompt">Did you understand this concept well?</div>
              <div class="rating-buttons">
                <button class="rating-btn fail-btn" disabled>
                  <span class="icon">✗</span>
                  <span class="label">Fail</span>
                  <span class="schedule">Review tomorrow</span>
                </button>
                <button class="rating-btn pass-btn" disabled>
                  <span class="icon">✓</span>
                  <span class="label">Pass</span>
                  <span class="schedule">Review in 7 days</span>
                </button>
              </div>
              <div class="keyboard-hint">Keyboard shortcuts: P for Pass · F for Fail</div>
            </div>
          </div>
        </div>
      {:else}
        <ReviewPrompt
          noteTitle={currentNote.title}
          currentIndex={currentNoteIndex}
          {totalNotes}
          prompt={currentPrompt}
          {userResponse}
          onResponseChange={(value) => (userResponse = value)}
          onSubmit={submitResponse}
          onShowNote={toggleNoteDrawer}
          onSkip={skipNote}
          onEndSession={endSession}
          isSubmitting={isAnalyzingResponse}
        />
      {/if}
    {/if}
  {:else if sessionState === 'feedback'}
    <!-- Agent feedback and pass/fail -->
    {#if currentNote && agentFeedback}
      <ReviewFeedback
        prompt={currentPrompt}
        {userResponse}
        feedback={agentFeedback.feedback}
        onPass={() => markPassFail(true)}
        onFail={() => markPassFail(false)}
        isProcessing={isCompletingReview}
      />
    {/if}
  {:else if sessionState === 'complete'}
    <!-- Session summary -->
    <ReviewSessionSummaryComponent
      summary={sessionSummary}
      onBackToDashboard={backToDashboard}
    />
  {/if}

  <!-- Note content drawer (available during prompting state) -->
  {#if currentNote}
    <NoteContentDrawer
      isOpen={isNoteDrawerOpen}
      noteTitle={currentNote.title}
      noteContent={currentNote.content || ''}
      onClose={toggleNoteDrawer}
    />
  {/if}
</div>

<style>
  .review-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    background: var(--bg-primary);
  }

  .loading-container,
  .transition-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    padding: 2rem;
  }

  .loading-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--border);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-container p,
  .transition-container p {
    color: var(--text-secondary);
    font-size: 1rem;
  }

  .progress-bar {
    width: 300px;
    height: 8px;
    background: var(--bg-secondary);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary);
    transition: width 0.3s ease-out;
  }

  /* Review prompt skeleton styles */
  .review-prompt-skeleton {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
    gap: 0;
  }

  .review-prompt-skeleton .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid var(--border);
    flex-shrink: 0;
  }

  .review-prompt-skeleton .content-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
    min-height: 0;
  }

  .review-prompt-skeleton .header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    word-wrap: break-word;
  }

  .review-prompt-skeleton .progress {
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .review-prompt-skeleton .prompt-section {
    background: var(--bg-secondary);
    border-left: 4px solid var(--accent-primary);
    padding: 1.5rem;
    border-radius: 4px;
    min-height: 150px;
  }

  .review-prompt-skeleton .prompt-section.loading {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .review-prompt-skeleton .prompt-label {
    font-weight: 600;
    color: var(--accent-primary);
    text-transform: uppercase;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  .review-prompt-skeleton .loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    flex: 1;
  }

  .review-prompt-skeleton .loading-content p {
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-style: italic;
  }

  .review-prompt-skeleton .loading-content .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @media (prefers-color-scheme: dark) {
    .review-prompt-skeleton .loading-content .loading-spinner {
      border-color: rgba(255, 255, 255, 0.1);
      border-top-color: var(--accent-primary);
    }
  }

  .review-prompt-skeleton .response-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    opacity: 0.5;
  }

  .review-prompt-skeleton .response-label {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .review-prompt-skeleton .editor-placeholder {
    border: 2px solid var(--border);
    border-radius: 4px;
    min-height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary);
  }

  .review-prompt-skeleton .editor-placeholder p {
    color: var(--text-tertiary);
    font-style: italic;
  }

  .review-prompt-skeleton .bottom-bar {
    flex-shrink: 0;
    background: var(--bg-primary);
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
  }

  .review-prompt-skeleton .response-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-style: italic;
    margin-bottom: 0.75rem;
    text-align: center;
    opacity: 0.5;
  }

  .review-prompt-skeleton .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    opacity: 0.5;
  }

  .review-prompt-skeleton .secondary-actions {
    display: flex;
    gap: 0.5rem;
  }

  .review-prompt-skeleton .action-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: not-allowed;
    border: none;
    font-size: 0.875rem;
  }

  .review-prompt-skeleton .action-btn.primary {
    background: var(--accent-primary);
    color: var(--bg-primary);
    opacity: 0.5;
  }

  .review-prompt-skeleton .action-btn.secondary {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  /* Feedback loading skeleton styles */
  .review-feedback-skeleton {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
  }

  .review-feedback-skeleton .skeleton-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
    min-height: 0;
  }

  .review-feedback-skeleton .skeleton-controls {
    flex-shrink: 0;
  }

  .review-feedback-skeleton .prompt-section,
  .review-feedback-skeleton .response-section,
  .review-feedback-skeleton .feedback-section {
    padding: 1.5rem;
    border-radius: 4px;
    border-left: 4px solid var(--border);
  }

  .review-feedback-skeleton .prompt-section.collapsed {
    background: var(--bg-tertiary);
    border-left-color: var(--text-tertiary);
    opacity: 0.6;
  }

  .review-feedback-skeleton .response-section {
    background: var(--bg-secondary);
    border-left-color: var(--accent-secondary);
    opacity: 0.8;
  }

  .review-feedback-skeleton .feedback-section.loading {
    background: var(--bg-secondary);
    border-left-color: var(--success);
    min-height: 200px;
    display: flex;
    flex-direction: column;
  }

  .review-feedback-skeleton .section-label {
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
    color: var(--text-secondary);
  }

  .review-feedback-skeleton .skeleton-text-line {
    height: 20px;
    background: var(--border);
    border-radius: 4px;
    opacity: 0.3;
  }

  .review-feedback-skeleton .skeleton-text-block {
    color: var(--text-primary);
    line-height: 1.6;
    white-space: pre-wrap;
    font-family: inherit;
  }

  .review-feedback-skeleton .feedback-section .loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    flex: 1;
  }

  .review-feedback-skeleton .feedback-section .loading-content p {
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-style: italic;
  }

  .review-feedback-skeleton .feedback-section .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-top-color: var(--success);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @media (prefers-color-scheme: dark) {
    .review-feedback-skeleton .feedback-section .loading-spinner {
      border-color: rgba(255, 255, 255, 0.1);
      border-top-color: var(--success);
    }
  }

  .review-feedback-skeleton .rating-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 2px solid var(--border);
  }

  .review-feedback-skeleton .rating-section.disabled {
    opacity: 0.5;
  }

  .review-feedback-skeleton .rating-prompt {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .review-feedback-skeleton .rating-buttons {
    display: flex;
    gap: 1rem;
  }

  .review-feedback-skeleton .rating-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem 2rem;
    border: 2px solid;
    border-radius: 8px;
    background: var(--bg-primary);
    cursor: not-allowed;
    min-width: 150px;
  }

  .review-feedback-skeleton .rating-btn .icon {
    font-size: 2rem;
    font-weight: bold;
  }

  .review-feedback-skeleton .rating-btn .label {
    font-size: 1.125rem;
    font-weight: 600;
  }

  .review-feedback-skeleton .rating-btn .schedule {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .review-feedback-skeleton .fail-btn {
    border-color: var(--warning);
    color: var(--warning);
  }

  .review-feedback-skeleton .pass-btn {
    border-color: var(--success);
    color: var(--success);
  }

  .review-feedback-skeleton .keyboard-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-style: italic;
  }
</style>
