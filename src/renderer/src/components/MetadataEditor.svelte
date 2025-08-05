<script lang="ts">
  import { onMount } from 'svelte';
  import { getChatService } from '../services/chatService';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    activeNote: NoteMetadata | null;
    onMetadataUpdate?: (metadata: Partial<NoteMetadata>) => void;
  }

  let { activeNote, onMetadataUpdate }: Props = $props();

  let noteContent = $state<string>('');
  let frontmatterText = $state<string>('');
  let bodyContent = $state<string>('');
  let isLoading = $state(false);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let hasChanges = $state(false);
  let saveTimeout: number | null = null;

  // Editor state
  let frontmatterEditor: HTMLTextAreaElement;
  let parsedMetadata = $state<Record<string, unknown>>({});
  let validationError = $state<string | null>(null);

  // Load note content when active note changes
  $effect(() => {
    if (activeNote) {
      loadNoteContent();
    } else {
      resetEditor();
    }
  });

  async function loadNoteContent(): Promise<void> {
    if (!activeNote) return;

    isLoading = true;
    error = null;

    try {
      const noteService = getChatService();
      const note = await noteService.getNote({ identifier: activeNote.id });

      if (note) {
        noteContent = note.content || '';
        parseContentAndFrontmatter(noteContent);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load note content';
      console.error('Error loading note content:', err);
    } finally {
      isLoading = false;
    }
  }

  function parseContentAndFrontmatter(content: string): void {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (frontmatterMatch) {
      frontmatterText = frontmatterMatch[1] || '';
      bodyContent = frontmatterMatch[2] || '';
    } else {
      // No frontmatter exists, create default based on note metadata
      frontmatterText = generateDefaultFrontmatter();
      bodyContent = content;
    }

    parseYamlFrontmatter();
  }

  function generateDefaultFrontmatter(): string {
    if (!activeNote) return '';

    const metadata: Record<string, unknown> = {
      title: activeNote.title,
      tags: activeNote.tags || [],
      created: new Date(activeNote.created).toISOString(),
      modified: new Date(activeNote.modified).toISOString()
    };

    return Object.entries(metadata)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          if (value.length === 0) return `${key}: []`;
          return `${key}:\n${value.map((v) => `  - ${v}`).join('\n')}`;
        } else if (typeof value === 'string') {
          return `${key}: "${value}"`;
        } else {
          return `${key}: ${value}`;
        }
      })
      .join('\n');
  }

  function parseYamlFrontmatter(): void {
    validationError = null;

    try {
      // Enhanced YAML parsing with better error handling
      const lines = frontmatterText.split('\n');
      const parsed: Record<string, unknown> = {};
      
      let currentKey: string | null = null;
      let currentArray: string[] = [];
      let lineNumber = 0;
      
      for (const line of lines) {
        lineNumber++;
        const trimmed = line.trim();
        
        // Skip empty lines
        if (!trimmed) continue;
        
        // Skip comments
        if (trimmed.startsWith('#')) continue;
        
        // Array item
        if (trimmed.startsWith('- ')) {
          if (!currentKey) {
            throw new Error(`Line ${lineNumber}: Array item found without a key`);
          }
          const item = trimmed.substring(2).trim();
          // Handle quoted array items
          const cleanItem = item.replace(/^["']|["']$/g, '');
          currentArray.push(cleanItem);
          continue;
        }
        
        // Key-value pair
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
          // Save previous array if exists
          if (currentKey && currentArray.length > 0) {
            parsed[currentKey] = [...currentArray];
            currentArray = [];
          }
          
          currentKey = trimmed.substring(0, colonIndex).trim();
          const value = trimmed.substring(colonIndex + 1).trim();
          
          // Validate key format
          if (!currentKey.match(/^[a-zA-Z][a-zA-Z0-9_-]*$/)) {
            throw new Error(`Line ${lineNumber}: Invalid key format "${currentKey}". Keys must start with a letter and contain only letters, numbers, underscores, or hyphens.`);
          }
          
          if (value === '[]') {
            parsed[currentKey] = [];
          } else if (value === '') {
            // Key with no value, expect array items to follow
            continue;
          } else if (value) {
            // Handle different value types
            let cleanValue = value;
            
            // Boolean values
            if (value === 'true') {
              parsed[currentKey] = true;
            } else if (value === 'false') {
              parsed[currentKey] = false;
            }
            // Null values
            else if (value === 'null' || value === '~') {
              parsed[currentKey] = null;
            }
            // Numbers
            else if (/^-?\d+$/.test(value)) {
              parsed[currentKey] = parseInt(value, 10);
            }
            else if (/^-?\d*\.\d+$/.test(value)) {
              parsed[currentKey] = parseFloat(value);
            }
            // String values (remove quotes)
            else {
              cleanValue = value.replace(/^["']|["']$/g, '');
              
              // Validate ISO date strings if they look like dates
              if (cleanValue.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/)) {
                const date = new Date(cleanValue);
                if (isNaN(date.getTime())) {
                  throw new Error(`Line ${lineNumber}: Invalid date format "${cleanValue}". Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)`);
                }
              }
              
              parsed[currentKey] = cleanValue;
            }
          }
        } else if (colonIndex === -1 && trimmed) {
          throw new Error(`Line ${lineNumber}: Invalid syntax "${trimmed}". Expected "key: value" format.`);
        }
      }
      
      // Save final array if exists
      if (currentKey && currentArray.length > 0) {
        parsed[currentKey] = [...currentArray];
      }
      
      // Additional validation for common metadata fields
      if (parsed.tags && !Array.isArray(parsed.tags)) {
        throw new Error('Field "tags" must be an array');
      }
      
      if (parsed.aliases && !Array.isArray(parsed.aliases)) {
        throw new Error('Field "aliases" must be an array');
      }
      
      if (parsed.created && typeof parsed.created === 'string') {
        const date = new Date(parsed.created);
        if (isNaN(date.getTime())) {
          throw new Error('Field "created" must be a valid ISO date string');
        }
      }
      
      if (parsed.modified && typeof parsed.modified === 'string') {
        const date = new Date(parsed.modified);
        if (isNaN(date.getTime())) {
          throw new Error('Field "modified" must be a valid ISO date string');
        }
      }
      
      parsedMetadata = parsed;
    } catch (err) {
      validationError = err instanceof Error ? err.message : 'Invalid YAML syntax';
      parsedMetadata = {};
    }
  }

  function onFrontmatterChange(): void {
    hasChanges = true;
    parseYamlFrontmatter();
    debouncedSave();
  }

  async function saveNote(): Promise<void> {
    if (isSaving || !activeNote || validationError) return;

    try {
      isSaving = true;
      error = null;
      
      // Reconstruct full note content
      const newContent = frontmatterText.trim() 
        ? `---\n${frontmatterText}\n---\n${bodyContent}`
        : bodyContent;

      const noteService = getChatService();
      await noteService.updateNote({ 
        identifier: activeNote.id, 
        content: newContent 
      });
      
      hasChanges = false;
      
      // Notify parent of metadata changes
      if (onMetadataUpdate && Object.keys(parsedMetadata).length > 0) {
        onMetadataUpdate(parsedMetadata);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save metadata';
      console.error('Error saving metadata:', err);
    } finally {
      isSaving = false;
    }
  }

  function debouncedSave(): void {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = window.setTimeout(() => {
      if (hasChanges && !validationError) {
        saveNote();
      }
    }, 1000);
  }

  function resetEditor(): void {
    noteContent = '';
    frontmatterText = '';
    bodyContent = '';
    parsedMetadata = {};
    hasChanges = false;
    error = null;
    validationError = null;
    
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
  }

  function addCustomField(): void {
    const key = prompt('Enter field name:');
    if (key && key.trim()) {
      const value = prompt('Enter field value:');
      const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
      const cleanValue = value || '';
      
      // Add to frontmatter
      const newLine = `${cleanKey}: "${cleanValue}"`;
      frontmatterText = frontmatterText.trim() ? `${frontmatterText}\n${newLine}` : newLine;
      onFrontmatterChange();
    }
  }

  function removeField(fieldKey: string): void {
    const lines = frontmatterText.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith(`${fieldKey}:`) && !trimmed.startsWith(`- `) || 
             (trimmed.startsWith(`- `) && lines.findIndex(l => l.trim().startsWith(`${fieldKey}:`)) === -1);
    });
    
    frontmatterText = filteredLines.join('\n');
    onFrontmatterChange();
  }

  onMount(() => {
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  });
</script>

<div class="metadata-editor">
  {#if activeNote}
    <div class="editor-header">
      <h3>Note Metadata</h3>
      <div class="header-actions">
        {#if hasChanges}
          <span class="changes-indicator" title="Unsaved changes">●</span>
        {/if}
        {#if isSaving}
          <span class="saving-indicator">Saving...</span>
        {/if}
        <button class="add-field-btn" onclick={addCustomField} title="Add custom field" aria-label="Add custom field">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>
    </div>

    {#if isLoading}
      <div class="loading-state">
        <p>Loading metadata...</p>
      </div>
    {:else}
      <div class="editor-content">
        <!-- Basic Note Info -->
        <div class="metadata-section">
          <h4>Basic Information</h4>
          <div class="metadata-field">
            <label>Note ID</label>
            <input type="text" value={activeNote.id} readonly />
          </div>
          <div class="metadata-field">
            <label>Type</label>
            <input type="text" value={activeNote.type} readonly />
          </div>
          <div class="metadata-field">
            <label>File Path</label>
            <input type="text" value={activeNote.path} readonly />
          </div>
        </div>

        <!-- YAML Frontmatter Editor -->
        <div class="metadata-section">
          <h4>YAML Frontmatter</h4>
          {#if validationError}
            <div class="validation-error">
              <strong>Validation Error:</strong> {validationError}
            </div>
          {/if}
          <div class="yaml-editor">
            <textarea
              bind:this={frontmatterEditor}
              bind:value={frontmatterText}
              oninput={onFrontmatterChange}
              placeholder="Enter YAML frontmatter..."
              rows="10"
              spellcheck="false"
            ></textarea>
          </div>
          <div class="yaml-help">
            <details>
              <summary>YAML Syntax Help & Examples</summary>
              <div class="help-content">
                <h5>Basic Types</h5>
                <p><strong>Strings:</strong> <code>title: "My Note"</code> or <code>title: My Note</code></p>
                <p><strong>Numbers:</strong> <code>priority: 1</code> or <code>rating: 4.5</code></p>
                <p><strong>Booleans:</strong> <code>published: true</code> or <code>draft: false</code></p>
                <p><strong>Dates:</strong> <code>created: "2025-08-05T12:00:00Z"</code></p>
                
                <h5>Arrays</h5>
                <p><strong>Tags:</strong></p>
                <pre><code>tags:
  - work
  - project
  - important</code></pre>
                <p><strong>Empty array:</strong> <code>tags: []</code></p>
                <p><strong>Inline array:</strong> <code>keywords: [seo, marketing, web]</code></p>
                
                <h5>Common Fields</h5>
                <p><strong>Note metadata:</strong></p>
                <pre><code>title: "My Important Note"
tags:
  - project
  - work
aliases:
  - "Alternative Title"
  - "Short Name"
created: "2025-08-05T12:00:00Z"
modified: "2025-08-05T14:30:00Z"
priority: 1
published: false</code></pre>
                
                <h5>Comments</h5>
                <p><code># This is a comment and will be ignored</code></p>
              </div>
            </details>
          </div>
        </div>

        <!-- Parsed Metadata Preview -->
        {#if Object.keys(parsedMetadata).length > 0 && !validationError}
          <div class="metadata-section">
            <h4>Parsed Fields</h4>
            <div class="parsed-metadata">
              {#each Object.entries(parsedMetadata) as [key, value] (key)}
                <div class="metadata-field parsed">
                  <div class="field-header">
                    <label>{key}</label>
                    <button 
                      class="remove-field" 
                      onclick={() => removeField(key)}
                      title="Remove field"
                      aria-label="Remove field {key}"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                  <div class="field-value">
                    {#if Array.isArray(value)}
                      <div class="array-value">
                        {#if value.length === 0}
                          <em>Empty array</em>
                        {:else}
                          {#each value as item, index (index)}
                            <span class="array-item">{item}</span>
                          {/each}
                        {/if}
                      </div>
                    {:else}
                      <span class="scalar-value">{String(value)}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if error}
          <div class="error-message">
            <strong>Error:</strong> {error}
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="no-note">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14,2 14,8 20,8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10,9 9,9 8,9"></polyline>
      </svg>
      <p>Select a note to edit metadata</p>
    </div>
  {/if}
</div>

<style>
  .metadata-editor {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .editor-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .changes-indicator {
    color: var(--accent-orange);
    font-size: 1.2em;
    line-height: 1;
  }

  .saving-indicator {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  .add-field-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
  }

  .add-field-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .editor-content {
    flex: 1;
    padding: 1rem 1.25rem;
    overflow-y: auto;
    min-height: 0;
  }

  .metadata-section {
    margin-bottom: 2rem;
  }

  .metadata-section h4 {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .metadata-field {
    margin-bottom: 1rem;
  }

  .metadata-field label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .metadata-field input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: inherit;
  }

  .metadata-field input[readonly] {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .yaml-editor {
    position: relative;
  }

  .yaml-editor textarea {
    width: 100%;
    padding: 1rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    line-height: 1.5;
    resize: vertical;
    min-height: 200px;
  }

  .yaml-editor textarea:focus {
    outline: none;
    border-color: var(--accent-blue);
    box-shadow: 0 0 0 2px var(--accent-blue-alpha);
  }

  .yaml-help {
    margin-top: 0.5rem;
  }

  .yaml-help details {
    background: var(--bg-tertiary);
    border-radius: 0.5rem;
    padding: 0.5rem;
  }

  .yaml-help summary {
    font-size: 0.75rem;
    color: var(--text-secondary);
    cursor: pointer;
    user-select: none;
  }

  .help-content {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-light);
  }

  .help-content p {
    margin: 0.25rem 0;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .help-content code {
    background: var(--bg-primary);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    white-space: pre;
  }

  .help-content h5 {
    margin: 1rem 0 0.5rem 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-content h5:first-child {
    margin-top: 0;
  }

  .help-content pre {
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    padding: 0.5rem;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 0.75rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .help-content pre code {
    background: transparent;
    padding: 0;
    border: none;
  }

  .validation-error {
    padding: 0.75rem;
    background: var(--bg-error);
    border: 1px solid var(--border-error);
    border-radius: 0.5rem;
    color: var(--text-error);
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }

  .parsed-metadata {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .metadata-field.parsed {
    background: var(--bg-tertiary);
    border-radius: 0.5rem;
    padding: 0.75rem;
    margin-bottom: 0;
  }

  .field-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .field-header label {
    margin: 0;
    font-weight: 600;
    color: var(--text-primary);
  }

  .remove-field {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
  }

  .remove-field:hover {
    background: var(--bg-error);
    color: var(--text-error);
  }

  .field-value {
    font-size: 0.875rem;
  }

  .array-value {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .array-item {
    background: var(--bg-primary);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-light);
  }

  .scalar-value {
    color: var(--text-primary);
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--text-secondary);
    font-style: italic;
  }

  .error-message {
    padding: 0.75rem;
    background: var(--bg-error);
    border: 1px solid var(--border-error);
    border-radius: 0.5rem;
    color: var(--text-error);
    font-size: 0.875rem;
    margin-top: 1rem;
  }

  .no-note {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: var(--text-secondary);
    text-align: center;
  }

  .no-note svg {
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .no-note p {
    margin: 0;
    font-style: italic;
  }
</style>