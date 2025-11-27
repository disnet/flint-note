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
  </button>

  <div class="progress-center">
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
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .nav-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--text-secondary, #666);
    transition: all 0.15s ease;
  }

  .nav-button:hover:not(:disabled) {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
    color: var(--text-primary, #333);
  }

  .nav-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-button svg {
    flex-shrink: 0;
  }

  .progress-center {
    flex: 1;
    display: flex;
    align-items: center;
  }

  .progress-bar-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
  }

  .progress-bar {
    flex: 1;
    height: 4px;
    background: var(--border-light, rgba(0, 0, 0, 0.1));
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary, #007bff);
    transition: width 0.3s ease;
    border-radius: 2px;
  }

  .progress-text {
    font-size: 0.7rem;
    color: var(--text-muted, #999);
    min-width: 32px;
    text-align: right;
  }
</style>
