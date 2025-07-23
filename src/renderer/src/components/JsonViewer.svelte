<script lang="ts">
  interface JsonViewerProps {
    value: unknown;
    key?: string;
    depth?: number;
    isRoot?: boolean;
  }

  let { value, key, depth = 0, isRoot = false }: JsonViewerProps = $props();
  let isExpanded = $state(false);

  function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function isArray(v: unknown): v is unknown[] {
    return Array.isArray(v);
  }

  function isPrimitive(v: unknown): boolean {
    return v === null || typeof v !== 'object';
  }

  function getValueType(v: unknown): string {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function formatPrimitive(v: unknown): string {
    if (v === null) return 'null';
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
  }

  function getCollectionSize(v: unknown): number {
    if (Array.isArray(v)) return v.length;
    if (isObject(v)) return Object.keys(v).length;
    return 0;
  }

  function toggleExpanded(): void {
    isExpanded = !isExpanded;
  }
</script>

<div class="json-viewer" class:root={isRoot} style:--depth={depth}>
  {#if isPrimitive(value)}
    <div class="json-item primitive">
      {#if key}
        <span class="key">"{key}":</span>
      {/if}
      <span class="value {getValueType(value)}">{formatPrimitive(value)}</span>
    </div>
  {:else}
    <div class="json-item complex">
      <button class="expand-button" onclick={toggleExpanded}>
        <span class="expand-icon" class:rotated={isExpanded}>▶</span>
        {#if key}
          <span class="key">"{key}":</span>
        {/if}
        <span class="type-info">
          {isArray(value) ? '[' : '{'}
          {#if !isExpanded}
            <span class="size-hint">{getCollectionSize(value)} items</span>
          {/if}
          {isArray(value) ? ']' : '}'}
        </span>
      </button>

      {#if isExpanded}
        <div class="json-children">
          {#if isArray(value)}
            {#each value as item, index (index)}
              <svelte:self value={item} key={String(index)} depth={depth + 1} />
            {/each}
          {:else if isObject(value)}
            {#each Object.entries(value) as [k, v] (k)}
              <svelte:self value={v} key={k} depth={depth + 1} />
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .json-viewer {
    font-family:
      'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New',
      monospace;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .json-viewer.root {
    padding: 0.5rem;
  }

  .json-item {
    margin-left: calc(var(--depth, 0) * 0.5rem);
  }

  .json-item.primitive {
    padding: 0.125rem 0;
  }

  .json-item.complex {
    margin-bottom: 0.125rem;
  }

  .expand-button {
    background: none;
    border: none;
    padding: 0.125rem 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-family: inherit;
    font-size: inherit;
    width: 100%;
    text-align: left;
  }

  .expand-button:hover {
    background: var(--json-hover-bg, rgba(0, 0, 0, 0.05));
    border-radius: 2px;
  }

  .expand-icon {
    font-size: 0.7rem;
    color: var(--json-expand-color, #6c757d);
    transition: transform 0.15s ease;
    width: 0.8rem;
    text-align: center;
  }

  .expand-icon.rotated {
    transform: rotate(90deg);
  }

  .key {
    color: var(--json-key-color, #0969da);
    font-weight: 500;
  }

  .type-info {
    color: var(--json-bracket-color, #6c757d);
    font-weight: 500;
  }

  .size-hint {
    color: var(--json-size-hint-color, #8b949e);
    font-style: italic;
    font-size: 0.75rem;
    margin: 0 0.25rem;
  }

  .value.string {
    color: var(--json-string-color, #032f62);
  }

  .value.number {
    color: var(--json-number-color, #0550ae);
  }

  .value.boolean {
    color: var(--json-boolean-color, #8250df);
    font-weight: 500;
  }

  .value.null {
    color: var(--json-null-color, #8b949e);
    font-style: italic;
  }

  .json-children {
    border-left: 1px solid var(--json-indent-border, #e1e4e8);
    margin-left: 0.3rem;
    padding-left: 0.4rem;
  }
</style>
