<script lang="ts">
  import type { Note } from '@/server/core/notes';

  interface Props {
    note: Note | null;
    expanded: boolean;
    onToggle: () => void;
  }

  let { note, expanded, onToggle }: Props = $props();

  let formattedMetadata = $derived.by(() => {
    if (!note) return [];

    const metadata = note.metadata || {};
    const result: Array<{ key: string; value: string; type: string }> = [];

    // Add standard metadata fields
    if (note.type) {
      result.push({ key: 'Type', value: note.type, type: 'text' });
    }

    if (note.created) {
      const date = new Date(note.created);
      result.push({
        key: 'Created',
        value:
          date.toLocaleDateString() +
          ' ' +
          date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'date'
      });
    }

    if (note.modified) {
      const date = new Date(note.modified);
      result.push({
        key: 'Modified',
        value:
          date.toLocaleDateString() +
          ' ' +
          date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'date'
      });
    }

    if (note.filename) {
      result.push({ key: 'Filename', value: note.filename, type: 'text' });
    }

    if (note.path) {
      result.push({ key: 'Path', value: note.path, type: 'path' });
    }

    if (metadata.tags && Array.isArray(metadata.tags) && metadata.tags.length > 0) {
      result.push({
        key: 'Tags',
        value: metadata.tags.join(', '),
        type: 'tags'
      });
    }

    // Add custom metadata fields (excluding standard ones)
    const standardFields = new Set([
      'title',
      'type',
      'created',
      'updated',
      'modified',
      'tags',
      'filename',
      'links'
    ]);

    Object.entries(metadata).forEach(([key, value]) => {
      if (
        !standardFields.has(key) &&
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        let displayValue: string;
        let valueType = 'text';

        if (Array.isArray(value)) {
          if (value.length > 0) {
            displayValue = value.join(', ');
            valueType = 'array';
          } else {
            return; // Skip empty arrays
          }
        } else if (typeof value === 'object') {
          displayValue = JSON.stringify(value, null, 2);
          valueType = 'object';
        } else {
          displayValue = String(value);
        }

        result.push({
          key: key.charAt(0).toUpperCase() + key.slice(1),
          value: displayValue,
          type: valueType
        });
      }
    });

    return result;
  });

  let hasMetadata = $derived(formattedMetadata.length > 0);
</script>

<div class="metadata-section">
  <button
    class="metadata-header"
    class:expanded
    onclick={onToggle}
    type="button"
    aria-expanded={expanded}
    aria-controls="metadata-content"
  >
    <span class="metadata-icon">
      {expanded ? '▼' : '▶'}
    </span>
    <span class="metadata-title">Metadata</span>
    {#if hasMetadata}
      <span class="metadata-count">({formattedMetadata.length})</span>
    {/if}
  </button>

  {#if expanded && hasMetadata}
    <div id="metadata-content" class="metadata-content">
      <div class="metadata-grid">
        {#each formattedMetadata as item (item.key)}
          <div class="metadata-item">
            <div class="metadata-key">{item.key}</div>
            <div class="metadata-value" data-type={item.type}>
              {#if item.type === 'tags'}
                <div class="tags-container">
                  {#each item.value.split(', ') as tag, index (index)}
                    <span class="tag">{tag}</span>
                  {/each}
                </div>
              {:else if item.type === 'path'}
                <code class="path-value">{item.value}</code>
              {:else if item.type === 'object'}
                <pre class="object-value">{item.value}</pre>
              {:else}
                {item.value}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if expanded && !hasMetadata}
    <div id="metadata-content" class="metadata-content">
      <div class="no-metadata">No metadata available</div>
    </div>
  {/if}
</div>

<style>
  .metadata-section {
    width: 100%;
    max-width: 75ch;
    margin: 0 auto;
  }

  .metadata-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    transition: color 0.2s ease;
    text-align: left;
  }

  .metadata-header:hover {
    color: var(--text-primary);
  }

  .metadata-header.expanded {
    color: var(--text-primary);
  }

  .metadata-icon {
    font-size: 0.75rem;
    width: 1rem;
    text-align: center;
    transition: transform 0.2s ease;
  }

  .metadata-title {
    flex: 1;
  }

  .metadata-count {
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .metadata-content {
    padding: 0.75rem 0 1rem 0;
    border-bottom: 1px solid var(--border-light);
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .metadata-grid {
    display: grid;
    gap: 0.75rem;
  }

  .metadata-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2fr;
    gap: 1rem;
    align-items: start;
  }

  .metadata-key {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .metadata-value {
    font-size: 0.875rem;
    color: var(--text-primary);
    word-break: break-word;
  }

  .metadata-value[data-type='date'] {
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.8rem;
  }

  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .tag {
    display: inline-block;
    background: var(--bg-secondary);
    color: var(--text-primary);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid var(--border-light);
  }

  .path-value {
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.8rem;
    background: var(--bg-secondary);
    padding: 0.25rem 0.375rem;
    border-radius: 0.25rem;
    color: var(--text-primary);
    border: 1px solid var(--border-light);
  }

  .object-value {
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.75rem;
    background: var(--bg-secondary);
    padding: 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid var(--border-light);
    margin: 0;
    white-space: pre-wrap;
    overflow-x: auto;
  }

  .no-metadata {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-style: italic;
    text-align: center;
    padding: 1rem 0;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .metadata-item {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }

    .metadata-key {
      font-size: 0.75rem;
    }

    .metadata-value {
      font-size: 0.8rem;
    }
  }
</style>
