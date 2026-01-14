<script lang="ts">
  /**
   * Modal displaying all keyboard shortcuts organized by category.
   * Triggered by Cmd+? (or Ctrl+? on Windows/Linux)
   */
  import { isWeb } from '../lib/platform.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  // Detect platform for showing the right modifier key
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);
  const cmdKey = isMac ? '⌘' : 'Ctrl';
  const optKey = isMac ? '⌥' : 'Alt';

  // Check if we're in web mode (uses different shortcuts)
  const webMode = isWeb();

  interface Shortcut {
    keys: string;
    description: string;
  }

  interface ShortcutSection {
    title: string;
    shortcuts: Shortcut[];
  }

  // Define shortcuts based on mode (Electron vs Web)
  const electronShortcuts: ShortcutSection[] = [
    {
      title: 'Navigation',
      shortcuts: [
        { keys: `${cmdKey}1`, description: 'Go to Inbox' },
        { keys: `${cmdKey}2`, description: 'Go to Daily' },
        { keys: `${cmdKey}3`, description: 'Go to Review' },
        { keys: `${cmdKey}4`, description: 'Go to Routines' },
        { keys: `${cmdKey}5`, description: 'Go to Note Types' },
        { keys: `${cmdKey}6`, description: 'Go to Settings' }
      ]
    },
    {
      title: 'File',
      shortcuts: [
        { keys: `${cmdKey}⇧N`, description: 'New note' },
        { keys: `${cmdKey}⇧D`, description: 'New deck' },
        { keys: `${cmdKey}⇧R`, description: 'Show in Finder' }
      ]
    },
    {
      title: 'Search & View',
      shortcuts: [
        { keys: `${cmdKey}O`, description: 'Quick search' },
        { keys: `${cmdKey}B`, description: 'Toggle sidebar' },
        { keys: `${cmdKey}E`, description: 'Focus title' },
        { keys: `${cmdKey}⇧E`, description: 'Toggle preview/edit' },
        { keys: `${cmdKey}⇧A`, description: 'Toggle agent panel' },
        { keys: `${cmdKey}⇧L`, description: 'Toggle notes shelf' }
      ]
    },
    {
      title: 'Zoom',
      shortcuts: [
        { keys: `${cmdKey}+`, description: 'Zoom in' },
        { keys: `${cmdKey}-`, description: 'Zoom out' },
        { keys: `${cmdKey}0`, description: 'Reset zoom' }
      ]
    },
    {
      title: 'Note Actions',
      shortcuts: [
        { keys: `${cmdKey}⇧P`, description: 'Pin/unpin note' },
        { keys: `${cmdKey}⇧M`, description: 'Change note type' }
      ]
    },
    {
      title: 'Text Formatting',
      shortcuts: [
        { keys: `${cmdKey}B`, description: 'Bold' },
        { keys: `${cmdKey}I`, description: 'Italic' },
        { keys: `${cmdKey}K`, description: 'Insert link' }
      ]
    },
    {
      title: 'Workspaces',
      shortcuts: [
        { keys: isMac ? 'Ctrl+1-9' : `${optKey}1-9`, description: 'Switch workspace' }
      ]
    }
  ];

  const webShortcuts: ShortcutSection[] = [
    {
      title: 'Navigation',
      shortcuts: [
        { keys: 'Ctrl⇧1', description: 'Go to Inbox' },
        { keys: 'Ctrl⇧2', description: 'Go to Daily' },
        { keys: 'Ctrl⇧3', description: 'Go to Review' },
        { keys: 'Ctrl⇧4', description: 'Go to Routines' },
        { keys: 'Ctrl⇧5', description: 'Go to Note Types' },
        { keys: 'Ctrl⇧6', description: 'Go to Settings' }
      ]
    },
    {
      title: 'File',
      shortcuts: [
        { keys: 'Ctrl⇧N', description: 'New note' },
        { keys: 'Ctrl⇧D', description: 'New deck' }
      ]
    },
    {
      title: 'Search & View',
      shortcuts: [
        { keys: 'Ctrl⇧K', description: 'Quick search' },
        { keys: 'Ctrl⇧B', description: 'Toggle sidebar' },
        { keys: 'Ctrl⇧T', description: 'Focus title' },
        { keys: 'Ctrl⇧E', description: 'Toggle preview/edit' },
        { keys: 'Ctrl⇧A', description: 'Toggle agent panel' },
        { keys: 'Ctrl⇧L', description: 'Toggle notes shelf' }
      ]
    },
    {
      title: 'Note Actions',
      shortcuts: [
        { keys: 'Ctrl⇧P', description: 'Pin/unpin note' },
        { keys: 'Ctrl⇧M', description: 'Change note type' }
      ]
    },
    {
      title: 'Text Formatting',
      shortcuts: [
        { keys: `${cmdKey}B`, description: 'Bold' },
        { keys: `${cmdKey}I`, description: 'Italic' },
        { keys: `${cmdKey}K`, description: 'Insert link' }
      ]
    }
  ];

  const sections = $derived(webMode ? webShortcuts : electronShortcuts);

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  function handleOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  $effect(() => {
    if (isOpen) {
      // Focus modal for keyboard accessibility
      setTimeout(() => {
        const modal = document.querySelector('.shortcuts-modal-overlay') as HTMLElement;
        modal?.focus();
      }, 100);
    }
  });
</script>

{#if isOpen}
  <div
    class="shortcuts-modal-overlay"
    onclick={handleOverlayClick}
    onkeydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="shortcuts-modal-title"
    tabindex="-1"
  >
    <div class="shortcuts-modal-content">
      <div class="shortcuts-modal-header">
        <h3 id="shortcuts-modal-title">Keyboard Shortcuts</h3>
        <button class="close-btn" onclick={onClose} aria-label="Close modal">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4L12 12M4 12L12 4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div class="shortcuts-modal-body">
        <div class="shortcuts-grid">
          {#each sections as section (section.title)}
            <div class="shortcut-section">
              <h4 class="section-title">{section.title}</h4>
              <div class="shortcut-list">
                {#each section.shortcuts as shortcut (shortcut.description)}
                  <div class="shortcut-row">
                    <span class="shortcut-description">{shortcut.description}</span>
                    <kbd class="shortcut-keys">{shortcut.keys}</kbd>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="shortcuts-modal-footer">
        <span class="footer-hint">Press <kbd>Esc</kbd> to close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .shortcuts-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .shortcuts-modal-content {
    background: var(--bg-primary);
    border-radius: 0.75rem;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    width: 100%;
    max-width: 700px;
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .shortcuts-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem 1rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .shortcuts-modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .shortcuts-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .shortcuts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .shortcut-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.375rem 0;
  }

  .shortcut-description {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .shortcut-keys {
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .shortcuts-modal-footer {
    padding: 0.75rem 1.5rem;
    border-top: 1px solid var(--border-light);
    display: flex;
    justify-content: center;
    flex-shrink: 0;
  }

  .footer-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .footer-hint kbd {
    font-family: var(--font-mono, monospace);
    font-size: 0.6875rem;
    padding: 0.125rem 0.375rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
  }

  @media (max-width: 600px) {
    .shortcuts-grid {
      grid-template-columns: 1fr;
    }

    .shortcuts-modal-content {
      max-height: 90vh;
    }
  }
</style>
