<script lang="ts">
  import {
    getReviewStats,
    getReviewConfig,
    updateReviewConfig,
    getActiveSession,
    hasActiveSession,
    startReviewSession,
    updateSessionState,
    recordReview,
    completeSession,
    clearActiveSession,
    getCurrentReviewNote,
    getNotesForReview,
    getNextSessionTime,
    incrementSessionNumber,
    navigateToNote
  } from '../lib/automerge';
  import type { ReviewRating } from '../lib/automerge/types';
  import { RATING_LABELS, RATING_DESCRIPTIONS } from '../lib/automerge/review-scheduler';
  import {
    getReviewService,
    type ReviewService
  } from '../lib/automerge/review-service.svelte';
  import AutomergeReviewStats from './AutomergeReviewStats.svelte';
  import AutomergeReviewHistoryView from './AutomergeReviewHistoryView.svelte';
  import AutomergeReviewSessionSummary from './AutomergeReviewSessionSummary.svelte';
  import AutomergeNoteContentDrawer from './AutomergeNoteContentDrawer.svelte';
  import AutomergeReviewHistoryPanel from './AutomergeReviewHistoryPanel.svelte';
  import ConversationContainer from './conversation/ConversationContainer.svelte';
  import ConversationMessage from './conversation/ConversationMessage.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';

  // State machine for review flow
  type SessionState =
    | 'idle'
    | 'loading'
    | 'prompting'
    | 'feedback'
    | 'transition'
    | 'complete';
  let sessionState = $state<SessionState>('idle');

  // Tab navigation (only shown when idle)
  let activeTab = $state<'dashboard' | 'history'>('dashboard');

  // Session data
  let sessionStartTime = $state<Date | null>(null);
  let skippedCount = $state(0);

  // Current review data
  let currentPrompt = $state('');
  let userResponse = $state('');
  let agentFeedback = $state<string | null>(null);

  // Note drawer
  let isNoteDrawerOpen = $state(false);

  // Loading states
  let isGeneratingPrompt = $state(false);
  let isAnalyzingResponse = $state(false);
  let isCompletingReview = $state(false);

  // Review history panel state
  let isHistoryExpanded = $state(false);

  // Review service
  let reviewService = $state<ReviewService | null>(null);

  // Derived values from Automerge state
  const stats = $derived(getReviewStats());
  const config = $derived(getReviewConfig());
  const activeSession = $derived(getActiveSession());
  const currentNote = $derived(getCurrentReviewNote());
  const nextSessionTime = $derived(getNextSessionTime());

  // Session progress
  const totalNotes = $derived(activeSession?.noteIds.length ?? 0);
  const currentNoteIndex = $derived(activeSession?.currentIndex ?? 0);

  // Initialize review service
  $effect(() => {
    const init = async (): Promise<void> => {
      try {
        const port = await window.api?.getChatServerPort();
        if (port) {
          reviewService = getReviewService(port);
        }
      } catch (error) {
        console.error('Failed to initialize review service:', error);
      }
    };

    init();
  });

  // Restore session on mount if there's an active session
  $effect(() => {
    if (hasActiveSession() && sessionState === 'idle') {
      const session = getActiveSession();
      if (session) {
        sessionStartTime = new Date(session.startedAt);
        currentPrompt = session.currentPrompt ?? '';
        userResponse = session.userResponse ?? '';
        agentFeedback = session.agentFeedback ?? null;
        sessionState = session.state;
      }
    }
  });

  // Handle keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent): void {
    if (sessionState === 'prompting') {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!isAnalyzingResponse && userResponse.trim()) {
          submitResponse();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        endSession();
      }
    } else if (sessionState === 'feedback' && !isCompletingReview) {
      // Number keys 1-4 for ratings
      if (event.key >= '1' && event.key <= '4') {
        event.preventDefault();
        rateReview(parseInt(event.key) as ReviewRating);
      }
    }
  }

  // Set up keyboard listener
  $effect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  // Handle wikilink clicks
  async function handleWikilinkClick(
    noteId: string,
    title: string,
    _shouldCreate?: boolean,
    _shiftKey?: boolean
  ): Promise<void> {
    navigateToNote(noteId, title);
  }

  // Handle note clicks in rendered markdown
  function handleNoteClick(noteId: string, _shiftKey?: boolean): void {
    // For markdown rendered note clicks, we don't have the title readily available
    // Just navigate with empty title - the navigation function will handle it
    navigateToNote(noteId, '');
  }

  /**
   * Start a new review session
   */
  async function startNewReviewSession(): Promise<void> {
    try {
      sessionState = 'loading';
      sessionStartTime = new Date();
      skippedCount = 0;

      // Get notes due for review
      const notes = getNotesForReview();

      if (notes.length === 0) {
        sessionState = 'idle';
        return;
      }

      // Start session in Automerge
      const noteIds = notes.map((n) => n.id);
      startReviewSession(noteIds);

      // Load first note
      await loadNextNote();
    } catch (error) {
      console.error('Failed to start review session:', error);
      sessionState = 'idle';
    }
  }

  /**
   * Start a single note review
   */
  async function startSingleNoteReview(noteId: string): Promise<void> {
    try {
      sessionState = 'loading';
      sessionStartTime = new Date();
      skippedCount = 0;

      // Start session with just this note
      startReviewSession([noteId]);

      // Load the note
      await loadNextNote();
    } catch (error) {
      console.error('Failed to start single note review:', error);
      sessionState = 'idle';
    }
  }

  /**
   * Resume a saved session
   */
  function resumeSession(): void {
    const session = getActiveSession();
    if (session) {
      sessionStartTime = new Date(session.startedAt);
      currentPrompt = session.currentPrompt ?? '';
      userResponse = session.userResponse ?? '';
      agentFeedback = session.agentFeedback ?? null;
      sessionState = session.state;
    }
  }

  /**
   * Load the next note and generate a prompt
   */
  async function loadNextNote(): Promise<void> {
    const note = getCurrentReviewNote();
    if (!note) {
      // No more notes - complete the session
      await finishSession();
      return;
    }

    try {
      isGeneratingPrompt = true;
      isHistoryExpanded = false;
      currentPrompt = '';
      userResponse = '';
      agentFeedback = null;

      // Switch to prompting state so user can see streaming text
      sessionState = 'prompting';

      // Generate review prompt with streaming
      if (reviewService) {
        await reviewService.generatePrompt(note.title, note.content || '', (text) => {
          currentPrompt = text;
        });
      } else {
        currentPrompt = 'Explain the main concepts in this note in your own words.';
      }

      // Update session state with final prompt
      updateSessionState({
        currentPrompt,
        userResponse: '',
        agentFeedback: undefined,
        state: 'prompting'
      });
    } catch (error) {
      console.error('Error generating prompt:', error);
      currentPrompt = 'Explain the main concepts in this note in your own words.';
      sessionState = 'prompting';
    } finally {
      isGeneratingPrompt = false;
    }
  }

  /**
   * Regenerate the challenge prompt
   */
  async function regenerateChallenge(): Promise<void> {
    const note = getCurrentReviewNote();
    if (!note || !reviewService) return;

    try {
      isGeneratingPrompt = true;
      currentPrompt = '';

      // Generate with streaming
      await reviewService.generatePrompt(note.title, note.content || '', (text) => {
        currentPrompt = text;
      });

      updateSessionState({ currentPrompt });
    } catch (error) {
      console.error('Error regenerating prompt:', error);
    } finally {
      isGeneratingPrompt = false;
    }
  }

  /**
   * Submit user's response for analysis
   */
  async function submitResponse(): Promise<void> {
    const note = getCurrentReviewNote();
    if (!userResponse.trim() || !note) return;

    try {
      isAnalyzingResponse = true;
      updateSessionState({ userResponse });

      // Switch to feedback state early so user can see streaming
      agentFeedback = '';
      sessionState = 'feedback';

      if (reviewService) {
        // Stream the feedback
        await reviewService.analyzeResponse(
          note.title,
          note.content || '',
          currentPrompt,
          userResponse,
          (text) => {
            agentFeedback = text;
          }
        );
      } else {
        agentFeedback = 'Thank you for your response.';
      }

      updateSessionState({
        agentFeedback,
        state: 'feedback'
      });
    } catch (error) {
      console.error('Error analyzing response:', error);
      agentFeedback = 'Thank you for your response.';
      sessionState = 'feedback';
    } finally {
      isAnalyzingResponse = false;
    }
  }

  /**
   * Rate current note and advance
   */
  async function rateReview(rating: ReviewRating): Promise<void> {
    const note = getCurrentReviewNote();
    if (!note) return;

    try {
      isCompletingReview = true;

      // Record the review in Automerge
      recordReview(note.id, rating, currentPrompt, userResponse, agentFeedback ?? '');

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
    skippedCount++;
    const session = getActiveSession();
    if (session) {
      updateSessionState({
        currentIndex: session.currentIndex + 1
      });
    }
    loadNextNote();
  }

  /**
   * End the session early
   */
  async function endSession(): Promise<void> {
    const session = getActiveSession();
    if (session && session.results.length > 0) {
      await finishSession();
    } else {
      await backToDashboard();
    }
  }

  /**
   * Complete the session and show summary
   */
  async function finishSession(): Promise<void> {
    const session = getActiveSession();

    // Increment session number if we completed all notes
    if (session && session.currentIndex >= session.noteIds.length) {
      incrementSessionNumber();
    }

    // Complete the session (clears active session)
    completeSession();
    sessionState = 'complete';
  }

  /**
   * Return to dashboard
   */
  async function backToDashboard(): Promise<void> {
    clearActiveSession();
    sessionState = 'idle';
    sessionStartTime = null;
    currentPrompt = '';
    userResponse = '';
    agentFeedback = null;
    skippedCount = 0;
  }

  /**
   * Toggle note content drawer
   */
  function toggleNoteDrawer(): void {
    isNoteDrawerOpen = !isNoteDrawerOpen;
  }

  /**
   * Handle config updates
   */
  function handleConfigUpdate(updates: Record<string, number>): void {
    updateReviewConfig(updates);
  }

  // Build session summary for completion view
  const sessionSummary = $derived.by(() => {
    const session = getActiveSession();
    const results = session?.results ?? [];

    const ratingCounts: Record<ReviewRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const result of results) {
      ratingCounts[result.rating]++;
    }

    return {
      totalNotes: results.length,
      ratingCounts,
      skippedCount,
      durationMinutes: sessionStartTime
        ? Math.round((Date.now() - sessionStartTime.getTime()) / 60000)
        : 0,
      results,
      sessionNumber: stats.currentSessionNumber
    };
  });
