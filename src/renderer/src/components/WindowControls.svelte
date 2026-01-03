<script lang="ts">
  /**
   * Custom window controls for Windows and Linux
   * macOS uses native traffic light controls via titleBarStyle: 'hiddenInset'
   */

  function handleMinimize(): void {
    window.api?.windowMinimize();
  }

  function handleMaximize(): void {
    window.api?.windowMaximize();
  }

  function handleClose(): void {
    window.api?.windowClose();
  }
</script>

<div class="window-controls">
  <button
    class="window-control minimize"
    onclick={handleMinimize}
    aria-label="Minimize"
    title="Minimize"
  >
    <svg width="10" height="1" viewBox="0 0 10 1">
      <rect width="10" height="1" fill="currentColor" />
    </svg>
  </button>

  <button
    class="window-control maximize"
    onclick={handleMaximize}
    aria-label="Maximize"
    title="Maximize"
  >
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect
        x="0.5"
        y="0.5"
        width="9"
        height="9"
        fill="none"
        stroke="currentColor"
        stroke-width="1"
      />
    </svg>
  </button>

  <button
    class="window-control close"
    onclick={handleClose}
    aria-label="Close"
    title="Close"
  >
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2" />
    </svg>
  </button>
</div>

<style>
  .window-controls {
    display: none;
    align-items: center;
    -webkit-app-region: no-drag;
    height: 100%;
  }

  /* Only show on Windows and Linux */
  :global([data-platform='windows']) .window-controls,
  :global([data-platform='linux']) .window-controls {
    display: flex;
  }

  .window-control {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background-color 0.1s ease;
  }

  .window-control:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .window-control:active {
    background: var(--bg-tertiary, var(--bg-hover));
  }

  .window-control.close:hover {
    background: #e81123;
    color: white;
  }

  .window-control.close:active {
    background: #bf0f1d;
    color: white;
  }

  .window-control svg {
    flex-shrink: 0;
  }
</style>
