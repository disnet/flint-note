<script lang="ts">
  /**
   * Screenshot frame wrapper for marketing/documentation screenshots.
   * Only active when :root has [data-screenshot-mode] attribute.
   * Adds rounded window frame, shadow, and background.
   */
  import { type Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<div class="screenshot-wrapper">
  <div class="screenshot-background"></div>
  <div class="screenshot-window">
    <div class="traffic-lights">
      <div class="traffic-light close"></div>
      <div class="traffic-light minimize"></div>
      <div class="traffic-light maximize"></div>
    </div>
    <div class="screenshot-content">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .screenshot-wrapper {
    width: 100vw;
    height: 100vh;
    position: relative;
    overflow: hidden;
  }

  /* Background - only visible in screenshot mode */
  .screenshot-background {
    display: none;
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  :global([data-screenshot-mode]) .screenshot-background {
    display: block;
  }

  /* Window frame */
  .screenshot-window {
    width: 100%;
    height: 100%;
    position: relative;
    background: var(--bg-primary);
    overflow: hidden;
  }

  :global([data-screenshot-mode]) .screenshot-window {
    position: absolute;
    top: 40px;
    left: 40px;
    right: 40px;
    bottom: 40px;
    width: auto;
    height: auto;
    border-radius: 12px;
    box-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(0, 0, 0, 0.1);
  }

  /* Traffic lights - positioned to align with 38px header row */
  .traffic-lights {
    display: none;
    position: absolute;
    top: 13px;
    left: 13px;
    z-index: 10000;
    gap: 8px;
    align-items: center;
    pointer-events: none;
  }

  :global([data-screenshot-mode]) .traffic-lights {
    display: flex;
  }

  .traffic-light {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.15);
  }

  .traffic-light.close {
    background: #ff5f57;
  }

  .traffic-light.minimize {
    background: #febc2e;
  }

  .traffic-light.maximize {
    background: #28c840;
  }

  /* Content area */
  .screenshot-content {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  :global([data-screenshot-mode]) .screenshot-content {
    border-radius: 12px;
  }
</style>
