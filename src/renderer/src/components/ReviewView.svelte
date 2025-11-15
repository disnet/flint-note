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
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>
        {isGeneratingPrompt
          ? 'Analyzing note and generating review prompt...'
          : 'Loading your notes...'}
      </p>
    </div>
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
    background: var(--color-background-primary);
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
    border: 4px solid var(--color-border);
    border-top-color: var(--color-accent);
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
    color: var(--color-text-secondary);
    font-size: 1rem;
  }

  .progress-bar {
    width: 300px;
    height: 8px;
    background: var(--color-background-secondary);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-accent);
    transition: width 0.3s ease-out;
  }
</style>
