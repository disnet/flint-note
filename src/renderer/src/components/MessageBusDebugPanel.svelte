<script lang="ts">
  import { messageBus } from '../services/messageBus.svelte';

  let eventLog = $derived(messageBus.getEventLog());
  let loggingEnabled = $state(import.meta.env.DEV);
  let showPanel = $state(false);
  let filterType = $state<string>('*');
  let maxEvents = $state(100);

  // Get unique event types from log
  const eventTypes = $derived.by(() => {
    const types = new Set(eventLog.map((e) => e.type));
    return ['*', ...Array.from(types)].sort();
  });

  // Filter events based on selected type
  const filteredEvents = $derived.by(() => {
    if (filterType === '*') {
      return eventLog.slice(-maxEvents);
    }
    return eventLog.filter((e) => e.type === filterType).slice(-maxEvents);
  });

  function toggleLogging(): void {
    loggingEnabled = !loggingEnabled;
    messageBus.setLogging(loggingEnabled);
  }

  function clearLog(): void {
    messageBus.clearEventLog();
  }

  function togglePanel(): void {
    showPanel = !showPanel;
  }

  function formatTimestamp(_event: { type: string }): string {
    return new Date().toLocaleTimeString();
  }

  function getEventColor(type: string): string {
    if (type.includes('created')) return '#10b981'; // green
    if (type.includes('updated')) return '#3b82f6'; // blue
    if (type.includes('deleted')) return '#ef4444'; // red
    if (type.includes('renamed')) return '#f59e0b'; // amber
    if (type.includes('moved')) return '#8b5cf6'; // purple
    if (type.includes('vault')) return '#ec4899'; // pink
    return '#6b7280'; // gray
  }

  // Initialize logging state on mount
  $effect(() => {
    messageBus.setLogging(loggingEnabled);
  });
</script>

{#if import.meta.env.DEV}
  <!-- Floating toggle button -->
  <button class="debug-toggle" onclick={togglePanel} title="Toggle Event Debug Panel">
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
    {#if eventLog.length > 0}
      <span class="badge">{eventLog.length}</span>
    {/if}
  </button>

  {#if showPanel}
    <div class="debug-panel">
      <div class="panel-header">
        <h3>Message Bus Event Log</h3>
        <button class="close-btn" onclick={togglePanel}>&times;</button>
      </div>

      <div class="panel-controls">
        <div class="control-group">
          <label>
            <input type="checkbox" checked={loggingEnabled} onchange={toggleLogging} />
            Enable Logging
          </label>
        </div>

        <div class="control-group">
          <label>
            Filter:
            <select bind:value={filterType}>
              {#each eventTypes as type (type)}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </label>
        </div>

        <div class="control-group">
          <label>
            Max:
            <input type="number" bind:value={maxEvents} min="10" max="1000" step="10" />
          </label>
        </div>

        <button class="clear-btn" onclick={clearLog}>Clear Log</button>
      </div>

      <div class="event-log">
        {#if filteredEvents.length === 0}
          <div class="empty-state">
            {#if !loggingEnabled}
              Logging is disabled. Enable it to see events.
            {:else}
              No events yet. Interact with the app to see events.
            {/if}
          </div>
        {:else}
          {#each filteredEvents as event, index (index)}
            <div class="event-item">
              <div class="event-header">
                <span class="event-type" style="color: {getEventColor(event.type)}">
                  {event.type}
                </span>
                <span class="event-time">{formatTimestamp(event)}</span>
              </div>
              <details>
                <summary>View Details</summary>
                <pre class="event-data">{JSON.stringify(event, null, 2)}</pre>
              </details>
            </div>
          {/each}
        {/if}
      </div>

      <div class="panel-footer">
        <div class="stats">
          Total Events: {eventLog.length} | Showing: {filteredEvents.length}
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .debug-toggle {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #3b82f6;
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 9998;
    transition: all 0.2s;
  }

  .debug-toggle:hover {
    background: #2563eb;
    transform: scale(1.1);
  }

  .badge {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #ef4444;
    color: white;
    border-radius: 10px;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: bold;
  }

  .debug-panel {
    position: fixed;
    bottom: 80px;
    right: 20px;
    width: 500px;
    max-height: 600px;
    background: var(--surface, #1f2937);
    border: 1px solid var(--border, #374151);
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    z-index: 9999;
    color: var(--text, #e5e7eb);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border, #374151);
    background: var(--surface-elevated, #111827);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-secondary, #9ca3af);
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: var(--text, #e5e7eb);
  }

  .panel-controls {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border, #374151);
    flex-wrap: wrap;
    align-items: center;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .control-group label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .control-group input[type='checkbox'] {
    cursor: pointer;
  }

  .control-group select,
  .control-group input[type='number'] {
    background: var(--surface-elevated, #111827);
    border: 1px solid var(--border, #374151);
    color: var(--text, #e5e7eb);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
  }

  .control-group input[type='number'] {
    width: 60px;
  }

  .clear-btn {
    background: #ef4444;
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .clear-btn:hover {
    background: #dc2626;
  }

  .event-log {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--text-secondary, #9ca3af);
    font-size: 14px;
    text-align: center;
    padding: 20px;
  }

  .event-item {
    background: var(--surface-elevated, #111827);
    border: 1px solid var(--border, #374151);
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 8px;
  }

  .event-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .event-type {
    font-weight: 600;
    font-size: 13px;
  }

  .event-time {
    font-size: 11px;
    color: var(--text-secondary, #9ca3af);
  }

  details summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary, #9ca3af);
    padding: 4px 0;
  }

  details summary:hover {
    color: var(--text, #e5e7eb);
  }

  .event-data {
    margin: 8px 0 0 0;
    padding: 8px;
    background: #0f1419;
    border-radius: 4px;
    font-size: 11px;
    overflow-x: auto;
    color: #d1d5db;
  }

  .panel-footer {
    padding: 8px 16px;
    border-top: 1px solid var(--border, #374151);
    background: var(--surface-elevated, #111827);
  }

  .stats {
    font-size: 12px;
    color: var(--text-secondary, #9ca3af);
  }
</style>
