<script lang="ts">
  import { onMount } from 'svelte';
  import { reviewStore } from '../stores/reviewStore.svelte';
  import ReviewStats from './review/ReviewStats.svelte';
  import ReviewSessionSummaryComponent from './review/ReviewSessionSummary.svelte';
  import ReviewHistoryView from './review/ReviewHistoryView.svelte';
  import NoteContentDrawer from './review/NoteContentDrawer.svelte';
  import ConversationContainer from './conversation/ConversationContainer.svelte';
  import ConversationMessage from './conversation/ConversationMessage.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import { wikilinkService } from '../services/wikilinkService.svelte.js';
  import { notesStore } from '../services/noteStore.svelte';
  import type {
    ReviewSessionState,
    ReviewResult,
    ReviewSessionSummary,
    SessionReviewNote,
    AgentFeedback,
    ReviewHistoryEntry
  } from '../types/review';
  import ReviewHistoryPanel from './review/ReviewHistoryPanel.svelte';

  // State machine
  let sessionState = $state<ReviewSessionState>('idle');

  // Tab navigation (only shown when sessionState === 'idle')
  let activeTab = $state<'dashboard' | 'history'>('dashboard');

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

  // Review history for current note
  let currentNoteReviewHistory = $state<ReviewHistoryEntry[]>([]);
  let isHistoryExpanded = $state(false);

  // Loading states
  let isGeneratingPrompt = $state(false);
  let isAnalyzingResponse = $state(false);
  let isCompletingReview = $state(false);

  // Derived values
  const currentNote = $derived(notesToReview[currentNoteIndex]);
  const totalNotes = $derived(notesToReview.length);

  // Build messages array based on state
  interface ReviewMessage {
    role: 'user' | 'agent';
    content: string;
    label?: string;
    collapsed?: boolean;
  }

  const messages = $derived.by<ReviewMessage[]>(() => {
    const msgs: ReviewMessage[] = [];

    if (sessionState === 'prompting' || sessionState === 'feedback') {
      // Always show the challenge prompt
      msgs.push({
        role: 'agent',
        content: currentPrompt,
        label: 'Review Challenge:',
        collapsed: sessionState === 'feedback' // Collapse in feedback state
      });
    }

    if (sessionState === 'feedback' && userResponse.trim()) {
      // Show user's response
      msgs.push({
        role: 'user',
        content: userResponse,
        label: 'Your Response:'
      });

      // Show feedback if available
      if (agentFeedback) {
        msgs.push({
          role: 'agent',
          content: agentFeedback.feedback,
          label: 'Feedback:'
        });
      }
    }

    return msgs;
  });

  // Handle wikilink clicks for autocomplete
  async function handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean,
    shiftKey?: boolean
  ): Promise<void> {
    await wikilinkService.handleWikilinkClick(noteId, title, shouldCreate, shiftKey);
  }

  // Handle note clicks in rendered markdown (simpler signature for MarkdownRenderer)
  async function handleNoteClick(noteId: string, shiftKey?: boolean): Promise<void> {
    // Use wikilinkService to handle navigation and sidebar logic
    const existingNote = notesStore.notes.find((n) => n.id === noteId);
    if (existingNote) {
      await wikilinkService.handleWikilinkClick(
        noteId,
        existingNote.title,
        false,
        shiftKey
      );
    }
  }

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
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        markPassFail(true);
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        markPassFail(false);
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

  // Auto-save session state whenever it changes
  $effect(() => {
    // Watch these values for changes by accessing them
    void [
      sessionState,
      currentNoteIndex,
      currentPrompt,
      userResponse,
      agentFeedback,
      sessionResults
    ];

    // Only save if we're in an active review state
    if (
      sessionState !== 'idle' &&
      sessionState !== 'complete' &&
      sessionState !== 'loading' &&
      sessionState !== 'transition' &&
      sessionStartTime !== null
    ) {
      saveCurrentSession();
    }
  });

  // Load review data on mount
  onMount(() => {
    reviewStore.loadStats();
  });

  /**
   * Save current session state for later restoration
   */
  function saveCurrentSession(): void {
    reviewStore.saveSession({
      sessionState,
      notesToReview,
      currentNoteIndex,
      currentPrompt,
      userResponse,
      agentFeedback,
      sessionResults,
      sessionStartTime: sessionStartTime?.toISOString() || new Date().toISOString()
    });
  }

  /**
   * Restore a previously saved session
   */
  function restoreSession(): void {
    const saved = reviewStore.restoreSession();
    if (!saved) return;

    sessionState = saved.sessionState;
    notesToReview = saved.notesToReview;
    currentNoteIndex = saved.currentNoteIndex;
    currentPrompt = saved.currentPrompt;
    userResponse = saved.userResponse;
    agentFeedback = saved.agentFeedback;
    sessionResults = saved.sessionResults;
    sessionStartTime = new Date(saved.sessionStartTime);

    // Clear the saved session after restoring
    reviewStore.clearSavedSession();
  }

  /**
   * Start a new review session
   */
  async function startReviewSession(): Promise<void> {
    try {
      // Clear any saved session when starting fresh
      reviewStore.clearSavedSession();

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
   * Start a practice review session (all reviewable notes, not just due)
   */
  async function startPracticeReviewSession(): Promise<void> {
    try {
      // Clear any saved session when starting fresh
      reviewStore.clearSavedSession();

      sessionState = 'loading';
      sessionStartTime = new Date();
      sessionResults = [];
      currentNoteIndex = 0;

      // Load all reviewable notes
      const notes = await window.api?.getAllReviewableNotes();

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
      console.error('Failed to start practice review session:', error);
      sessionState = 'idle';
    }
  }

  /**
   * Load review history for the current note
   */
  async function loadCurrentNoteHistory(): Promise<void> {
    if (!currentNote) {
      currentNoteReviewHistory = [];
      return;
    }

    try {
      const reviewItem = await reviewStore.getReviewItem(currentNote.id);
      currentNoteReviewHistory = reviewItem?.reviewHistory || [];
      isHistoryExpanded = false; // Collapse by default
    } catch (error) {
      console.error('Failed to load review history:', error);
      currentNoteReviewHistory = [];
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

      // Load review history for the current note
      await loadCurrentNoteHistory();

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
        userResponse,
        prompt: currentPrompt,
        feedback: agentFeedback?.feedback
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
      <ReviewStats
        stats={reviewStore.stats}
        onStartReview={startReviewSession}
        onStartPracticeReview={startPracticeReviewSession}
        onResumeSession={restoreSession}
        hasSavedSession={reviewStore.hasSavedSession()}
      />
    {:else if activeTab === 'history'}
      <ReviewHistoryView />
    {/if}
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
  {:else if sessionState === 'prompting' || sessionState === 'feedback'}
    <!-- Review conversation (prompt, response, feedback) -->
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
              <!-- Render conversation messages -->
              {#each messages as message, index (`${message.role}-${index}`)}
                <ConversationMessage
                  content={message.content}
                  role={message.role}
                  label={message.label}
                  collapsed={message.collapsed}
                  variant="section"
                  noAnimation={sessionState === 'feedback'}
                  onNoteClick={handleNoteClick}
                />
              {/each}

              <!-- User response editor (only in prompting state) -->
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

              <!-- Review History Panel (collapsible) - shown below response box -->
              {#if currentNoteReviewHistory.length > 0 && sessionState === 'prompting'}
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
                    <span>Previous Attempts ({currentNoteReviewHistory.length})</span>
                  </button>

                  {#if isHistoryExpanded}
                    <div class="history-content">
                      <ReviewHistoryPanel
                        history={currentNoteReviewHistory}
                        compact={true}
                      />
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Loading indicator while analyzing -->
              {#if isAnalyzingResponse}
                <div class="analyzing-section">
                  <div class="section-label">Analyzing your response...</div>
                  <div class="loading-content">
                    <div class="loading-spinner"></div>
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
              <!-- Feedback controls (Pass/Fail) -->
              <div class="feedback-controls">
                <div class="rating-section">
                  <div class="rating-prompt">Did you understand this concept well?</div>
                  <div class="rating-buttons">
                    <button
                      class="rating-btn fail-btn"
                      onclick={() => markPassFail(false)}
                      disabled={isCompletingReview}
                      title="Press F"
                    >
                      <span class="icon">✗</span>
                      <span class="label">Fail</span>
                      <span class="schedule">Review tomorrow</span>
                    </button>
                    <button
                      class="rating-btn pass-btn"
                      onclick={() => markPassFail(true)}
                      disabled={isCompletingReview}
                      title="Press P"
                    >
                      <span class="icon">✓</span>
                      <span class="label">Pass</span>
                      <span class="schedule">Review in 7 days</span>
                    </button>
                  </div>
                  <div class="keyboard-hint">
                    Keyboard shortcuts: P for Pass · F for Fail
                  </div>
                </div>
              </div>
            {/if}
          {/snippet}
        </ConversationContainer>
      </div>
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

  .tab-nav {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 2rem 0 2rem;
    border-bottom: 1px solid var(--border);
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
    border-bottom: 2px solid var(--border);
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
    border: 2px solid var(--border);
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

  /* Analyzing section */
  .analyzing-section {
    padding: 1.5rem;
    border-radius: 4px;
    border-left: 4px solid var(--success);
    background: var(--bg-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .analyzing-section .section-label {
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  .analyzing-section .loading-content {
    display: flex;
    justify-content: center;
    padding: 1rem;
  }

  .analyzing-section .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-top-color: var(--success);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @media (prefers-color-scheme: dark) {
    .analyzing-section .loading-spinner {
      border-color: rgba(255, 255, 255, 0.1);
      border-top-color: var(--success);
    }
  }

  /* Review controls (prompting state) */
  .review-controls {
    border-top: 1px solid var(--border);
    background: var(--bg-primary);
    padding: 1rem 2rem;
  }

  .review-controls .response-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
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
    border: 1px solid var(--border);
  }

  .review-controls .action-btn.secondary:hover:not(:disabled) {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .review-controls .action-btn.secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Feedback controls (feedback state) */
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
    border: 2px solid var(--border);
  }

  .feedback-controls .rating-prompt {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .feedback-controls .rating-buttons {
    display: flex;
    gap: 1rem;
  }

  .feedback-controls .rating-btn {
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

  .feedback-controls .rating-btn .icon {
    font-size: 2rem;
    font-weight: bold;
  }

  .feedback-controls .rating-btn .label {
    font-size: 1.125rem;
    font-weight: 600;
  }

  .feedback-controls .rating-btn .schedule {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .feedback-controls .fail-btn {
    border-color: var(--warning);
    color: var(--warning);
  }

  .feedback-controls .fail-btn:hover:not(:disabled) {
    background: var(--warning-hover);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);
  }

  .feedback-controls .pass-btn {
    border-color: var(--success);
    color: var(--success);
  }

  .feedback-controls .pass-btn:hover:not(:disabled) {
    background: var(--success-hover);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
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
    color: var(--text-tertiary);
    font-style: italic;
  }

  /* Review History Panel */
  .review-history-section {
    margin: 1.5rem 0;
    padding: 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
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
