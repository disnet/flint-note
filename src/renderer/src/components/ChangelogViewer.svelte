<script lang="ts">
  import { marked } from 'marked';
  import { onMount } from 'svelte';

  interface Props {
    version: string;
    isCanary: boolean;
    onClose: () => void;
  }

  let { version, isCanary, onClose }: Props = $props();

  let changelogContent = $state('');
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    await loadChangelog();
  });

  async function loadChangelog(): Promise<void> {
    loading = true;
    error = null;

    try {
      const result = await window.api?.getChangelog(version, isCanary);
      if (result?.success) {
        changelogContent = result.changelog || '';
      } else {
        error = result?.error || 'Failed to load changelog';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error occurred';
    } finally {
      loading = false;
    }
  }

  const renderedChangelog = $derived.by(() => {
    if (!changelogContent) return '';
    try {
      return marked(changelogContent);
    } catch (err) {
      console.error('Failed to render markdown:', err);
      return changelogContent;
    }
  });
</script>

<div class="changelog-viewer">
  <div class="changelog-header">
    <h2>What's New in {version}</h2>
    <button class="close-btn" onclick={onClose} aria-label="Close">×</button>
  </div>

  <div class="changelog-content">
    {#if loading}
      <div class="loading">Loading changelog...</div>
    {:else if error}
      <div class="error">
        <p>Failed to load changelog: {error}</p>
        <button onclick={loadChangelog}>Retry</button>
      </div>
    {:else}
      <div class="markdown-content">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html renderedChangelog}
      </div>
    {/if}
  </div>
</div>

<style>
  .changelog-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-color, white);
    color: var(--text-color, black);
  }

  .changelog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-color, #ddd);
    background: var(--bg-secondary-color, #f8f9fa);
  }

  .changelog-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--text-muted-color, #666);
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: var(--hover-bg-color, #e9ecef);
    color: var(--text-color, black);
  }

  .changelog-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .loading,
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
  }

  .error p {
    color: var(--error-color, #dc3545);
    margin-bottom: 1rem;
  }

  .error button {
    padding: 0.5rem 1rem;
    background: var(--primary-color, #007acc);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .error button:hover {
    opacity: 0.9;
  }

  .markdown-content {
    line-height: 1.6;
  }

  .markdown-content :global(h1) {
    font-size: 2rem;
    margin: 1.5rem 0 1rem;
    font-weight: 700;
  }

  .markdown-content :global(h2) {
    font-size: 1.5rem;
    margin: 1.25rem 0 0.75rem;
    font-weight: 600;
    border-bottom: 1px solid var(--border-color, #ddd);
    padding-bottom: 0.25rem;
  }

  .markdown-content :global(h3) {
    font-size: 1.25rem;
    margin: 1rem 0 0.5rem;
    font-weight: 600;
    color: var(--primary-color, #007acc);
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0.5rem 0;
    padding-left: 2rem;
  }

  .markdown-content :global(li) {
    margin: 0.25rem 0;
  }

  .markdown-content :global(p) {
    margin: 0.5rem 0;
  }

  .markdown-content :global(code) {
    background: var(--code-bg-color, #f5f5f5);
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .markdown-content :global(pre) {
    background: var(--code-bg-color, #f5f5f5);
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    margin: 1rem 0;
  }

  .markdown-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .markdown-content :global(a) {
    color: var(--primary-color, #007acc);
    text-decoration: none;
  }

  .markdown-content :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-content :global(blockquote) {
    border-left: 4px solid var(--border-color, #ddd);
    margin: 1rem 0;
    padding: 0.5rem 0 0.5rem 1rem;
    color: var(--text-muted-color, #666);
  }

  .markdown-content :global(strong) {
    font-weight: 600;
  }
</style>
