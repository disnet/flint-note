<script lang="ts">
  import { onMount } from 'svelte';
  import { notesService } from '../services/notesService';
  import { noteEditorStore } from '../stores/noteEditor.svelte';
  import type { NoteType, NoteMetadata } from '../types/chat';

  // State
  let noteTypes = $state<NoteType[]>([]);
  let expandedTypes = $state<Set<string>>(new Set());
  let notesByType = $state<Map<string, NoteMetadata[]>>(new Map());
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let sortBy = $state<'name' | 'modified' | 'created'>('modified');
  let sortOrder = $state<'asc' | 'desc'>('desc');

  // Filtered and sorted notes - using explicit state management for Svelte 5
  let filteredNoteTypes = $state<NoteType[]>([]);

  // Update filtered types when noteTypes or searchQuery changes
  $effect(() => {
    console.log('🔍 Computing filteredNoteTypes:', {
      noteTypesLength: noteTypes.length,
      searchQuery,
      noteTypes: $state.snapshot(noteTypes)
    });

    if (!searchQuery) {
      console.log('🔍 No search query, returning all noteTypes:', noteTypes.length);
      filteredNoteTypes = [...noteTypes];
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = noteTypes.filter((type) => {
      // Check if type name matches
      if (type.name.toLowerCase().includes(query)) return true;

      // Check if any notes in this type match
      const notes = notesByType.get(type.name) || [];
      return notes.some(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.filename.toLowerCase().includes(query) ||
          note.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });

    console.log('🔍 Filtered noteTypes:', filtered.length);
    filteredNoteTypes = filtered;
  });

  function sortNotes(notes: NoteMetadata[]): NoteMetadata[] {
    const sorted = [...notes].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'modified':
          comparison = new Date(a.modified).getTime() - new Date(b.modified).getTime();
          break;
        case 'created':
          comparison = new Date(a.created).getTime() - new Date(b.created).getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Apply search filter if active
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return sorted.filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.filename.toLowerCase().includes(query) ||
          note.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return sorted;
  }

  async function loadNoteTypes() {
    try {
      loading = true;
      error = null;
      console.log('🔍 NotesExplorer: Starting to load note types...');
      const types = await notesService.getNoteTypes();
      console.log('🔍 NotesExplorer: Loaded note types:', $state.snapshot(types));

      // Load counts for each type
      const typesWithCounts = await Promise.all(
        types.map(async (type) => {
          try {
            const notes = await notesService.getNotesByType(type.name);
            return { ...type, count: notes.length };
          } catch (err) {
            console.warn(`Failed to load count for type ${type.name}:`, err);
            return { ...type, count: 0 };
          }
        })
      );

      noteTypes = typesWithCounts;
      console.log('🔍 NotesExplorer: Types with counts:', $state.snapshot(noteTypes));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load note types';
      console.error('🔍 NotesExplorer: Error loading note types:', err);
    } finally {
      loading = false;
    }
  }

  async function loadNotesForType(typeName: string) {
    try {
      console.log(`🔍 NotesExplorer: Loading notes for type: ${typeName}`);
      const notes = await notesService.getNotesByType(typeName);
      console.log(
        `🔍 NotesExplorer: Loaded ${notes.length} notes for type ${typeName}:`,
        $state.snapshot(notes)
      );
      notesByType.set(typeName, notes);
      notesByType = new Map(notesByType); // Trigger reactivity
    } catch (err) {
      console.error(`🔍 NotesExplorer: Error loading notes for type ${typeName}:`, err);
    }
  }

  function toggleTypeExpansion(typeName: string) {
    if (expandedTypes.has(typeName)) {
      expandedTypes.delete(typeName);
    } else {
      expandedTypes.add(typeName);
      // Load notes for this type if not already loaded
      if (!notesByType.has(typeName)) {
        loadNotesForType(typeName);
      }
    }
    expandedTypes = new Set(expandedTypes); // Trigger reactivity
  }

  function openNote(note: NoteMetadata) {
    console.log('🔍 Opening note:', $state.snapshot(note));

    // Extract filename without extension for the note editor
    const filename = note.filename.replace(/\.[^/.]+$/, '');
    // Use the note's ID which is already in the correct "type/filename" format
    const identifier = note.id.replace(/\.[^/.]+$/, ''); // Remove extension from ID

    console.log('🔍 Note identifiers:', {
      filename,
      identifier,
      noteId: note.id,
      noteTitle: note.title
    });

    noteEditorStore.openNote({
      type: note.type,
      filename: filename,
      title: identifier // Use the properly formatted identifier
    });
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function refresh() {
    expandedTypes.clear();
    notesByType.clear();
    loadNoteTypes();
  }

  async function testMCPDirectly() {
    console.log('🧪 Testing MCP resources directly...');
    try {
      // Test MCP client directly
      const resources = await mcpClient.getResources();
      console.log('🧪 Available resources:', resources);

      // Test reading the types resource
      const typesContent = await mcpClient.readResource('flint-note://types');
      console.log('🧪 Types resource content:', typesContent);

      // Test if we can parse it
      if (typesContent.text) {
        const parsed = JSON.parse(typesContent.text);
        console.log('🧪 Parsed types:', parsed);

        // Test loading notes for the first type
        if (parsed.length > 0) {
          const firstType = parsed[0].name;
          console.log(`🧪 Testing notes for type: ${firstType}`);
          const notesContent = await mcpClient.readResource(
            `flint-note://notes/${firstType}`
          );
          console.log(`🧪 Notes for ${firstType}:`, notesContent);
        }
      }
    } catch (error) {
      console.error('🧪 MCP test failed:', error);
    }
  }

  onMount(() => {
    console.log('🔍 NotesExplorer: Component mounted, loading note types...');
    loadNoteTypes();
  });
</script>

<div class="notes-explorer">
  <!-- Header -->
  <div class="explorer-header">
    <div class="header-row">
      <h2>Notes Explorer</h2>
      <button class="refresh-btn" onclick={refresh} title="Refresh">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
          ></path>
        </svg>
      </button>
      <button class="debug-btn" onclick={testMCPDirectly} title="Test MCP"> 🔍 </button>
    </div>

    <!-- Search -->
    <div class="search-row">
      <input
        type="text"
        placeholder="Search notes..."
        bind:value={searchQuery}
        class="search-input"
      />
    </div>

    <!-- Sort controls -->
    <div class="sort-row">
      <select bind:value={sortBy} class="sort-select">
        <option value="modified">Modified</option>
        <option value="created">Created</option>
        <option value="name">Name</option>
      </select>
      <button
        class="sort-order-btn"
        onclick={() => (sortOrder = sortOrder === 'asc' ? 'desc' : 'asc')}
        title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          {#if sortOrder === 'asc'}
            <polyline points="18 15 12 9 6 15"></polyline>
          {:else}
            <polyline points="6 9 12 15 18 9"></polyline>
          {/if}
        </svg>
      </button>
    </div>
  </div>

  <!-- Content -->
  <div class="explorer-content">
    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        <span>Loading notes...</span>
      </div>
    {:else if error}
      <div class="error">
        <div class="error-icon">⚠️</div>
        <div class="error-message">{error}</div>
        <button class="retry-btn" onclick={loadNoteTypes}>Retry</button>
      </div>
    {:else if filteredNoteTypes.length === 0}
      <div class="empty">
        <div class="empty-icon">📝</div>
        <div class="empty-message">
          {searchQuery ? 'No notes found matching your search' : 'No note types found'}
        </div>
        <div class="debug-info">
          Debug: noteTypes.length = {noteTypes.length}, filteredNoteTypes.length = {filteredNoteTypes.length}
        </div>
      </div>
    {:else}
      <div class="types-list">
        {#each filteredNoteTypes as noteType (noteType.name)}
          <div class="note-type">
            <!-- Type header -->
            <button
              class="type-header"
              onclick={() => toggleTypeExpansion(noteType.name)}
            >
              <div class="type-icon">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  {#if expandedTypes.has(noteType.name)}
                    <polyline points="6 9 12 15 18 9"></polyline>
                  {:else}
                    <polyline points="9 18 15 12 9 6"></polyline>
                  {/if}
                </svg>
              </div>
              <div class="type-folder-icon">📁</div>
              <div class="type-name">{noteType.name}</div>
              <div class="type-count">({noteType.count ?? '?'})</div>
            </button>

            <!-- Notes list -->
            {#if expandedTypes.has(noteType.name)}
              <div class="notes-list">
                {#if notesByType.has(noteType.name)}
                  {@const notes = sortNotes(notesByType.get(noteType.name) || [])}
                  {#if notes.length === 0}
                    <div class="no-notes">
                      {searchQuery
                        ? 'No notes match your search'
                        : 'No notes in this type'}
                    </div>
                  {:else}
                    {#each notes as note (note.id)}
                      <button
                        class="note-item"
                        onclick={() => openNote(note)}
                        title={note.path}
                      >
                        <div class="note-main">
                          <div class="note-title">{note.title}</div>
                          <div class="note-meta">
                            <span class="note-date">{formatDate(note.modified)}</span>
                            <span class="note-size">{formatFileSize(note.size)}</span>
                          </div>
                        </div>
                        {#if note.tags.length > 0}
                          <div class="note-tags">
                            {#each note.tags.slice(0, 3) as tag}
                              <span class="tag">{tag}</span>
                            {/each}
                            {#if note.tags.length > 3}
                              <span class="tag-more">+{note.tags.length - 3}</span>
                            {/if}
                          </div>
                        {/if}
                      </button>
                    {/each}
                  {/if}
                {:else}
                  <div class="loading-notes">
                    <div class="spinner small"></div>
                    <span>Loading notes...</span>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .notes-explorer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #ffffff;
    border-right: 1px solid #e1e5e9;
  }

  .explorer-header {
    padding: 1rem;
    border-bottom: 1px solid #e1e5e9;
    background: #f8f9fa;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .header-row h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .refresh-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    color: #6c757d;
    transition: all 0.2s;
  }

  .refresh-btn:hover {
    background: #e9ecef;
    color: #495057;
  }

  .debug-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    color: #6c757d;
    transition: all 0.2s;
    margin-left: 0.25rem;
  }

  .debug-btn:hover {
    background: #e9ecef;
    color: #495057;
  }

  .search-row {
    margin-bottom: 0.75rem;
  }

  .search-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 0.9rem;
    background: #ffffff;
  }

  .search-input:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
  }

  .sort-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .sort-select {
    flex: 1;
    padding: 0.4rem;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 0.85rem;
    background: #ffffff;
  }

  .sort-order-btn {
    background: none;
    border: 1px solid #ced4da;
    border-radius: 4px;
    padding: 0.4rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    color: #6c757d;
    transition: all 0.2s;
  }

  .sort-order-btn:hover {
    background: #e9ecef;
    border-color: #adb5bd;
  }

  .explorer-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .loading,
  .error,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: #6c757d;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #e9ecef;
    border-top: 2px solid #007bff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 0.5rem;
  }

  .spinner.small {
    width: 16px;
    height: 16px;
    border-width: 1px;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .error-icon,
  .empty-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  .retry-btn {
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .retry-btn:hover {
    background: #0056b3;
  }

  .types-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .note-type {
    border-radius: 6px;
    overflow: hidden;
  }

  .type-header {
    width: 100%;
    display: flex;
    align-items: center;
    padding: 0.75rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    border-radius: 6px;
    transition: background 0.2s;
    gap: 0.5rem;
  }

  .type-header:hover {
    background: #f8f9fa;
  }

  .type-icon {
    display: flex;
    align-items: center;
    color: #6c757d;
  }

  .type-folder-icon {
    font-size: 1rem;
  }

  .type-name {
    flex: 1;
    font-weight: 500;
    color: #495057;
  }

  .type-count {
    font-size: 0.85rem;
    color: #6c757d;
  }

  .notes-list {
    padding-left: 1rem;
    border-left: 2px solid #e9ecef;
    margin-left: 1rem;
  }

  .loading-notes {
    display: flex;
    align-items: center;
    padding: 1rem;
    color: #6c757d;
    font-size: 0.9rem;
    gap: 0.5rem;
  }

  .no-notes {
    padding: 1rem;
    color: #6c757d;
    font-size: 0.9rem;
    font-style: italic;
  }

  .note-item {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 0.75rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    border-radius: 4px;
    transition: background 0.2s;
    gap: 0.5rem;
  }

  .note-item:hover {
    background: #f8f9fa;
  }

  .note-main {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .note-title {
    font-weight: 500;
    color: #1a1a1a;
    font-size: 0.9rem;
  }

  .note-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.8rem;
    color: #6c757d;
  }

  .note-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tag {
    background: #e9ecef;
    color: #495057;
    padding: 0.125rem 0.375rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .tag-more {
    background: #6c757d;
    color: white;
    padding: 0.125rem 0.375rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .notes-explorer {
      background: #1a1a1a;
      border-color: #404040;
    }

    .explorer-header {
      background: #2d2d2d;
      border-color: #404040;
    }

    .header-row h2 {
      color: #f0f0f0;
    }

    .refresh-btn {
      color: #adb5bd;
    }

    .refresh-btn:hover {
      background: #404040;
      color: #f0f0f0;
    }

    .debug-btn {
      color: #adb5bd;
    }

    .debug-btn:hover {
      background: #404040;
      color: #f0f0f0;
    }

    .search-input,
    .sort-select {
      background: #2d2d2d;
      border-color: #404040;
      color: #f0f0f0;
    }

    .search-input:focus {
      border-color: #66b2ff;
      box-shadow: 0 0 0 2px rgba(102, 178, 255, 0.1);
    }

    .sort-order-btn {
      background: #2d2d2d;
      border-color: #404040;
      color: #adb5bd;
    }

    .sort-order-btn:hover {
      background: #404040;
      border-color: #555;
    }

    .type-header:hover {
      background: #2d2d2d;
    }

    .type-name {
      color: #f0f0f0;
    }

    .type-count,
    .type-icon {
      color: #adb5bd;
    }

    .notes-list {
      border-color: #404040;
    }

    .note-item:hover {
      background: #2d2d2d;
    }

    .note-title {
      color: #f0f0f0;
    }

    .note-meta {
      color: #adb5bd;
    }

    .tag {
      background: #404040;
      color: #f0f0f0;
    }

    .loading,
    .error,
    .empty,
    .loading-notes,
    .no-notes {
      color: #adb5bd;
    }

    .spinner {
      border-color: #404040;
      border-top-color: #66b2ff;
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .explorer-header {
      padding: 0.75rem;
    }

    .header-row h2 {
      font-size: 1rem;
    }

    .sort-row {
      flex-direction: column;
      align-items: stretch;
    }

    .sort-order-btn {
      align-self: flex-end;
      width: auto;
    }

    .note-item {
      padding: 0.5rem;
    }

    .note-meta {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }
  }
</style>
