<script lang="ts">
  import type { Note } from '@/server/core/notes';
  import { getChatService } from '../services/chatService';
  import type { GetNoteTypeInfoResult } from '@/server/api/types';
  import type { ReviewItem } from '../types/review';
  import ReviewHistoryPanel from './review/ReviewHistoryPanel.svelte';

  interface Props {
    note: Note | null;
    expanded: boolean;
    onMetadataUpdate?: (metadata: Record<string, unknown>) => Promise<void>;
  }

  let { note, expanded, onMetadataUpdate }: Props = $props();

  let editedMetadata = $state<Record<string, unknown>>({});
  let isSaving = $state(false);
  let noteTypeInfo = $state<GetNoteTypeInfoResult | null>(null);
  let loadingSchema = $state(false);
  let currentNoteType = $state<string | null>(null);
  let reviewItem = $state<ReviewItem | null>(null);
  let loadingReviewHistory = $state(false);

  // System fields that are read-only (managed by the system, not user-editable)
  // NOTE: This must be kept in sync with SYSTEM_FIELDS in src/server/core/system-fields.ts
  const SYSTEM_FIELDS = new Set([
    'id',
    'type',
    'title',
    'filename',
    'created',
    'updated',
    'path',
    'content',
    'content_hash',
    'size'
  ]);

  let formattedMetadata = $derived.by(() => {
    if (!note) return [];

    const metadata = note.metadata || {};
    const result: Array<{
      key: string;
      value: string;
      type: string;
      isEmpty?: boolean;
      isSystem?: boolean;
      isEditable?: boolean;
      uniqueId?: string;
    }> = [];

    // Track seen keys to prevent duplicates
    const seenKeys = new Set<string>();

    // Add system metadata fields (read-only)
    if (note.id) {
      const key = 'ID';
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push({
          key,
          value: note.id,
          type: 'text',
          isSystem: true,
          isEditable: false,
          uniqueId: `${key}-${result.length}`
        });
      }
    }

    if (note.created) {
      const date = new Date(note.created);
      const key = 'Created';
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push({
          key,
          value:
            date.toLocaleDateString() +
            ' ' +
            date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'date',
          isSystem: true,
          isEditable: false,
          uniqueId: `${key}-${result.length}`
        });
      }
    }

    if (note.modified) {
      const date = new Date(note.modified);
      const key = 'Modified';
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push({
          key,
          value:
            date.toLocaleDateString() +
            ' ' +
            date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'date',
          isSystem: true,
          isEditable: false,
          uniqueId: `${key}-${result.length}`
        });
      }
    }

    if (note.filename) {
      const key = 'Filename';
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push({
          key,
          value: note.filename,
          type: 'text',
          isSystem: true,
          isEditable: false,
          uniqueId: `${key}-${result.length}`
        });
      }
    }

    if (note.path) {
      const key = 'Path';
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push({
          key,
          value: note.path,
          type: 'path',
          isSystem: true,
          isEditable: false,
          uniqueId: `${key}-${result.length}`
        });
      }
    }

    // Type is now displayed in the header, not in metadata

    // Add tags (editable)
    const tagsKey = 'Tags';
    if (!seenKeys.has(tagsKey)) {
      seenKeys.add(tagsKey);
      if (metadata.tags && Array.isArray(metadata.tags) && metadata.tags.length > 0) {
        result.push({
          key: tagsKey,
          value: metadata.tags.join(', '),
          type: 'tags',
          isSystem: false,
          isEditable: true,
          uniqueId: `${tagsKey}-${result.length}`
        });
      } else {
        result.push({
          key: tagsKey,
          value: '—',
          type: 'tags',
          isEmpty: true,
          isSystem: false,
          isEditable: true,
          uniqueId: `${tagsKey}-${result.length}`
        });
      }
    }

    // Add schema-defined metadata fields if available
    // Note: standardFields is used to filter out fields from metadata that shouldn't be shown
    // This includes both system fields and fields handled elsewhere
    const standardFields = new Set([
      'id',
      'title',
      'type',
      'created',
      'updated',
      'modified',
      'tags',
      'filename',
      'path',
      'content',
      'content_hash',
      'size',
      'links'
    ]);

    const schemaFields = new Set();

    // Add schema fields from noteTypeInfo if available
    if (noteTypeInfo?.metadata_schema?.fields) {
      for (const fieldDef of noteTypeInfo.metadata_schema.fields) {
        // Skip system fields that may be defined in schema
        if (SYSTEM_FIELDS.has(fieldDef.name)) {
          continue;
        }

        schemaFields.add(fieldDef.name);

        // Show all schema fields, even if they don't have values
        const value = metadata[fieldDef.name];
        let displayValue: string;
        let valueType = fieldDef.type;

        let isEmpty = false;

        if (value === undefined || value === null || value === '') {
          // Show placeholder for empty schema fields
          displayValue = '—';
          valueType = 'string'; // Use 'string' as fallback instead of 'empty'
          isEmpty = true;
        } else if (Array.isArray(value)) {
          if (value.length > 0) {
            displayValue = value.join(', ');
            valueType = 'array';
          } else {
            displayValue = '—';
            valueType = 'string'; // Use 'string' as fallback instead of 'empty'
            isEmpty = true;
          }
        } else if (typeof value === 'object') {
          displayValue = JSON.stringify(value, null, 2);
          valueType = 'string'; // Use 'string' as fallback for objects
        } else if (typeof value === 'boolean') {
          displayValue = value ? 'True' : 'False';
          valueType = 'boolean';
        } else {
          displayValue = String(value);
        }

        const displayKey = fieldDef.name.charAt(0).toUpperCase() + fieldDef.name.slice(1);
        // Check for duplicates before adding
        if (!seenKeys.has(displayKey)) {
          seenKeys.add(displayKey);
          result.push({
            key: displayKey,
            value: displayValue,
            type: valueType,
            isEmpty,
            isSystem: false,
            isEditable: true,
            uniqueId: `${displayKey}-${result.length}`
          });
        }
      }
    }

    // Add custom metadata fields that aren't in schema (excluding standard ones)
    Object.entries(metadata).forEach(([key, value]) => {
      if (
        !standardFields.has(key) &&
        !schemaFields.has(key) &&
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
            return; // Skip empty arrays for non-schema fields
          }
        } else if (typeof value === 'object') {
          displayValue = JSON.stringify(value, null, 2);
          valueType = 'object';
        } else {
          displayValue = String(value);
        }

        const displayKey = key.charAt(0).toUpperCase() + key.slice(1);
        // Check for duplicates before adding
        if (!seenKeys.has(displayKey)) {
          seenKeys.add(displayKey);
          result.push({
            key: displayKey,
            value: displayValue,
            type: valueType,
            isSystem: false,
            isEditable: true,
            uniqueId: `${displayKey}-${result.length}`
          });
        }
      }
    });

    return result;
  });

  let hasMetadata = $derived(formattedMetadata.length > 0);

  // Initialize metadata when note changes
  $effect(() => {
    if (note) {
      // Only load schema if the note type actually changed
      if (note.type !== currentNoteType) {
        currentNoteType = note.type;
        loadNoteTypeSchema(note.type);
      }
      editedMetadata = {
        type: note.type,
        tags: note.metadata?.tags ? [...(note.metadata.tags as string[])] : [],
        ...note.metadata
      };
      // Load review history if expanded
      if (expanded) {
        loadReviewHistory(note.id);
      }
    } else {
      // Reset when note is cleared
      currentNoteType = null;
      noteTypeInfo = null;
      reviewItem = null;
    }
  });

  async function loadNoteTypeSchema(typeName: string): Promise<void> {
    if (loadingSchema || !typeName) return;

    try {
      loadingSchema = true;
      const noteService = getChatService();
      if (await noteService.isReady()) {
        noteTypeInfo = await noteService.getNoteTypeInfo({ typeName });

        // Initialize schema fields that don't exist in the note yet
        if (noteTypeInfo?.metadata_schema?.fields) {
          for (const fieldDef of noteTypeInfo.metadata_schema.fields) {
            if (editedMetadata[fieldDef.name] === undefined) {
              editedMetadata[fieldDef.name] = fieldDef.default || '';
            }
          }
        }
      }
    } catch (err) {
      console.error('Error loading note type schema:', err);
      noteTypeInfo = null;
    } finally {
      loadingSchema = false;
    }
  }

  async function loadReviewHistory(noteId: string): Promise<void> {
    if (loadingReviewHistory || !noteId) return;

    try {
      loadingReviewHistory = true;
      reviewItem = await window.api?.getReviewItem(noteId);
    } catch (err) {
      console.error('Error loading review history:', err);
      reviewItem = null;
    } finally {
      loadingReviewHistory = false;
    }
  }

  async function handleMetadataChange(key: string, value: unknown): Promise<void> {
    if (!note || !onMetadataUpdate) return;

    // Update local state
    editedMetadata[key] = value;

    // Prepare metadata update - only include editable fields
    const filteredMetadata = Object.fromEntries(
      Object.entries(editedMetadata).filter(([key, value]) => {
        // Exclude system fields that shouldn't be in metadata
        if (SYSTEM_FIELDS.has(key)) {
          return false;
        }

        // For arrays (like tags), only include if they have content
        if (Array.isArray(value)) {
          return value.length > 0 && value.some((item) => item !== '' && item != null);
        }

        // For other values, only include if they have meaningful content
        return value !== undefined && value !== null && value !== '';
      })
    );

    try {
      isSaving = true;
      await onMetadataUpdate(filteredMetadata);
    } catch (error) {
      console.error('Failed to update metadata:', error);
    } finally {
      isSaving = false;
    }
  }

  function addTag(): void {
    const tags = (editedMetadata.tags as string[]) || [];
    tags.push('');
    editedMetadata.tags = [...tags];
  }

  function removeTag(index: number): void {
    const tags = (editedMetadata.tags as string[]) || [];
    tags.splice(index, 1);
    editedMetadata.tags = [...tags];
    handleMetadataChange('tags', editedMetadata.tags);
  }

  function updateTag(index: number, value: string): void {
    const tags = (editedMetadata.tags as string[]) || [];
    tags[index] = value.trim();
    editedMetadata.tags = [...tags];
  }

  async function handlePathClick(path: string): Promise<void> {
    try {
      await window.api?.showItemInFolder({ path });
    } catch (error) {
      console.error('Failed to reveal file in folder:', error);
    }
  }
