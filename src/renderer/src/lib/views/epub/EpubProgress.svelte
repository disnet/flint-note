<script lang="ts">
  let {
    progress = 0,
    currentSection = 0,
    totalSections = 0,
    onPrev = () => {},
    onNext = () => {}
  }: {
    progress: number;
    currentSection?: number;
    totalSections?: number;
    onPrev?: () => void;
    onNext?: () => void;
  } = $props();

  let progressPercent = $derived(Math.min(100, Math.max(0, progress)));
</script>

<div class="epub-progress">
  <button
    class="nav-button prev"
    onclick={onPrev}
    aria-label="Previous page"
    disabled={currentSection <= 0 && progress <= 0}
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M10 4L6 8L10 12"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <span>Prev</span>
  </button>

  <div class="progress-center">
    <div class="section-info">
      {#if totalSections > 0}
        Section {currentSection + 1} of {totalSections}
      {/if}
    </div>

    <div class="progress-bar-container">
      <div class="progress-bar">
        <div class="progress-fill" style="width: {progressPercent}%"></div>
      </div>
      <span class="progress-text">{progressPercent.toFixed(0)}%</span>
    </div>
  </div>

  <button
    class="nav-button next"
    onclick={onNext}
    aria-label="Next page"
    disabled={currentSection >= totalSections - 1 && progress >= 100}
  >
    <span>Next</span>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 4L10 8L6 12"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</div>

<style>
  .epub-progress {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary, #f5f5f5);
    border-top: 1px solid var(--border-light, #e0e0e0);
  }

  .nav-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-medium, #ccc);
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-primary, #333);
    font-size: 0.875rem;
    transition: all 0.15s ease;
  }

  .nav-button:hover:not(:disabled) {
    background: var(--bg-hover, #e0e0e0);
    border-color: var(--border-dark, #999);
  }

  .nav-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .nav-button svg {
    flex-shrink: 0;
  }

  .progress-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .section-info {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
  }

  .progress-bar-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-width: 400px;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: var(--bg-primary, #fff);
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid var(--border-light, #e0e0e0);
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary, #007bff);
    transition: width 0.3s ease;
    border-radius: 3px;
  }

  .progress-text {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
    min-width: 36px;
    text-align: right;
  }

  @media (max-width: 480px) {
    .nav-button span {
      display: none;
    }

    .nav-button {
      padding: 0.5rem;
    }
  }
</style>
