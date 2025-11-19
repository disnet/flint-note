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
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import { wikilinkService } from '../services/wikilinkService.svelte.js';
  import { notesStore } from '../services/noteStore.svelte';
  import type {
    ReviewSessionState,
    ReviewResult,
    ReviewSessionSummary,
    SessionReviewNote,
    AgentFeedback,
    ReviewHistoryEntry,
    ReviewRating
  } from '../types/review';
  import { RATING_LABELS, RATING_DESCRIPTIONS } from '../types/review';
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

    // Show user's response when analyzing or in feedback state
    if ((sessionState === 'feedback' || isAnalyzingResponse) && userResponse.trim()) {
      msgs.push({
        role: 'user',
        content: userResponse,
        label: 'Your Response:'
      });
    }

    if (sessionState === 'feedback') {
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
    reviewStore.loadConfig();
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

      // Load notes for current session
      const notes = await window.api?.getNotesForReview();

      if (!notes || notes.length === 0) {
        sessionState = 'idle';
        return;
      }

      notesToReview = notes.map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content,
        reviewItem: {
          reviewCount: note.reviewItem.reviewCount,
          nextSessionNumber: note.reviewItem.nextSessionNumber,
          currentInterval: note.reviewItem.currentInterval
        },
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
   * Start a review session for a single specific note
   */
  async function startSingleNoteReview(noteId: string): Promise<void> {
    try {
      // Clear any saved session when starting fresh
      reviewStore.clearSavedSession();

      sessionState = 'loading';
      sessionStartTime = new Date();
      sessionResults = [];
      currentNoteIndex = 0;

      // Load the specific note metadata
      const noteMeta = notesStore.notes.find((n) => n.id === noteId);
      if (!noteMeta) {
        console.error('Note not found:', noteId);
        sessionState = 'idle';
        return;
      }

      // Get the full note with content
      const noteWithContent = await window.api?.getNote({ identifier: noteId });
      if (!noteWithContent) {
        console.error('Failed to load note content:', noteId);
        sessionState = 'idle';
        return;
      }

      // Get review item data for the note
      const reviewItem = await reviewStore.getReviewItem(noteId);
      if (!reviewItem) {
        console.error('Review item not found for note:', noteId);
        sessionState = 'idle';
        return;
      }

      // Create a session with just this one note
      notesToReview = [
        {
          id: noteMeta.id,
          title: noteMeta.title,
          content: noteWithContent.content || '',
          reviewItem: {
            reviewCount: reviewItem.reviewCount,
            nextSessionNumber: reviewItem.nextSessionNumber,
            currentInterval: reviewItem.currentInterval
          },
          skipped: false
        }
      ];

      // Start with the note
      await loadNextNote();
    } catch (error) {
      console.error('Failed to start single note review:', error);
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
   * Regenerate the challenge prompt for the current note
   */
  async function regenerateChallenge(): Promise<void> {
    if (!currentNote) return;

    try {
      isGeneratingPrompt = true;

      // Generate a new review prompt
      const response = await window.api?.generateReviewPrompt(currentNote.id);

      if (!response?.success) {
        console.error('Failed to regenerate prompt:', response?.error);
        // Keep the current prompt if regeneration fails
      } else {
        currentPrompt = response.prompt || currentPrompt;
      }
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
   * Rate current note and advance
   */
  async function rateReview(rating: ReviewRating): Promise<void> {
    if (!currentNote) return;

    try {
      isCompletingReview = true;

      // Call API to complete the review with rating
      const reviewResult = await window.api?.completeReview({
        noteId: currentNote.id,
        rating,
        userResponse,
        prompt: currentPrompt
      });

      // Record the result
      const result: ReviewResult = {
        noteId: currentNote.id,
        noteTitle: currentNote.title,
        rating,
        userResponse,
        agentFeedback: agentFeedback?.feedback || '',
        timestamp: new Date().toISOString(),
        scheduledForSession: reviewResult?.nextSessionNumber || -1
      };
      sessionResults.push(result);

      // Mark note as reviewed
      notesToReview[currentNoteIndex] = {
        ...currentNote,
        reviewedAt: new Date().toISOString(),
        rating
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
    // Clear saved session since we're done
    reviewStore.clearSavedSession();
    sessionState = 'complete';
  }

  /**
   * Return to dashboard and reload stats
   */
  function backToDashboard(): void {
    // Ensure saved session is cleared when returning to dashboard
    reviewStore.clearSavedSession();
    sessionState = 'idle';
    notesToReview = [];
    currentNoteIndex = 0;
    sessionResults = [];
    reviewStore.loadStats();
  }

  /**
   * Increment session number (start next session early)
   */
  async function incrementSession(): Promise<void> {
    await reviewStore.incrementSession();
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
    ratingCounts: {
      1: sessionResults.filter((r) => r.rating === 1).length,
      2: sessionResults.filter((r) => r.rating === 2).length,
      3: sessionResults.filter((r) => r.rating === 3).length,
      4: sessionResults.filter((r) => r.rating === 4).length
    },
    skippedCount: notesToReview.filter((n) => n.skipped).length,
    startTime: sessionStartTime?.toISOString() || '',
    endTime: new Date().toISOString(),
    durationMinutes: sessionStartTime
      ? Math.round((Date.now() - sessionStartTime.getTime()) / 60000)
      : 0,
    results: sessionResults,
    sessionNumber: reviewStore.stats.currentSessionNumber
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
        config={reviewStore.config}
        onStartReview={startReviewSession}
        onResumeSession={restoreSession}
        onReviewNote={startSingleNoteReview}
        onIncrementSession={incrementSession}
        onUpdateConfig={(config) => reviewStore.updateConfig(config)}
        hasSavedSession={reviewStore.hasSavedSession()}
      />
    {:else if activeTab === 'history'}
      <ReviewHistoryView />
    {/if}
  {:else if sessionState === 'loading'}
    <!-- Loading state -->
    {#if isGeneratingPrompt && currentNote}
      <!-- Show box-style loading while generating prompt -->
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
              <!-- Challenge section with regenerate button -->
              {#if sessionState === 'prompting' || sessionState === 'feedback'}
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
                  {#if isGeneratingPrompt}
                    <div class="challenge-loading">
                      <div class="loading-message">
                        <div class="loading-dots">
                          <span class="dot"></span>
                          <span class="dot"></span>
                          <span class="dot"></span>
                        </div>
                      </div>
                    </div>
                  {:else}
                    <div class="challenge-content">
                      <MarkdownRenderer text={currentPrompt} />
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Render other conversation messages (response and feedback) -->
              {#each messages.slice(1) as message, index (`${message.role}-${index + 1}`)}
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
              {#if currentNoteReviewHistory.length > 0 && sessionState === 'prompting' && !isAnalyzingResponse}
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

  /* Review loading container - box style */
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
    border-bottom: 2px solid var(--border);
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

  .review-loading-container .generating-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .review-loading-container .loading-dots {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.25rem;
  }

  .review-loading-container .dot {
    width: 0.375rem;
    height: 0.375rem;
    background: var(--text-muted);
    border-radius: 50%;
    animation: pulse 1.4s infinite ease-in-out;
    opacity: 0.4;
  }

  .review-loading-container .dot:nth-child(1) {
    animation-delay: 0s;
  }

  .review-loading-container .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .review-loading-container .dot:nth-child(3) {
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

  /* Challenge section with regenerate button */
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

  .challenge-section .regenerate-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
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

  .challenge-section .regenerate-btn:hover:not(:disabled) {
    background: var(--bg-primary);
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .challenge-section .regenerate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .challenge-section .regenerate-btn .loading-dots {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    height: 0.75rem;
  }

  .challenge-section .regenerate-btn .dot {
    width: 0.25rem;
    height: 0.25rem;
    background: currentColor;
    border-radius: 50%;
    animation: pulse 1.4s infinite ease-in-out;
    opacity: 0.4;
  }

  .challenge-section .regenerate-btn .dot:nth-child(1) {
    animation-delay: 0s;
  }

  .challenge-section .regenerate-btn .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .challenge-section .regenerate-btn .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  .challenge-loading {
    display: flex;
    justify-content: center;
    padding: 2rem;
  }

  .challenge-loading .loading-message {
    display: flex;
    align-items: center;
  }

  .challenge-loading .loading-dots {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    height: 1.25rem;
  }

  .challenge-loading .dot {
    width: 0.5rem;
    height: 0.5rem;
    background: var(--accent-primary);
    border-radius: 50%;
    animation: pulse 1.4s infinite ease-in-out;
    opacity: 0.4;
  }

  .challenge-loading .dot:nth-child(1) {
    animation-delay: 0s;
  }

  .challenge-loading .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .challenge-loading .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  .challenge-content {
    color: var(--text-primary);
    line-height: 1.6;
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

  /* Feedback loading - conversation style */
  .feedback-loading {
    display: flex;
    justify-content: center;
    padding: 2rem 1.5rem;
  }

  .feedback-loading .generating-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .feedback-loading .loading-dots {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.25rem;
  }

  .feedback-loading .dot {
    width: 0.375rem;
    height: 0.375rem;
    background: var(--text-muted);
    border-radius: 50%;
    animation: pulse 1.4s infinite ease-in-out;
    opacity: 0.4;
  }

  .feedback-loading .dot:nth-child(1) {
    animation-delay: 0s;
  }

  .feedback-loading .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .feedback-loading .dot:nth-child(3) {
    animation-delay: 0.4s;
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
    background: var(--bg-tertiary);
    color: var(--text-tertiary);
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
    background: var(--warning-hover);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);
  }

  .feedback-controls .productive-btn {
    border-color: var(--success);
    color: var(--success);
  }

  .feedback-controls .productive-btn:hover:not(:disabled) {
    background: var(--success-hover);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .feedback-controls .familiar-btn {
    border-color: var(--accent-secondary);
    color: var(--accent-secondary);
  }

  .feedback-controls .familiar-btn:hover:not(:disabled) {
    background: var(--accent-secondary);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .feedback-controls .processed-btn {
    border-color: var(--text-tertiary);
    color: var(--text-tertiary);
  }

  .feedback-controls .processed-btn:hover:not(:disabled) {
    background: var(--text-tertiary);
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