</script>

<div class="review-view">
  {#if sessionState === 'idle'}
    <!-- Tab Navigation -->
    <div class="tab-nav">
      <button
        class="tab-btn"
        class:active={activeTab === 'dashboard'}
        onclick={() => (activeTab = 'dashboard')}
      >
        Dashboard
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'history'}
        onclick={() => (activeTab = 'history')}
      >
        History
      </button>
    </div>

    <!-- Tab Content -->
    {#if activeTab === 'dashboard'}
      <AutomergeReviewStats
        {stats}
        {config}
        onStartReview={startNewReviewSession}
        onResumeSession={resumeSession}
        onReviewNote={startSingleNoteReview}
        onUpdateConfig={handleConfigUpdate}
        hasSavedSession={hasActiveSession()}
        nextSessionAvailableAt={nextSessionTime}
      />
    {:else if activeTab === 'history'}
      <AutomergeReviewHistoryView />
    {/if}
  {:else if sessionState === 'loading'}
    <!-- Loading state -->
    {#if isGeneratingPrompt && currentNote}
      <div class="review-loading-container">
        <div class="loading-header">
          <h2>Reviewing: {currentNote.title}</h2>
          <div class="progress">Note {currentNoteIndex + 1} of {totalNotes}</div>
        </div>

        <div class="loading-content-area">
          <div class="challenge-loading-box">
            <div class="challenge-label">Review Challenge:</div>
            <div class="generating-message">
              <span>Generating review</span>
              <div class="loading-dots">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else}
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
  {:else if sessionState === 'prompting' || sessionState === 'feedback'}
    <!-- Review conversation -->
    {#if currentNote}
      <div class="review-conversation">
        <ConversationContainer>
          {#snippet header()}
            <div class="review-header">
              <h2>Reviewing: {currentNote.title}</h2>
              <div class="progress">Note {currentNoteIndex + 1} of {totalNotes}</div>
            </div>
          {/snippet}

          {#snippet content()}
            <div class="messages-container">
              <!-- Challenge section -->
              <div
                class="challenge-section"
                class:collapsed={sessionState === 'feedback'}
              >
                <div class="challenge-header">
                  <div class="challenge-label">Review Challenge:</div>
                  {#if sessionState === 'prompting'}
                    <button
                      class="regenerate-btn"
                      onclick={regenerateChallenge}
                      disabled={isGeneratingPrompt || isAnalyzingResponse}
                      aria-label="Regenerate challenge"
                      title="Generate a new challenge for this note"
                    >
                      {#if isGeneratingPrompt}
                        <span>Generating</span>
                        <div class="loading-dots">
                          <span class="dot"></span>
                          <span class="dot"></span>
                          <span class="dot"></span>
                        </div>
                      {:else}
                        Regenerate
                      {/if}
                    </button>
                  {/if}
                </div>
                <div class="challenge-content" class:streaming={isGeneratingPrompt}>
                  {#if currentPrompt}
                    <MarkdownRenderer text={currentPrompt} />
                    {#if isGeneratingPrompt}
                      <span class="streaming-cursor"></span>
                    {/if}
                  {:else if isGeneratingPrompt}
                    <div class="loading-message">
                      <div class="loading-dots">
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>

              <!-- User response display (in feedback state) -->
              {#if sessionState === 'feedback' && userResponse.trim()}
                <ConversationMessage
                  content={userResponse}
                  role="user"
                  label="Your Response:"
                  variant="section"
                  noAnimation={true}
                  onNoteClick={handleNoteClick}
                />
              {/if}

              <!-- Agent feedback (in feedback state) -->
              {#if sessionState === 'feedback'}
                <div class="feedback-section" class:streaming={isAnalyzingResponse}>
                  <div class="feedback-label">Feedback:</div>
                  <div class="feedback-content">
                    {#if agentFeedback}
                      <MarkdownRenderer text={agentFeedback} />
                      {#if isAnalyzingResponse}
                        <span class="streaming-cursor"></span>
                      {/if}
                    {:else if isAnalyzingResponse}
                      <div class="loading-message">
                        <div class="loading-dots">
                          <span class="dot"></span>
                          <span class="dot"></span>
                          <span class="dot"></span>
                        </div>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}

              <!-- User response editor (in prompting state) -->
              {#if sessionState === 'prompting' && !isAnalyzingResponse}
                <div class="response-editor">
                  <div class="editor-label">Your Response:</div>
                  <div class="editor-wrapper">
                    <CodeMirrorEditor
                      content={userResponse}
                      onContentChange={(value) => (userResponse = value)}
                      onWikilinkClick={handleWikilinkClick}
                      placeholder="Type your explanation here... You can use [[wikilinks]] to reference other notes."
                      variant="default"
                      readOnly={false}
                      noBottomMargin={true}
                    />
                  </div>
                </div>
              {/if}

              <!-- Review History Panel (in prompting state) -->
              {#if currentNote.review?.reviewHistory && currentNote.review.reviewHistory.length > 0 && sessionState === 'prompting' && !isAnalyzingResponse}
                <div class="review-history-section">
                  <button
                    class="history-toggle"
                    onclick={() => (isHistoryExpanded = !isHistoryExpanded)}
                    aria-expanded={isHistoryExpanded}
                  >
                    <svg
                      class="expand-icon"
                      class:expanded={isHistoryExpanded}
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                    <span
                      >Previous Attempts ({currentNote.review.reviewHistory.length})</span
                    >
                  </button>

                  {#if isHistoryExpanded}
                    <div class="history-content">
                      <AutomergeReviewHistoryPanel
                        history={currentNote.review.reviewHistory}
                        compact={true}
                      />
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Loading indicator while analyzing -->
              {#if isAnalyzingResponse}
                <div class="feedback-loading">
                  <div class="generating-message">
                    <span>Generating feedback</span>
                    <div class="loading-dots">
                      <span class="dot"></span>
                      <span class="dot"></span>
                      <span class="dot"></span>
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/snippet}

          {#snippet controls()}
            {#if sessionState === 'prompting'}
              <!-- Prompting controls -->
              <div class="review-controls">
                <div class="response-hint">
                  Tip: Press Cmd/Ctrl+Enter to submit · Escape to end session · Use
                  [[wikilinks]] to link notes
                </div>
                <div class="actions">
                  <div class="secondary-actions">
                    <button
                      class="action-btn secondary"
                      onclick={toggleNoteDrawer}
                      disabled={isAnalyzingResponse}
                    >
                      Show Note Content
                    </button>
                    <button
                      class="action-btn secondary"
                      onclick={skipNote}
                      disabled={isAnalyzingResponse}
                    >
                      Skip
                    </button>
                    <button
                      class="action-btn secondary"
                      onclick={endSession}
                      disabled={isAnalyzingResponse}
                    >
                      End Session
                    </button>
                  </div>
                  <button
                    class="action-btn primary"
                    onclick={submitResponse}
                    disabled={isAnalyzingResponse || !userResponse.trim()}
                  >
                    {isAnalyzingResponse ? 'Submitting...' : 'Submit Response'}
                  </button>
                </div>
              </div>
            {:else if sessionState === 'feedback'}
              <!-- Feedback controls (4-point rating) -->
              <div class="feedback-controls">
                <div class="rating-section">
                  <div class="rating-prompt">How was this review session?</div>
                  <div class="rating-buttons">
                    <button
                      class="rating-btn need-more-btn"
                      onclick={() => rateReview(1)}
                      disabled={isCompletingReview}
                      title="Press 1"
                    >
                      <span class="key-hint">1</span>
                      <span class="label">{RATING_LABELS[1]}</span>
                      <span class="schedule">{RATING_DESCRIPTIONS[1]}</span>
                    </button>
                    <button
                      class="rating-btn productive-btn"
                      onclick={() => rateReview(2)}
                      disabled={isCompletingReview}
                      title="Press 2"
                    >
                      <span class="key-hint">2</span>
                      <span class="label">{RATING_LABELS[2]}</span>
                      <span class="schedule">{RATING_DESCRIPTIONS[2]}</span>
                    </button>
                    <button
                      class="rating-btn familiar-btn"
                      onclick={() => rateReview(3)}
                      disabled={isCompletingReview}
                      title="Press 3"
                    >
                      <span class="key-hint">3</span>
                      <span class="label">{RATING_LABELS[3]}</span>
                      <span class="schedule">{RATING_DESCRIPTIONS[3]}</span>
                    </button>
                    <button
                      class="rating-btn processed-btn"
                      onclick={() => rateReview(4)}
                      disabled={isCompletingReview}
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
            {/if}
          {/snippet}
        </ConversationContainer>
      </div>
    {/if}
  {:else if sessionState === 'complete'}
    <!-- Session summary -->
    <AutomergeReviewSessionSummary
      summary={sessionSummary}
      onBackToDashboard={backToDashboard}
    />
  {/if}

  <!-- Note content drawer -->
  {#if currentNote}
    <AutomergeNoteContentDrawer
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

  .tab-nav {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 2rem 0 2rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-primary);
  }

  .tab-btn {
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    bottom: -1px;
  }

  .tab-btn:hover {
    color: var(--text-primary);
    background: var(--bg-secondary);
  }

  .tab-btn.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
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
    border: 4px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0%,
    80%,
    100% {
      opacity: 0.4;
      transform: scale(1);
    }
    40% {
      opacity: 1;
      transform: scale(1.2);
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

  /* Review loading container */
  .review-loading-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
  }

  .review-loading-container .loading-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid var(--border-light);
    flex-shrink: 0;
  }

  .review-loading-container .loading-header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    word-wrap: break-word;
  }

  .review-loading-container .progress {
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .review-loading-container .loading-content-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .review-loading-container .challenge-loading-box {
    background: var(--bg-secondary);
    border-left: 4px solid var(--accent-primary);
    padding: 1.5rem;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .review-loading-container .challenge-label {
    font-weight: 600;
    color: var(--accent-primary);
    text-transform: uppercase;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  .generating-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .loading-dots {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.25rem;
  }

  .dot {
    width: 0.375rem;
    height: 0.375rem;
    background: var(--text-muted);
    border-radius: 50%;
    animation: pulse 1.4s infinite ease-in-out;
    opacity: 0.4;
  }

  .dot:nth-child(1) {
    animation-delay: 0s;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  /* Review conversation styles */
  .review-conversation {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .review-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.5rem 2rem;
    border-bottom: 2px solid var(--border-light);
  }

  .review-header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    word-wrap: break-word;
  }

  .review-header .progress {
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .messages-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* Challenge section */
  .challenge-section {
    background: var(--bg-secondary);
    border-left: 4px solid var(--accent-primary);
    padding: 1.5rem;
    border-radius: 4px;
  }

  .challenge-section.collapsed {
    opacity: 0.7;
  }

  .challenge-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .challenge-label {
    font-weight: 600;
    color: var(--accent-primary);
    text-transform: uppercase;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  .regenerate-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid var(--border-light);
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

  .challenge-content {
    color: var(--text-primary);
    line-height: 1.6;
  }

  .challenge-content .loading-message {
    display: flex;
    justify-content: flex-start;
    padding: 0.5rem 0;
  }

  /* Streaming cursor animation */
  .streaming-cursor {
    display: inline-block;
    width: 2px;
    height: 1.2em;
    background: var(--accent-primary);
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: blink 0.8s infinite;
  }

  @keyframes blink {
    0%,
    50% {
      opacity: 1;
    }
    51%,
    100% {
      opacity: 0;
    }
  }

  /* Feedback section */
  .feedback-section {
    background: var(--bg-secondary);
    border-left: 4px solid var(--success);
    padding: 1.5rem;
    border-radius: 4px;
  }

  .feedback-section.streaming {
    border-left-color: var(--accent-primary);
  }

  .feedback-label {
    font-weight: 600;
    color: var(--success);
    text-transform: uppercase;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
  }

  .feedback-section.streaming .feedback-label {
    color: var(--accent-primary);
  }

  .feedback-content {
    color: var(--text-primary);
    line-height: 1.6;
  }

  .feedback-content .loading-message {
    display: flex;
    justify-content: flex-start;
    padding: 0.5rem 0;
  }

  /* Response editor */
  .response-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .response-editor .editor-label {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .response-editor .editor-wrapper {
    border: 2px solid var(--border-light);
    border-radius: 4px;
    max-height: 400px;
    overflow: auto;
    transition: border-color 0.2s;
  }

  .response-editor .editor-wrapper :global(.cm-editor) {
    height: auto;
  }

  .response-editor .editor-wrapper :global(.cm-scroller) {
    overflow-y: visible;
  }

  .response-editor .editor-wrapper :global(.cm-content) {
    min-height: fit-content;
  }

  .response-editor .editor-wrapper:focus-within {
    border-color: var(--accent-primary);
  }

  /* Feedback loading */
  .feedback-loading {
    display: flex;
    justify-content: center;
    padding: 2rem 1.5rem;
  }

  /* Review controls */
  .review-controls {
    border-top: 1px solid var(--border-light);
    background: var(--bg-primary);
    padding: 1rem 2rem;
  }

  .review-controls .response-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
    margin-bottom: 0.75rem;
    text-align: center;
  }

  .review-controls .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .review-controls .secondary-actions {
    display: flex;
    gap: 0.5rem;
  }

  .review-controls .action-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-size: 0.875rem;
  }

  .review-controls .action-btn.primary {
    background: var(--accent-primary);
    color: var(--bg-primary);
  }

  .review-controls .action-btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  .review-controls .action-btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .review-controls .action-btn.secondary {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border-light);
  }

  .review-controls .action-btn.secondary:hover:not(:disabled) {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .review-controls .action-btn.secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Feedback controls */
  .feedback-controls {
    background: var(--bg-primary);
    padding: 1rem 2rem;
  }

  .feedback-controls .rating-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 2px solid var(--border-light);
  }

  .feedback-controls .rating-prompt {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .feedback-controls .rating-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .feedback-controls .rating-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 0.875rem;
    border: 2px solid;
    border-radius: 8px;
    background: var(--bg-primary);
    cursor: pointer;
    transition: all 0.2s;
    min-width: 100px;
    flex: 1;
    max-width: 140px;
  }

  .feedback-controls .rating-btn .key-hint {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    background: var(--bg-hover);
    color: var(--text-muted);
  }

  .feedback-controls .rating-btn .label {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .feedback-controls .rating-btn .schedule {
    font-size: 0.6875rem;
    color: var(--text-secondary);
  }

  .feedback-controls .need-more-btn {
    border-color: var(--warning);
    color: var(--warning);
  }

  .feedback-controls .need-more-btn:hover:not(:disabled) {
    background: var(--warning);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);
  }

  .feedback-controls .productive-btn {
    border-color: var(--success);
    color: var(--success);
  }

  .feedback-controls .productive-btn:hover:not(:disabled) {
    background: var(--success);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .feedback-controls .familiar-btn {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .feedback-controls .familiar-btn:hover:not(:disabled) {
    background: var(--accent-primary);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .feedback-controls .processed-btn {
    border-color: var(--text-muted);
    color: var(--text-muted);
  }

  .feedback-controls .processed-btn:hover:not(:disabled) {
    background: var(--text-muted);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(107, 114, 128, 0.4);
  }

  .feedback-controls .rating-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .feedback-controls .rating-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .feedback-controls .keyboard-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Review History Panel */
  .review-history-section {
    margin: 1.5rem 0;
    padding: 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
  }

  .history-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s;
    border-radius: 4px;
  }

  .history-toggle:hover {
    background: var(--bg-hover);
  }

  .history-toggle .expand-icon {
    transition: transform 0.2s;
    color: var(--text-secondary);
  }

  .history-toggle .expand-icon.expanded {
    transform: rotate(180deg);
  }

  .history-content {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
  }
</style>
