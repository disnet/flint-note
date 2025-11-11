# Agent Note Suggestions Feature

## Overview

Automatic, context-aware suggestions from the AI agent that attach to notes. The agent reads notes and offers suggestions to improve or think more deeply about the content, with behavior customizable per note type.

## Core Principles

- **Note type driven**: Each note type can enable/disable suggestions and provide custom guidance
- **Lazy generation**: Only generate suggestions when notes are opened
- **Smart caching**: Cache suggestions and only regenerate when content changes significantly
- **User control**: Users can override suggestions per-note even if enabled at type level
- **Context-aware**: Agent receives note type details including template to generate relevant suggestions

## Data Model

### Database Schema

#### New Table: `note_suggestions`

```sql
CREATE TABLE note_suggestions (
  id INTEGER PRIMARY KEY,
  note_id TEXT NOT NULL UNIQUE,
  suggestions TEXT NOT NULL,  -- JSON array of suggestion objects
  content_hash TEXT NOT NULL, -- Hash of note content when generated
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  model_version TEXT,         -- Track which model generated suggestions
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX idx_note_suggestions_note_id ON note_suggestions(note_id);
CREATE INDEX idx_note_suggestions_generated_at ON note_suggestions(generated_at);
```

#### Suggestion Object Format

```typescript
interface NoteSuggestion {
  id: string;                    // Unique ID for this suggestion
  type: string;                  // Type depends on note type (e.g., "action", "link", "metadata", "content")
  text: string;                  // The suggestion text
  priority?: 'high' | 'medium' | 'low';
  data?: Record<string, unknown>; // Type-specific data (e.g., link target, metadata key/value)
  reasoning?: string;            // Why this suggestion was made
}
```

#### Update: `note_type_descriptions` Table

```sql
ALTER TABLE note_type_descriptions
ADD COLUMN suggestions_config TEXT;  -- JSON configuration for suggestions
```

#### Suggestion Config Format

```typescript
interface NoteTypeSuggestionConfig {
  enabled: boolean;
  prompt_guidance: string;       // Instructions for how agent should make suggestions
  regenerate_threshold: number;  // Content change threshold (0-1), default 0.15
  suggestion_types?: string[];   // Allowed suggestion types for this note type
}
```

#### Per-Note Override: `note_metadata`

Use existing metadata system with reserved keys:
- `_suggestions_disabled`: boolean - User override to disable suggestions for this note

### Content Change Detection

Use content hash comparison with threshold:

```typescript
function shouldRegenerateSuggestions(
  cachedHash: string,
  currentHash: string,
  cachedContent: string,
  currentContent: string,
  threshold: number = 0.15
): boolean {
  // If hash unchanged, no regeneration
  if (cachedHash === currentHash) {
    return false;
  }

  // If length changed by more than threshold percentage, regenerate
  const lengthChange = Math.abs(currentContent.length - cachedContent.length) / cachedContent.length;
  return lengthChange >= threshold;
}
```

## Architecture

### New Service: `SuggestionService`

Located in: `src/server/core/suggestion-service.ts`

```typescript
export class SuggestionService {
  constructor(
    private dbManager: DatabaseManager,
    private noteManager: NoteManager,
    private noteTypeManager: NoteTypeManager
  );

  // Get suggestions for a note (with caching)
  async getSuggestions(noteId: string): Promise<NoteSuggestion[]>;

  // Generate new suggestions via AI
  async generateSuggestions(noteId: string): Promise<NoteSuggestion[]>;

  // Check if suggestions should be regenerated
  async shouldRegenerate(noteId: string, contentHash: string): Promise<boolean>;

  // Clear suggestions for a note
  async clearSuggestions(noteId: string): Promise<void>;

  // Check if suggestions are enabled for a note
  async areSuggestionsEnabled(noteId: string): Promise<boolean>;

  // Dismiss a specific suggestion
  async dismissSuggestion(noteId: string, suggestionId: string): Promise<void>;
}
```

### Integration Points

#### 1. AI Service Integration

Add method to `AIService` (src/main/ai-service.ts):

