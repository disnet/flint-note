<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  // State
  let currentVersionChangelog = $state('');
  let fullChangelog = $state('');
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let appVersion = $state('');
  let isCanary = $state(false);
  let showFullHistory = $state(false);

  async function loadChangelog(): Promise<void> {
    isLoading = true;
    error = null;

    try {
      // Get app version info
      const versionInfo = await window.api?.getAppVersion();
      if (versionInfo) {
        appVersion = versionInfo.version;
        isCanary = versionInfo.channel === 'canary';
      }

      // Fetch current version changelog
      const currentResult = await window.api?.getChangelog(appVersion, isCanary);
      if (currentResult?.success && currentResult.changelog) {
        currentVersionChangelog = currentResult.changelog;
      } else {
        currentVersionChangelog = `No changelog available for version ${appVersion}.`;
      }

      // Fetch full changelog (pass empty string to get everything)
      const fullResult = await window.api?.getChangelog('', isCanary);
      if (fullResult?.success && fullResult.changelog) {
        fullChangelog = fullResult.changelog;
      } else {
        fullChangelog = currentVersionChangelog;
      }
    } catch (err) {
      console.error('Failed to load changelog:', err);
      error = 'Failed to load changelog.';
    } finally {
      isLoading = false;
    }
  }

  function renderMarkdown(text: string): string {
    const parsed = marked.parse(text);
    if (typeof parsed !== 'string') {
      return '';
    }

    return DOMPurify.sanitize(parsed, {
      ALLOWED_TAGS: [
        'p',
        'strong',
        'b',
        'em',
        'i',
        'code',
        'pre',
        'ul',
        'ol',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'br',
        'a',
        'hr'
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
      KEEP_CONTENT: true
    });
  }

  const displayContent = $derived(
    showFullHistory ? fullChangelog : currentVersionChangelog
  );
  const renderedHtml = $derived(renderMarkdown(displayContent));

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

  function handleLinkClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'A') {
      event.preventDefault();
      const href = (target as HTMLAnchorElement).href;
      if (href) {
        window.api?.openExternal({ url: href });
      }
    }
  }

  function handleLinkKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target as HTMLElement;
      if (target.tagName === 'A') {
        event.preventDefault();
        const href = (target as HTMLAnchorElement).href;
        if (href) {
          window.api?.openExternal({ url: href });
        }
      }
    }
  }

  $effect(() => {
    if (isOpen) {
      loadChangelog();
      // Reset to current version view when opening
      showFullHistory = false;
      // Focus modal for keyboard accessibility
      setTimeout(() => {
        const modal = document.querySelector('.changelog-modal-overlay') as HTMLElement;
        modal?.focus();
      }, 100);
    }
  });
</script>

{#if isOpen}
  <div
    class="changelog-modal-overlay"
    onclick={handleOverlayClick}
    onkeydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="changelog-modal-title"
    tabindex="-1"
  >
    <div class="changelog-modal-content">
      <div class="changelog-modal-header">
        <div class="header-left">
          <h3 id="changelog-modal-title">What's New</h3>
          {#if appVersion}
            <span class="version-badge">v{appVersion}</span>
          {/if}
        </div>
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

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="changelog-modal-body"
        onclick={handleLinkClick}
        onkeydown={handleLinkKeyDown}
      >
        {#if isLoading}
          <div class="loading-state">
            <svg
              class="spinner"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
            </svg>
            <span>Loading changelog...</span>
          </div>
        {:else if error}
          <div class="error-state">
            <span>{error}</span>
          </div>
        {:else}
          <div class="changelog-content">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- Sanitized with DOMPurify -->
            {@html renderedHtml}
          </div>
        {/if}
      </div>

      <div class="changelog-modal-footer">
        <button
          class="toggle-history-btn"
          onclick={() => (showFullHistory = !showFullHistory)}
          disabled={isLoading}
        >
          {showFullHistory ? 'Show current version only' : 'View full history'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .changelog-modal-overlay {
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

  .changelog-modal-content {
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

  .changelog-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem 1rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .changelog-modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .version-badge {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.125rem 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border-radius: 0.25rem;
    font-family: monospace;
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

  .changelog-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    color: var(--text-secondary);
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    color: var(--danger-text, #dc2626);
  }

  .changelog-content {
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--text-primary);
  }

  .changelog-content :global(h1),
  .changelog-content :global(h2),
  .changelog-content :global(h3) {
    margin: 1.5em 0 0.75em 0;
    font-weight: 600;
    color: var(--text-primary);
  }

  .changelog-content :global(h1:first-child),
  .changelog-content :global(h2:first-child),
  .changelog-content :global(h3:first-child) {
    margin-top: 0;
  }

  .changelog-content :global(h1) {
    font-size: 1.25rem;
  }

  .changelog-content :global(h2) {
    font-size: 1.125rem;
  }

  .changelog-content :global(h3) {
    font-size: 1rem;
  }

  .changelog-content :global(p) {
    margin: 0.75em 0;
  }

  .changelog-content :global(ul),
  .changelog-content :global(ol) {
    margin: 0.75em 0;
    padding-left: 1.5rem;
  }

  .changelog-content :global(li) {
    margin: 0.375em 0;
  }

  .changelog-content :global(a) {
    color: var(--accent-primary);
    text-decoration: none;
  }

  .changelog-content :global(a:hover) {
    text-decoration: underline;
  }

  .changelog-content :global(code) {
    background: var(--bg-secondary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.875em;
  }

  .changelog-content :global(hr) {
    border: none;
    border-top: 1px solid var(--border-light);
    margin: 1.5rem 0;
  }

  .changelog-modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border-light);
    display: flex;
    justify-content: center;
    flex-shrink: 0;
  }

  .toggle-history-btn {
    background: none;
    border: none;
    color: var(--accent-primary);
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    transition: all 0.2s ease;
  }

  .toggle-history-btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .toggle-history-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
