<script lang="ts">
  import { getChatService } from '../services/chatService';
  import EmojiPicker from './EmojiPicker.svelte';

  interface Props {
    onBack: () => void;
    onCreated?: () => void;
  }

  let { onBack, onCreated }: Props = $props();

  let typeName = $state('');
  let description = $state('');
  let icon = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function handleSubmit(): Promise<void> {
    // Validate
    if (!typeName.trim()) {
      error = 'Type name is required';
      return;
    }

    // Sanitize type name (lowercase, replace spaces with hyphens)
    const sanitizedName = typeName.trim().toLowerCase().replace(/\s+/g, '-');

    try {
      loading = true;
      error = null;

      const noteService = getChatService();
      if (await noteService.isReady()) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          error = 'No vault selected';
          return;
        }

        await noteService.createNoteType({
          typeName: sanitizedName,
          description: description.trim() || '',
          icon: icon || undefined,
          vaultId: currentVault.id
        });

        // Success! Navigate back
        onCreated?.();
        onBack();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create note type';
      console.error('Error creating note type:', err);
    } finally {
      loading = false;
    }
  }

  function handleCancel(): void {
    onBack();
  }
</script>

<div class="create-view">
  <div class="header">
    <button class="back-button" onclick={onBack}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Note Types
    </button>
  </div>

  <div class="content">
    <h1 class="title">Create Note Type</h1>

    {#if error}
      <div class="error-banner">
        <p>{error}</p>
      </div>
    {/if}

    <form
      class="form"
      onsubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div class="form-group">
        <label for="type-name" class="label">
          Type Name <span class="required">*</span>
        </label>
        <input
          id="type-name"
          type="text"
          class="input"
          bind:value={typeName}
          placeholder="e.g., meeting-notes"
          disabled={loading}
        />
        <p class="help-text">
          Use lowercase letters, numbers, and hyphens. Spaces will be converted to
          hyphens.
        </p>
      </div>

      <div class="form-group">
        <label for="description" class="label">Description</label>
        <textarea
          id="description"
          class="textarea"
          bind:value={description}
          placeholder="Brief description of what this note type is for..."
          disabled={loading}
          rows="4"
        ></textarea>
        <p class="help-text">
          This will be shown on the note type card and helps users understand when to use
          this type.
        </p>
      </div>

      <div class="form-group">
        <div class="label" role="heading" aria-level="2">Icon (Optional)</div>
        <EmojiPicker bind:value={icon} onselect={(emoji) => (icon = emoji)} />
        <p class="help-text">Choose an emoji icon to represent this note type.</p>
      </div>

      <div class="actions">
        <button type="submit" class="create-btn" disabled={loading || !typeName.trim()}>
          {loading ? 'Creating...' : 'Create Type'}
        </button>
        <button
          type="button"
          class="cancel-btn"
          onclick={handleCancel}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .create-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }

  .header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .back-button:hover {
    color: var(--accent-primary);
  }

  .content {
    flex: 1;
    overflow: auto;
    padding: 2rem;
    max-width: 600px;
    width: 100%;
    margin: 0 auto;
  }

  .title {
    margin: 0 0 2rem 0;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .error-banner {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 1rem;
    border-radius: 0.375rem;
    margin-bottom: 1.5rem;
    border-left: 3px solid var(--error-border, #ef4444);
  }

  .error-banner p {
    margin: 0;
    font-size: 0.875rem;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .required {
    color: var(--error-text);
  }

  .input,
  .textarea {
    padding: 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--text-primary);
    background: var(--bg-primary);
    transition: border-color 0.2s ease;
  }

  .input:focus,
  .textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .input:disabled,
  .textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .textarea {
    resize: vertical;
    min-height: 100px;
  }

  .help-text {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .create-btn,
  .cancel-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .create-btn {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .create-btn:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .create-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-btn {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border: 1px solid var(--border-medium);
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