```typescript
async generateNoteSuggestions(
  noteContent: string,
  noteType: string,
  noteTypeDescription: NoteTypeDescription,
  promptGuidance: string
): Promise<NoteSuggestion[]> {
  const systemPrompt = `You are analyzing a note of type "${noteType}".

Note Type Purpose: ${noteTypeDescription.parsed.purpose}

Note Type Template:
${noteTypeDescription.parsed.template || 'N/A'}

${promptGuidance}

Analyze the note and provide specific, actionable suggestions as a JSON array.
Each suggestion should have: id, type, text, priority (optional), data (optional), reasoning (optional).`;

  const response = await generateText({
    model: this.openrouter(this.currentModelName),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: noteContent }
    ],
    maxTokens: 2000
  });

  return JSON.parse(response.text);
}
```

#### 2. API Endpoints

Add to note API (src/server/api/notes.ts):

```typescript
// Get suggestions for a note
router.get('/notes/:id/suggestions', async (req, res) => {
  const suggestions = await suggestionService.getSuggestions(req.params.id);
  res.json({ suggestions });
});

// Regenerate suggestions
router.post('/notes/:id/suggestions/regenerate', async (req, res) => {
  const suggestions = await suggestionService.generateSuggestions(req.params.id);
  res.json({ suggestions });
});

// Dismiss suggestion
router.delete('/notes/:id/suggestions/:suggestionId', async (req, res) => {
  await suggestionService.dismissSuggestion(req.params.id, req.params.suggestionId);
  res.json({ success: true });
});
```

#### 3. IPC Bridge

Add to preload (src/preload/index.ts):

```typescript
// Note suggestions API
getNoteSuggestions: (noteId: string) => ipcRenderer.invoke('note:getSuggestions', noteId),
regenerateNoteSuggestions: (noteId: string) => ipcRenderer.invoke('note:regenerateSuggestions', noteId),
dismissNoteSuggestion: (noteId: string, suggestionId: string) =>
  ipcRenderer.invoke('note:dismissSuggestion', noteId, suggestionId),
```

### UI Components

#### 1. Suggestions Panel Component

Create: `src/renderer/src/components/NoteSuggestions.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    noteId: string;
    contentHash: string;
  }

  let { noteId, contentHash }: Props = $props();
  let suggestions = $state<NoteSuggestion[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  onMount(async () => {
    await loadSuggestions();
  });

  async function loadSuggestions() {
    loading = true;
    error = null;
    try {
      const result = await window.api?.getNoteSuggestions(noteId);
      suggestions = result?.suggestions || [];
    } catch (err) {
      error = 'Failed to load suggestions';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function dismissSuggestion(suggestionId: string) {
    await window.api?.dismissNoteSuggestion(noteId, suggestionId);
    suggestions = suggestions.filter(s => s.id !== suggestionId);
  }

  async function regenerate() {
    loading = true;
    try {
      const result = await window.api?.regenerateNoteSuggestions(noteId);
      suggestions = result?.suggestions || [];
    } finally {
      loading = false;
    }
  }
</script>

<div class="suggestions-panel">
  <div class="suggestions-header">
    <h3>Suggestions</h3>
    <button onclick={regenerate} disabled={loading}>
      Regenerate
    </button>
  </div>

  {#if loading}
    <div class="loading">Generating suggestions...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if suggestions.length === 0}
    <div class="empty">No suggestions available</div>
  {:else}
    <ul class="suggestions-list">
      {#each suggestions as suggestion (suggestion.id)}
        <li class="suggestion-item" data-priority={suggestion.priority}>
          <div class="suggestion-content">
            <span class="suggestion-type">{suggestion.type}</span>
            <p class="suggestion-text">{suggestion.text}</p>
            {#if suggestion.reasoning}
              <p class="suggestion-reasoning">{suggestion.reasoning}</p>
            {/if}
          </div>
          <button
            class="dismiss-button"
            onclick={() => dismissSuggestion(suggestion.id)}
            title="Dismiss"
          >×</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
```

#### 2. Integration with Note Editor

Update `NoteEditor.svelte` to include suggestions panel in right sidebar:

