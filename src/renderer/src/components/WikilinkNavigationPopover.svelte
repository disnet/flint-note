<script lang="ts">
  interface Props {
    visible: boolean;
    x: number;
    y: number;
  }

  let { visible = $bindable(false), x, y }: Props = $props();
</script>

{#if visible}
  <div class="navigation-popover" style="left: {x}px; top: {y}px;">
    <span class="hint-text"><kbd>Enter</kbd> to open</span>
  </div>
{/if}

<style>
  .navigation-popover {
    position: fixed;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
  }

  .hint-text {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  kbd {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    padding: 1px 5px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .navigation-popover {
      background: rgba(0, 0, 0, 0.95);
    }
  }
</style>
