<script lang="ts">
  /**
   * Mobile Keyboard Control Panel
   *
   * Floating FAB-style button group that appears above the keyboard when
   * the note editor is focused on mobile devices. Provides quick actions:
   * - Insert [[ to trigger wikilink autocomplete
   * - Insert []() markdown link syntax
   * - Dismiss keyboard
   */
  import { keyboardState } from '../stores/keyboardState.svelte';
  import {
    editorFocusState,
    insertTextAtCursor,
    blurEditor
  } from '../stores/editorFocusState.svelte';
  import { deviceState } from '../stores/deviceState.svelte';

  interface Props {
    /** Force hide the panel */
    hidden?: boolean;
  }

  let { hidden = false }: Props = $props();

  // Only show when: mobile layout + keyboard visible + editor focused
  const shouldShow = $derived(
    !hidden &&
      deviceState.useMobileLayout &&
      keyboardState.isVisible &&
      editorFocusState.isFocused
  );

  function handleInsertWikilink(event: PointerEvent | TouchEvent): void {
    // Prevent default to keep editor focused
    event.preventDefault();
    // Insert [[ - autocomplete will trigger automatically
    insertTextAtCursor('[[');
  }

  function handleInsertLink(event: PointerEvent | TouchEvent): void {
    // Prevent default to keep editor focused
    event.preventDefault();
    // Insert []() with cursor positioned inside the brackets
    insertTextAtCursor('[]()', 1);
  }

  function handleDismissKeyboard(): void {
    blurEditor();
  }
</script>

{#if shouldShow}
  <div class="keyboard-panel" style:--kb-height="{keyboardState.height}px">
    <button
      class="panel-button"
      onpointerdown={handleInsertWikilink}
      aria-label="Insert wikilink"
      title="Insert [["
    >
      <span class="button-text">[[</span>
    </button>

    <button
      class="panel-button"
      onpointerdown={handleInsertLink}
      aria-label="Insert link"
      title="Insert markdown link"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
      </svg>
    </button>

    <button
      class="panel-button"
      onclick={handleDismissKeyboard}
      aria-label="Dismiss keyboard"
      title="Close keyboard"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 15l-6 6-6-6"></path>
        <path d="M12 3v18"></path>
      </svg>
    </button>
  </div>
{/if}

<style>
  .keyboard-panel {
    position: fixed;
    bottom: calc(var(--kb-height, 0px) + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    display: flex;
    gap: 8px;
    padding: 6px;
    background: var(--bg-elevated);
    border-radius: 28px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.2),
      0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .panel-button {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .panel-button:active {
    background: var(--bg-hover);
  }

  .button-text {
    font-family: var(--font-mono, monospace);
    font-size: 16px;
    font-weight: 600;
  }

  /* Hide on desktop */
  @media (min-width: 768px) {
    .keyboard-panel {
      display: none;
    }
  }
</style>