</script>

<div class="metadata-section">
  {#if expanded && hasMetadata}
    <div id="metadata-content" class="metadata-content">
      <div class="metadata-grid">
        {#each formattedMetadata as item (item.uniqueId)}
          <div class="metadata-item" class:system-field={item.isSystem}>
            <div class="metadata-key">{item.key}</div>
            <div
              class="metadata-value"
              data-type={item.type}
              class:empty-value={item.isEmpty}
            >
              {#if item.isSystem}
                <!-- System fields: read-only display -->
                {#if item.type === 'path'}
                  <button
                    class="path-button"
                    onclick={() => handlePathClick(item.value)}
                    type="button"
                    title="Reveal in Finder"
                  >
                    <code class="path-value">{item.value}</code>
                  </button>
                {:else if item.type === 'date'}
                  <span class="date-value">{item.value}</span>
                {:else}
                  <span class="system-value">{item.value}</span>
                {/if}
              {:else if item.type === 'tags'}
                <!-- Tags - always editable -->
                <div class="tags-edit-container">
                  {#each (editedMetadata.tags as string[]) || [] as tag, index (index)}
                    <div class="tag-pill">
                      <input
                        type="text"
                        class="tag-input"
                        value={tag}
                        onchange={(e) =>
                          updateTag(index, (e.target as HTMLInputElement).value)}
                        onblur={() => handleMetadataChange('tags', editedMetadata.tags)}
                        placeholder="tag"
                        disabled={isSaving}
                      />
                      <button
                        class="tag-remove"
                        onclick={() => removeTag(index)}
                        type="button"
                        title="Remove tag"
                        disabled={isSaving}
                      >
                        ×
                      </button>
                    </div>
                  {/each}
                  <button
                    class="tag-add"
                    onclick={addTag}
                    type="button"
                    title="Add tag"
                    disabled={isSaving}
                  >
                    +
                  </button>
                </div>
              {:else if item.type === 'boolean'}
                <!-- Boolean checkbox - always editable -->
                <label class="inline-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(editedMetadata[item.key.toLowerCase()])}
                    onchange={(e) =>
                      handleMetadataChange(
                        item.key.toLowerCase(),
                        (e.target as HTMLInputElement).checked
                      )}
                    disabled={isSaving}
                  />
                  <span>{editedMetadata[item.key.toLowerCase()] ? 'Yes' : 'No'}</span>
                </label>
              {:else if item.type === 'number'}
                <!-- Number input - always editable -->
                <input
                  type="number"
                  class="inline-input"
                  value={editedMetadata[item.key.toLowerCase()] || ''}
                  onchange={(e) =>
                    handleMetadataChange(
                      item.key.toLowerCase(),
                      Number((e.target as HTMLInputElement).value)
                    )}
                  placeholder="—"
                  disabled={isSaving}
                />
              {:else}
                <!-- Text input - always editable -->
                <input
                  type="text"
                  class="inline-input"
                  value={String(editedMetadata[item.key.toLowerCase()] || '')}
                  onchange={(e) =>
                    handleMetadataChange(
                      item.key.toLowerCase(),
                      (e.target as HTMLInputElement).value
                    )}
                  placeholder="—"
                  disabled={isSaving}
                />
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if reviewItem && reviewItem.reviewHistory.length > 0}
        <div class="review-history-section">
          <h3 class="review-history-title">Review History</h3>
          <ReviewHistoryPanel history={reviewItem.reviewHistory} compact={true} />
        </div>
      {/if}
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
    gap: 0.5rem;
  }

  .metadata-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2fr;
    gap: 1rem;
    align-items: center;
    padding: 0.25rem 0;
  }

  .metadata-item.system-field {
    opacity: 0.7;
  }

  .metadata-key {
    font-size: 0.75rem;
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

  .metadata-value.empty-value {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  /* System field values */
  .system-value,
  .date-value {
    color: var(--text-secondary);
    font-size: 0.8rem;
  }

  .date-value {
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
  }

  .path-button {
    display: block;
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .path-button:hover {
    background: var(--bg-secondary);
  }

  .path-value {
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.75rem;
    color: var(--text-secondary);
    opacity: 0.8;
  }

  .path-button:hover .path-value {
    opacity: 1;
    text-decoration: underline;
  }

  /* Inline editable inputs - borderless, blend with background */
  .inline-input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: inherit;
    transition: background 0.15s ease;
  }

  .inline-input:hover {
    background: var(--bg-secondary);
  }

  .inline-input:focus {
    outline: none;
    background: var(--bg-secondary);
    box-shadow: inset 0 0 0 1px var(--border-light);
  }

  .inline-input::placeholder {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .inline-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .inline-checkbox input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .inline-checkbox span {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  /* Tag editing - pill-style with inline editing */
  .tags-edit-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: center;
  }

  .tag-pill {
    display: inline-flex;
    align-items: center;
    background: var(--bg-secondary);
    border-radius: 1rem;
    padding: 0.125rem 0.125rem 0.125rem 0.5rem;
    gap: 0.25rem;
    transition: background 0.15s ease;
  }

  .tag-pill:hover {
    background: var(--bg-tertiary);
  }

  .tag-input {
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.75rem;
    padding: 0;
    min-width: 3ch;
    max-width: 12ch;
    outline: none;
  }

  .tag-input::placeholder {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .tag-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 50%;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    transition: all 0.15s ease;
  }

  .tag-remove:hover {
    background: var(--bg-danger);
    color: white;
  }

  .tag-add {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px dashed var(--border-light);
    background: transparent;
    color: var(--text-secondary);
    border-radius: 50%;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    transition: all 0.15s ease;
  }

  .tag-add:hover {
    background: var(--bg-secondary);
    border-color: var(--text-secondary);
    color: var(--text-primary);
  }

  .no-metadata {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-style: italic;
    text-align: center;
    padding: 1rem 0;
  }

  .review-history-section {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
  }

  .review-history-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 0.75rem 0;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .metadata-item {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }

    .metadata-key {
      font-size: 0.7rem;
    }

    .metadata-value {
      font-size: 0.8rem;
    }
  }
</style>
