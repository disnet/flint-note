<script lang="ts">
  /**
   * Mobile Keyboard Control Panel
   *
   * Floating FAB-style button group that appears above the keyboard when
   * the note editor is focused on mobile devices. Provides quick actions:
   * - Text formatting (bold, italic, strikethrough, code)
   * - Insert [[ to trigger wikilink autocomplete
   * - Insert []() markdown link syntax
   * - Dismiss keyboard
   */
  import { keyboardState } from '../stores/keyboardState.svelte';
  import {
    editorFocusState,
    insertTextAtCursor,
    blurEditor,
    formatSelection,
    openInsertMenu
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

  // Panel height (44px) + padding (8px) - used to position above keyboard
  const PANEL_OFFSET = 52;

  // Position the panel at the bottom of the visual viewport.
  // We use top-based positioning instead of bottom because on iOS,
  // position:fixed is relative to the layout viewport, not the visual viewport.
  // When scrolling with the keyboard open, the visual viewport moves independently,
  // so we need visualBottom (offsetTop + height) to track it correctly.
  const panelTop = $derived(keyboardState.visualBottom - PANEL_OFFSET);

  function handleOpenInsertMenu(event: PointerEvent | TouchEvent): void {
    event.preventDefault();
    openInsertMenu();
  }

  function handleFormat(
    format: 'bold' | 'italic' | 'strikethrough' | 'code',
    event: PointerEvent | TouchEvent
  ): void {
    event.preventDefault();
    formatSelection(format);
  }

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
  <div class="keyboard-panel" style:top="{panelTop}px">
    <button
      class="panel-button insert-button"
      onpointerdown={handleOpenInsertMenu}
      aria-label="Insert block"
      title="Insert block"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>

    <div class="separator"></div>

    <div class="button-group">
      <button
        class="panel-button"
        onpointerdown={(e) => handleFormat('bold', e)}
        aria-label="Bold"
        title="Bold"
      >
        <span class="button-text format-bold">B</span>
      </button>

      <button
        class="panel-button"
        onpointerdown={(e) => handleFormat('italic', e)}
        aria-label="Italic"
        title="Italic"
      >
        <span class="button-text format-italic">I</span>
      </button>

      <button
        class="panel-button"
        onpointerdown={(e) => handleFormat('strikethrough', e)}
        aria-label="Strikethrough"
        title="Strikethrough"
      >
        <span class="button-text format-strikethrough">S</span>
      </button>

      <button
        class="panel-button"
        onpointerdown={(e) => handleFormat('code', e)}
        aria-label="Code"
        title="Code"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      </button>
    </div>

    <div class="separator"></div>

    <div class="button-group">
      <button
        class="panel-button"
        onpointerdown={handleInsertWikilink}
        aria-label="Insert wikilink"
        title="Insert [["
      >
        <span class="button-text format-mono">[[</span>
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
    </div>

    <div class="separator"></div>

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
    /* top is set dynamically via style binding to track the visual viewport */
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 0px;
    padding: 2px 6px;
    border-radius: 22px;
    background: color-mix(in srgb, var(--bg-elevated) 85%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }

  .button-group {
    display: flex;
    align-items: center;
    gap: 0px;
  }

  .separator {
    width: 1px;
    height: 20px;
    background: var(--border-light);
    margin: 0 2px;
    flex-shrink: 0;
  }

  .panel-button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .panel-button:active {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .button-text {
    font-family: var(--font-editor), serif;
    font-size: 16px;
    font-weight: 600;
  }

  .format-bold {
    font-weight: 700;
  }

  .format-italic {
    font-style: italic;
  }

  .format-strikethrough {
    text-decoration: line-through;
  }

  .insert-button {
    color: var(--accent-primary, #6366f1);
  }

  .insert-button:active {
    color: var(--accent-primary, #6366f1);
    background: var(--bg-hover);
  }

  .format-mono {
    font-family: var(--font-mono, monospace);
    font-size: 14px;
    font-weight: 600;
  }

  /* Hide on desktop */
  @media (min-width: 768px) {
    .keyboard-panel {
      display: none;
    }
  }
</style>
