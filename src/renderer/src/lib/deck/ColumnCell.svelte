<script lang="ts">
  import type { ColumnFormat } from './types';
  import type { MetadataFieldType } from '../../../../server/core/metadata-schema';

  interface Props {
    value: unknown;
    fieldType: MetadataFieldType | 'system' | 'unknown';
    format?: ColumnFormat;
    isTitle?: boolean;
    onLinkClick?: (noteTitle: string) => void;
    onTitleClick?: (event: MouseEvent) => void;
  }

  let {
    value,
    fieldType,
    format = 'default',
    isTitle = false,
    onLinkClick,
    onTitleClick
  }: Props = $props();

  // Determine effective format based on field type and explicit format
  const effectiveFormat = $derived.by(() => {
    if (format && format !== 'default') return format;

    // Default formats by type
    switch (fieldType) {
      case 'date':
        return 'absolute';
      case 'boolean':
        return 'check';
      case 'array':
        return 'pills';
      default:
        return 'default';
    }
  });

  // Format date values
  function formatDate(iso: string, fmt: ColumnFormat): string {
    if (!iso) return '-';
    try {
      const date = new Date(iso);
      if (isNaN(date.getTime())) return iso;

      switch (fmt) {
        case 'relative':
          return getRelativeTime(date);
        case 'iso':
          return date.toISOString().split('T')[0];
        case 'absolute':
        default:
          return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
      }
    } catch {
      return String(iso);
    }
  }

  // Get relative time string
  function getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
    if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
    return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
  }

  // Format number values
  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  // Parse wikilinks from text
  function parseWikilinks(
    text: string
  ): Array<{ type: 'text' | 'link'; content: string }> {
    const parts: Array<{ type: 'text' | 'link'; content: string }> = [];
    const regex = /\[\[([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      // Add the link (use display text if present, e.g., [[target|display]])
      const linkContent = match[1];
      const displayText = linkContent.includes('|')
        ? linkContent.split('|')[1]
        : linkContent;
      parts.push({ type: 'link', content: displayText });
      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
  }

  // Check if value contains wikilinks
  const hasWikilinks = $derived(
    typeof value === 'string' && value.includes('[[') && value.includes(']]')
  );

  // Parse wikilinks if present
  const parsedParts = $derived(hasWikilinks ? parseWikilinks(String(value)) : null);

  // Handle link clicks
  function handleLinkClick(noteTitle: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    onLinkClick?.(noteTitle);
  }

  // Get array items
  const arrayItems = $derived.by(() => {
    if (!Array.isArray(value)) return [];
    return value.map((v) => String(v));
  });

  // Display value as string
  const displayValue = $derived.by(() => {
    if (value === undefined || value === null) return '-';
    if (typeof value === 'string' && !value.trim()) return '-';
    if (Array.isArray(value) && value.length === 0) return '-';

    // Handle dates
    if (fieldType === 'date' && typeof value === 'string') {
      return formatDate(value, effectiveFormat);
    }

    // Handle numbers
    if (fieldType === 'number' && typeof value === 'number') {
      return formatNumber(value);
    }

    // Handle booleans (for yesno format)
    if (fieldType === 'boolean' && effectiveFormat === 'yesno') {
      return value ? 'Yes' : 'No';
    }

    // Handle arrays (for comma format)
    if (Array.isArray(value) && effectiveFormat === 'comma') {
      return value.join(', ');
    }

    // Default to string
    if (Array.isArray(value)) {
      return value.join(', ');
    }

    return String(value);
  });

  // Boolean display (for checkbox format)
  const booleanValue = $derived(fieldType === 'boolean' && Boolean(value));
</script>

<span class="column-cell" class:title-cell={isTitle}>
  {#if fieldType === 'boolean' && effectiveFormat === 'check'}
    <!-- Checkbox display for booleans -->
    <span class="boolean-check" class:checked={booleanValue}>
      {#if booleanValue}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      {/if}
    </span>
  {:else if Array.isArray(value) && effectiveFormat === 'pills' && arrayItems.length > 0}
    <!-- Pill display for arrays -->
    <span class="pills">
      {#each arrayItems as item (item)}
        <span class="pill">{item}</span>
      {/each}
    </span>
  {:else if hasWikilinks && parsedParts}
    <!-- Text with wikilinks -->
    <span class="with-links">
      {#each parsedParts as part (part.content)}
        {#if part.type === 'link'}
          <button
            class="wikilink"
            onclick={(e) => handleLinkClick(part.content, e)}
            type="button"
          >
            {part.content}
          </button>
        {:else}
          {part.content}
        {/if}
      {/each}
    </span>
  {:else if isTitle}
    <!-- Title styled like wikilink -->
    {#if !value || (typeof value === 'string' && !value.trim())}
      {#if onTitleClick}
        <button class="title-link untitled" onclick={onTitleClick} type="button">
          <span class="title-text">Untitled</span>
        </button>
      {:else}
        <span class="title-link untitled"><span class="title-text">Untitled</span></span>
      {/if}
    {:else if onTitleClick}
      <button class="title-link" onclick={onTitleClick} type="button">
        <span class="title-text">{displayValue}</span>
      </button>
    {:else}
      <span class="title-link"><span class="title-text">{displayValue}</span></span>
    {/if}
  {:else}
    <!-- Default text display -->
    {displayValue}
  {/if}
</span>

<style>
  .column-cell {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title-cell {
    font-weight: 600;
  }

  .title-link {
    display: inline-flex;
    align-items: center;
    padding: 0 0.175rem;
    border: none;
    border-radius: 0.25rem;
    background: rgba(0, 0, 0, 0.03);
    color: #1a1a1a;
    text-decoration: none;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .title-link:hover {
    background: rgba(0, 0, 0, 0.06);
    color: #0066cc;
  }

  span.title-link {
    cursor: default;
  }

  .title-text {
    text-decoration: underline;
  }

  .title-link.untitled {
    background: transparent;
    color: var(--text-placeholder, #999);
    font-style: italic;
    font-weight: 400;
  }

  .title-link.untitled .title-text {
    text-decoration: none;
  }

  @media (prefers-color-scheme: dark) {
    .title-link {
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
    }

    .title-link:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }
  }

  .boolean-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border: 1.5px solid var(--border-medium);
    border-radius: 0.25rem;
    background: var(--bg-secondary);
    color: var(--text-muted);
  }

  .boolean-check.checked {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }

  .pills {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    overflow: hidden;
  }

  .pill {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: var(--bg-tertiary);
    border-radius: 0.25rem;
    font-size: 0.7rem;
    color: var(--text-secondary);
    white-space: nowrap;
    max-width: 8rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .with-links {
    display: inline;
  }

  .wikilink {
    display: inline;
    padding: 0;
    background: none;
    border: none;
    color: var(--accent-primary);
    cursor: pointer;
    font-size: inherit;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 2px;
  }

  .wikilink:hover {
    text-decoration-style: solid;
  }
</style>