```svelte
{#if currentNote && suggestionsEnabled}
  <NoteSuggestions
    noteId={currentNote.id}
    contentHash={currentNote.content_hash}
  />
{/if}
```

#### 3. Note Type Settings UI

Update `NoteTypeDetailView.svelte` to add suggestions configuration:

```svelte
<div class="suggestions-config">
  <h3>Suggestions</h3>

  <label>
    <input type="checkbox" bind:checked={config.enabled} />
    Enable automatic suggestions
  </label>

  {#if config.enabled}
    <div class="prompt-guidance">
      <label>
        Suggestion Guidance
        <textarea
          bind:value={config.prompt_guidance}
          placeholder="Instructions for how the agent should analyze notes and make suggestions..."
          rows="6"
        />
      </label>

      <label>
        Regeneration Threshold
        <input
          type="number"
          bind:value={config.regenerate_threshold}
          min="0"
          max="1"
          step="0.05"
        />
        <span class="help-text">
          Minimum content change (0-1) to regenerate suggestions. Default: 0.15 (15% change)
        </span>
      </label>
    </div>
  {/if}
</div>
```

## Prompt Guidance Examples

### Meeting Notes

```
Analyze this meeting note and suggest:
1. Action items that might have been documented but need explicit tracking
2. People who should be followed up with based on discussion points
3. Related projects or existing notes that should be linked
4. Key decisions that might warrant separate documentation
5. Unclear or ambiguous points that need clarification

Focus on actionable, specific suggestions that help the user get more value from this note.
```

### Research Notes

```
Analyze this research note and suggest:
1. Related concepts or papers that should be explored or linked
2. Open questions or hypotheses that emerged from the content
3. Potential experiments or next steps to investigate
4. Connections to other research notes in the vault
5. Key insights that could be extracted into standalone notes

Prioritize suggestions that deepen understanding and expand the research direction.
```

### Task Notes

```
Analyze this task note and suggest:
1. Missing dependencies or blockers
2. Related tasks that should be linked
3. Resources or notes that might be helpful
4. Potential risks or considerations
5. Sub-tasks that could be broken out

Focus on helping the user complete the task efficiently and thoroughly.
```

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Create database schema and migrations
- [ ] Implement SuggestionService
- [ ] Add AI integration for suggestion generation
- [ ] Create API endpoints

### Phase 2: UI Integration
- [ ] Build NoteSuggestions component
- [ ] Integrate with NoteEditor
- [ ] Add note type configuration UI
- [ ] Style and polish

### Phase 3: Smart Features
- [ ] Content change detection and auto-regeneration
- [ ] Per-note override controls
- [ ] Suggestion dismissal persistence
- [ ] Loading states and error handling

### Phase 4: Refinement
- [ ] Performance optimization
- [ ] Add example prompt guidance for common note types
- [ ] Documentation
- [ ] User testing and iteration

## Future Enhancements

- **Suggestion actions**: Allow users to "apply" suggestions (e.g., create linked note, add content)
- **Feedback loop**: Track which suggestions are helpful vs dismissed to improve prompts
- **Batch generation**: Offer to generate suggestions for multiple notes at once
- **Suggestion templates**: Pre-built suggestion configs for common note types
- **Contextual suggestions**: Consider related notes and vault structure when generating suggestions
- **Incremental updates**: Stream suggestions as they're generated rather than waiting for all

## Migration Considerations

- Existing users: Suggestions disabled by default for all note types
- Provide onboarding/tutorial for enabling suggestions
- Allow bulk enabling for note types via settings
- Database migration adds new table and column with no data loss

## Open Questions

1. Should dismissed suggestions be permanently hidden or just for current session?
   - **Recommendation**: Permanently hidden per note, store in metadata

2. Should suggestions be deleted when note is significantly changed or kept as history?
   - **Recommendation**: Delete and regenerate to keep cache small

3. Should there be a global kill switch for all suggestions?
   - **Recommendation**: Yes, add to settings for privacy-conscious users

4. Should suggestions work offline or require API key?
   - **Follows existing AI service pattern**: Requires OpenRouter API key

5. What happens if suggestion generation fails?
   - **Recommendation**: Show error state, allow retry, log for debugging
