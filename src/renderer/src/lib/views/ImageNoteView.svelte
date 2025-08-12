<script lang="ts">
  import BaseNoteView from './BaseNoteView.svelte';
  import type { NoteViewProps } from './ViewRegistry';

  let {
    activeNote,
    noteContent,
    metadata,
    onContentChange,
    onMetadataChange,
    onSave
  }: NoteViewProps = $props();

  let imageUrl = $state('');
  let showEditor = $state(true);

  // Extract image URL from metadata or content
  $effect(() => {
    // Check direct metadata for image_url first
    if (metadata.image_url) {
      imageUrl = metadata.image_url as string;
    } else {
      // Look for images in markdown content as fallback
      const imageMatch = noteContent.match(/!\[.*?\]\((.*?)\)/);
      imageUrl = imageMatch ? imageMatch[1] : '';
    }
  });

  function handleImageUrlChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const newUrl = target.value;

    // Update metadata with new image URL
    const updatedMetadata = {
      ...metadata,
      image_url: newUrl
    };

    onMetadataChange(updatedMetadata);
  }

  function handleImageUpload(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;

        // Update metadata with uploaded image data
        const updatedMetadata = {
          ...metadata,
          image_url: dataUrl
        };

        onMetadataChange(updatedMetadata);
      };
      reader.readAsDataURL(file);
    }
  }

  function toggleEditor(): void {
    showEditor = !showEditor;
  }
</script>

<BaseNoteView
  {activeNote}
  {noteContent}
  {metadata}
  {onContentChange}
  {onMetadataChange}
  {onSave}
  let:handleContentChange
  let:handleSave
>
  <div class="image-note-view">
    <div class="image-controls">
      <div class="control-group">
        <label for="image-url">Image URL:</label>
        <input
          id="image-url"
          type="url"
          value={(metadata.image_url as string) || ''}
          oninput={handleImageUrlChange}
          placeholder="Enter image URL or upload below"
        />
      </div>

      <div class="control-group">
        <label for="image-upload">Upload Image:</label>
        <input
          id="image-upload"
          type="file"
          accept="image/*"
          onchange={handleImageUpload}
        />
      </div>

      <button onclick={toggleEditor} class="toggle-editor">
        {showEditor ? 'Hide' : 'Show'} Editor
      </button>
    </div>

    <div class="content-area" class:editor-hidden={!showEditor}>
      {#if imageUrl}
        <div class="image-preview">
          <img src={imageUrl} alt={(metadata.title as string) || 'Image'} />
          <div class="image-metadata">
            {#if metadata.title || (metadata.metadata as Record<string, unknown>)?.title}
              <h3>
                {(metadata.title as string) ||
                  ((metadata.metadata as Record<string, unknown>)?.title as string)}
              </h3>
            {/if}
            {#if metadata.description || (metadata.metadata as Record<string, unknown>)?.description}
              <p class="description">
                {(metadata.description as string) ||
                  ((metadata.metadata as Record<string, unknown>)?.description as string)}
              </p>
            {/if}
          </div>
        </div>
      {:else}
        <div class="image-placeholder">
          <div class="placeholder-icon">🖼️</div>
          <p>No image specified. Add an image URL or upload a file above.</p>
        </div>
      {/if}

      {#if showEditor}
        <div class="editor-section">
          <h4>Content</h4>
          <textarea
            class="content-editor"
            value={noteContent}
            oninput={(e) => handleContentChange((e.target as HTMLTextAreaElement).value)}
            placeholder="Add notes about this image..."
          ></textarea>
        </div>
      {/if}
    </div>

    <div class="action-bar">
      <button onclick={handleSave} class="save-button">Save</button>
    </div>
  </div>
</BaseNoteView>

<style>
  .image-note-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 1rem;
    padding: 1rem;
  }

  .image-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-light);
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .control-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .control-group input {
    padding: 0.5rem;
    border: 1px solid var(--border-medium);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    min-width: 200px;
  }

  .toggle-editor {
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .toggle-editor:hover {
    background: var(--accent-hover);
  }

  .content-area {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    min-height: 400px;
  }

  .content-area.editor-hidden {
    grid-template-columns: 1fr;
  }

  .image-preview {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1rem;
    border: 1px solid var(--border-light);
  }

  .image-preview img {
    max-width: 100%;
    max-height: 300px;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: var(--shadow-medium);
  }

  .image-metadata h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.125rem;
  }

  .image-metadata .description {
    margin: 0;
    color: var(--text-secondary);
    font-style: italic;
  }

  .image-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border: 2px dashed var(--border-light);
    border-radius: 8px;
    padding: 2rem;
  }

  .placeholder-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .editor-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .editor-section h4 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1rem;
  }

  .content-editor {
    flex: 1;
    min-height: 200px;
    padding: 1rem;
    border: 1px solid var(--border-medium);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    resize: vertical;
  }

  .action-bar {
    display: flex;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
  }

  .save-button {
    padding: 0.5rem 1.5rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  .save-button:hover {
    background: var(--accent-hover);
  }

  @media (max-width: 768px) {
    .content-area {
      grid-template-columns: 1fr;
    }

    .image-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .control-group input {
      min-width: auto;
    }
  }
</style>
