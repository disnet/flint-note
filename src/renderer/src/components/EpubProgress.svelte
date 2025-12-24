<script lang="ts">
  // Props
  let {
    progress = 0,
    textSize = 100,
    onTextSizeChange = (_size: number) => {},
    onPrevPage = () => {},
    onNextPage = () => {}
  }: {
    progress?: number;
    textSize?: number;
    onTextSizeChange?: (size: number) => void;
    onPrevPage?: () => void;
    onNextPage?: () => void;
  } = $props();

  let showTextSizePopup = $state(false);

  const textSizeOptions = [75, 100, 125, 150, 175, 200];

  function handleTextSizeSelect(size: number): void {
    onTextSizeChange(size);
    showTextSizePopup = false;
  }

  function formatProgress(value: number): string {
    return `${Math.round(value)}%`;
  }
</script>

<div class="progress-controls">
  <!-- Previous page -->
  <button class="nav-button" onclick={onPrevPage} title="Previous page">
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  </button>

  <!-- Progress indicator -->
  <div class="progress-indicator">
    <div class="progress-bar">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>
    <span class="progress-text">{formatProgress(progress)}</span>
  </div>

  <!-- Next page -->
  <button class="nav-button" onclick={onNextPage} title="Next page">
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  </button>

  <!-- Text size -->
  <div class="text-size-container">
    <button
      class="text-size-button"
      onclick={() => (showTextSizePopup = !showTextSizePopup)}
      title="Text size"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M4 7V4h16v3"></path>
        <path d="M9 20h6"></path>
        <path d="M12 4v16"></path>
      </svg>
      <span class="text-size-value">{textSize}%</span>
    </button>

    {#if showTextSizePopup}
      <div class="text-size-popup">
        {#each textSizeOptions as size (size)}
          <button
            class="text-size-option"
            class:active={textSize === size}
            onclick={() => handleTextSizeSelect(size)}
          >
            {size}%
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if showTextSizePopup}
  <!-- Backdrop to close popup -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="popup-backdrop" onclick={() => (showTextSizePopup = false)}></div>
{/if}

<style>
  .progress-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-secondary, #666);
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .nav-button:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
    color: var(--text-primary, #333);
  }

  .progress-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .progress-bar {
    width: 80px;
    height: 4px;
    background: var(--border-light, #e0e0e0);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary, #007bff);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
    min-width: 32px;
  }

  .text-size-container {
    position: relative;
  }

  .text-size-button {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--border-light, #e0e0e0);
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-secondary, #666);
    font-size: 0.75rem;
    transition:
      background-color 0.15s,
      border-color 0.15s;
  }

  .text-size-button:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
    border-color: var(--border-medium, #ccc);
  }

  .text-size-value {
    min-width: 32px;
  }

  .text-size-popup {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--bg-elevated, white);
    border: 1px solid var(--border-light, #e0e0e0);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 4px;
    z-index: 100;
    min-width: 80px;
  }

  .text-size-option {
    display: block;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    font-size: 0.875rem;
    color: var(--text-primary, #333);
    transition: background-color 0.15s;
  }

  .text-size-option:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  }

  .text-size-option.active {
    background: var(--accent-bg, rgba(0, 123, 255, 0.1));
    color: var(--accent-primary, #007bff);
  }

  .popup-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }
</style>
