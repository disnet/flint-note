# Review Mode: Context Management Strategy

## UPDATED: Agent-Driven Approach

**Status:** This document has been superseded by the decision to use an **agent-driven review approach** with **full note content**.

**New approach (see revised prototype spec):**
- Agent receives **full content** of all notes due for review (no truncation)
- Agent autonomously chooses review strategy
- Tool-based context fetching (agent pulls additional context as needed)
- Estimated cost: ~$0.07/session with Sonnet (very affordable)

**This document remains as reference** for the analysis that led to the decision, but the recommended MVP strategy is now:
- **Include full main note content** - no truncation
- **Agent-driven prompts** - no predetermined categories
- **On-demand tool calls** - fetch related notes only if agent needs them

See `review-mode-prototype.md` for the current specification.

---

## Original Problem Statement

The review mode requires AI to generate synthesis prompts and analyze user responses. This involves accessing note content from potentially large knowledge graphs. We **cannot** simply dump all related notes into the LLM context window because:

1. **Token limits** - Context windows have limits (even with large models)
2. **Cost** - More tokens = more expensive API calls
3. **Performance** - Larger contexts = slower responses
4. **Relevance** - Including too much context reduces signal-to-noise ratio
5. **Scale** - User vaults may have hundreds or thousands of notes

We need a smart context management strategy that provides enough information for high-quality prompts while staying within practical limits.

**UPDATE:** After analysis, we determined that including full note content is both feasible and necessary for quality prompts. Cost is acceptable (~$0.07/session).

## Current Approach in Prototype Spec

The prototype spec (lines 554-564) proposes:

```typescript
context: {
  mainNote: {
    title: note.title,
    summary: extractSummary(note.content, maxLength: 200)
  },
  relatedNotes: relatedNotes.map(n => ({
    title: n.title,
    summary: extractSummary(n.content, maxLength: 200),
    relationship: n.linkType || 'related'
  }))
}
```

**Analysis:**
- 200 characters per note ≈ 30-50 tokens
- For main note + 2-3 related notes = ~150-200 tokens of context
- Very conservative, minimal cost
- **Risk**: May be too little context for meaningful synthesis prompts

## Context Requirements by Operation

### 1. Generating Synthesis Prompts

**What we need:**
- Main note: Enough content to understand core concept
- Related notes (2-3): Enough to identify connections
- Metadata: Titles, tags, relationships

**What we DON'T need:**
- Full text of all notes
- Unrelated notes
- Historical versions
- User's entire vault

**Estimated token budget:** 2,000-4,000 tokens for context

### 2. Analyzing User Responses

**What we need:**
- The prompt that was asked
- User's typed response
- Main note content (to compare understanding)
- Related notes mentioned in the prompt

**What we DON'T need:**
- Other notes in vault
- Full backlink context
- Note history

**Estimated token budget:** 3,000-5,000 tokens for context

## Strategy Options

### Option 1: Simple Truncation (Current Prototype Approach)

**How it works:**
- Extract first N characters from each note
- Fixed limit (e.g., 200 characters)

```typescript
function extractSummary(content: string, maxLength: number): string {
  return content.slice(0, maxLength);
}
```

**Pros:**
- Dead simple to implement
- Predictable token usage
- Very fast
- No additional AI calls

**Cons:**
- May cut off mid-sentence
- Might miss key information if it's not at the start
- No intelligence about what's important
- 200 chars might be too short for synthesis

**Cost:** Near zero overhead

**Recommendation:** Good for MVP, but may need adjustment

### Option 2: Intelligent Truncation (Start + End)

**How it works:**
- Take first N characters + last N/2 characters
- Gives both introduction and conclusion

```typescript
function extractSummary(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;

  const startChars = Math.floor(maxLength * 0.7);
  const endChars = maxLength - startChars - 3; // 3 for "..."

  return content.slice(0, startChars) +
         "..." +
         content.slice(-endChars);
}
```

**Pros:**
- Better than just start
- Captures conclusions/summaries often at end
- Still very fast

**Cons:**
- Middle content lost
- Still no intelligence about importance

**Cost:** Near zero overhead

**Recommendation:** Slight improvement over Option 1

### Option 3: Markdown-Aware Summary

**How it works:**
- Parse markdown structure
- Prioritize: title → headings → first paragraph under each heading
- Build hierarchical summary

```typescript
function extractMarkdownSummary(content: string, maxTokens: number): string {
  const parsed = parseMarkdown(content);
  let summary = '';
  let tokens = 0;

  // Add title/h1
  if (parsed.title) {
    summary += `# ${parsed.title}\n\n`;
    tokens += estimateTokens(summary);
  }

  // Add first sentence of each section
  for (const section of parsed.sections) {
    if (tokens >= maxTokens) break;

    const firstSentence = extractFirstSentence(section.content);
    summary += `## ${section.heading}\n${firstSentence}\n\n`;
    tokens += estimateTokens(firstSentence);
  }

  return summary;
}
```

**Pros:**
- Leverages note structure
- More meaningful than arbitrary truncation
- Preserves document hierarchy
- Still deterministic and fast

**Cons:**
- Assumes well-structured notes
- More complex implementation
- May miss important details in body text

**Cost:** Minimal (just parsing)

**Recommendation:** Good middle ground for structured notes

### Option 4: Token-Budget Allocation

**How it works:**
- Set total token budget (e.g., 3000 tokens)
- Allocate proportionally: main note 60%, related notes 40%
- Use smart truncation within each allocation

```typescript
interface ContextBudget {
  totalTokens: number;
  mainNoteTokens: number;
  perRelatedNoteTokens: number;
}

function buildContext(
  mainNote: Note,
  relatedNotes: Note[],
  budget: ContextBudget
): PromptContext {
  return {
    mainNote: {
      title: mainNote.title,
      content: truncateToTokens(
        mainNote.content,
        budget.mainNoteTokens
      )
    },
    relatedNotes: relatedNotes.map(n => ({
      title: n.title,
      content: truncateToTokens(
        n.content,
        budget.perRelatedNoteTokens
      )
    }))
  };
}
```

**Pros:**
- Predictable cost control
- Flexible - can adjust budget by operation
- Balances coverage vs. depth

**Cons:**
- Requires token counting
- Still uses truncation underneath

**Cost:** Low (token estimation overhead)

**Recommendation:** Good for cost control

### Option 5: AI-Powered Summarization

**How it works:**
- Use AI to summarize each note before including in context
- Cache summaries to avoid repeated calls
- Multiple summary lengths for different contexts

```typescript
async function getSummary(
  noteId: string,
  targetLength: 'short' | 'medium' | 'long',
  cache: SummaryCache
): Promise<string> {
  // Check cache first
  const cached = cache.get(noteId, targetLength);
  if (cached && !noteHasChangedSince(noteId, cached.timestamp)) {
    return cached.summary;
  }

  // Generate new summary
  const note = await getNote(noteId);
  const summary = await generateSummary(note.content, {
    maxLength: targetLength === 'short' ? 100 :
               targetLength === 'medium' ? 300 : 500,
    style: 'factual',
    preserveKeyTerms: true
  });

  // Cache it
  cache.set(noteId, targetLength, summary);

  return summary;
}
```

**Pros:**
- Highest quality summaries
- Intelligently extracts key points
- Can be tuned for different use cases

**Cons:**
- Expensive (extra AI calls)
- Slower (requires summarization step)
- Summaries might lose important details
- Complexity of cache invalidation

**Cost:** High (2x AI calls per review minimum)

**Recommendation:** Too expensive for MVP, consider for later

### Option 6: Embedding-Based Retrieval

**How it works:**
- Pre-compute embeddings for all note paragraphs
- When generating prompt, retrieve most relevant chunks
- Only include relevant portions of notes

```typescript
async function getRelevantContext(
  mainNoteId: string,
  relatedNoteIds: string[],
  embeddingIndex: EmbeddingIndex
): Promise<ContextChunks> {
  const mainNote = await getNote(mainNoteId);

  // Get core concept from main note (first paragraph or summary)
  const mainConcept = extractCoreConcept(mainNote);

  // Find most relevant chunks from related notes
  const relevantChunks = await embeddingIndex.search({
    query: mainConcept,
    filterNoteIds: relatedNoteIds,
    limit: 5, // top 5 relevant chunks
    minSimilarity: 0.7
  });

  return {
    mainNote: {
      title: mainNote.title,
      coreConcept: mainConcept
    },
    relatedChunks: relevantChunks
  };
}
```

**Pros:**
- Only includes relevant portions
- Scales to very long notes
- Can handle many related notes
- Precision over recall

**Cons:**
- Requires embedding infrastructure
- Pre-processing overhead
- May miss context that's relevant but not semantically similar
- Complex implementation

**Cost:** Medium (embedding generation + storage)

**Recommendation:** Overkill for MVP, but valuable long-term

### Option 7: Hybrid Approach (RECOMMENDED)

**How it works:**
- Combine multiple strategies based on operation and note size
- Use simple truncation for short notes
- Use markdown-aware extraction for longer notes
- Set hard token budgets as safety net

```typescript
function buildPromptContext(
  mainNote: Note,
  relatedNotes: Note[],
  operation: 'generate_prompt' | 'analyze_response'
): PromptContext {
  // Set token budget based on operation
  const budget = operation === 'generate_prompt'
    ? { total: 3000, main: 1800, perRelated: 400 }
    : { total: 4000, main: 2500, perRelated: 500 };

  // Extract main note context
  const mainContext = extractNoteContext(mainNote, budget.main);

  // Extract related notes context
  const relatedContext = relatedNotes
    .slice(0, 3) // Max 3 related notes
    .map(note => extractNoteContext(note, budget.perRelated));

  return {
    mainNote: mainContext,
    relatedNotes: relatedContext
  };
}

function extractNoteContext(note: Note, tokenBudget: number): NoteContext {
  const content = note.content;
  const estimatedTokens = estimateTokens(content);

  // If note fits in budget, use it all
  if (estimatedTokens <= tokenBudget) {
    return {
      title: note.title,
      content: content,
      truncated: false
    };
  }

  // If note is well-structured, use markdown-aware extraction
  if (hasMarkdownStructure(content)) {
    return {
      title: note.title,
      content: extractMarkdownSummary(content, tokenBudget),
      truncated: true
    };
  }

  // Fallback: smart truncation (start + end)
  const charBudget = tokenBudget * 4; // rough chars per token
  return {
    title: note.title,
    content: smartTruncate(content, charBudget),
    truncated: true
  };
}

function smartTruncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  // Try to break at paragraph boundary
  const startPortion = content.slice(0, Math.floor(maxChars * 0.7));
  const endPortion = content.slice(-Math.floor(maxChars * 0.3));

  // Find last paragraph break in start
  const lastBreak = startPortion.lastIndexOf('\n\n');
  const start = lastBreak > maxChars * 0.5
    ? startPortion.slice(0, lastBreak)
    : startPortion;

  return start + '\n\n[...]\n\n' + endPortion;
}
```

**Pros:**
- Adapts to note characteristics
- Balance of simplicity and intelligence
- Predictable costs
- Good results for most notes

**Cons:**
- More complex than single strategy
- Needs careful testing

**Cost:** Low (computational only)

**Recommendation:** Best for MVP

## Context Budgets by Operation

### Prompt Generation

```
Total budget: 3,000 tokens
├─ System prompt: ~500 tokens
├─ Main note: 1,000-1,500 tokens
│  ├─ Title + metadata: ~50 tokens
│  └─ Content summary: 950-1,450 tokens
├─ Related notes (2-3): 800-1,200 tokens
│  ├─ Per note: ~300-400 tokens each
│  └─ Titles + summaries
└─ Formatting overhead: ~200 tokens
```

### Response Analysis

```
Total budget: 5,000 tokens
├─ System prompt: ~600 tokens
├─ Original prompt: ~100 tokens
├─ User response: ~200-500 tokens
├─ Main note: 2,000-2,500 tokens
│  ├─ Can be more generous here
│  └─ Need to verify understanding
├─ Related notes: 1,000-1,500 tokens
└─ Formatting: ~200 tokens
```

## Specific Recommendations for MVP

### Phase 1: Start Simple

**For prompt generation:**
1. Use markdown-aware extraction (Option 3)
2. Budget: Main note 500 chars, related notes 300 chars each
3. Hard limit: 3 related notes maximum

**For response analysis:**
1. Include full main note content (up to 5000 chars)
2. Include related note titles + 400 char summaries
3. User response (full text)

**Implementation:**
```typescript
// Prompt generation context
const promptContext = {
  mainNote: {
    title: mainNote.title,
    summary: extractMarkdownSummary(mainNote.content, 500),
    tags: mainNote.metadata.tags
  },
  relatedNotes: relatedNotes.slice(0, 3).map(n => ({
    title: n.title,
    summary: extractMarkdownSummary(n.content, 300),
    relationship: n.linkType || 'related'
  }))
};

// Response analysis context
const analysisContext = {
  prompt: generatedPrompt,
  userResponse: userTypedResponse,
  mainNote: {
    title: mainNote.title,
    content: mainNote.content.slice(0, 5000), // full or first 5k chars
    tags: mainNote.metadata.tags
  },
  relatedNotes: relatedNotes.slice(0, 3).map(n => ({
    title: n.title,
    summary: extractMarkdownSummary(n.content, 400)
  }))
};
```

**Estimated costs:**
- Prompt generation: ~2,000 tokens per call
- Response analysis: ~4,000 tokens per call
- Total per review: ~6,000 tokens
- With Haiku ($0.25/MTok input): ~$0.0015 per review
- 100 reviews: ~$0.15

### Phase 2: Optimize Based on Data

After MVP, analyze actual performance:

1. **Measure prompt quality** - Are synthesis prompts meaningful?
2. **Measure analysis quality** - Is AI feedback helpful?
3. **Check context sufficiency** - Are summaries too short?

Potential improvements:
- Increase context budgets if quality suffers
- Add AI summarization for long notes (>5000 chars)
- Implement caching for frequently accessed notes
- Use embeddings for very large vaults (1000+ notes)

### Phase 3: Advanced Context Management

For power users with large vaults:

1. **Embedding-based retrieval** - Relevant chunks only
2. **Smart caching** - Pre-compute summaries
3. **Adaptive budgets** - More context for complex notes
4. **User control** - Let users adjust context depth

## Fallback Strategies

### When context is insufficient:

**For prompt generation:**
- If related notes too long, use title-only synthesis
- Fallback to single-note prompts if no good related notes
- Use generic templates if AI generation fails

**For response analysis:**
- If note too long, prioritize sections mentioned in response
- Skip detailed feedback if context unclear
- Provide encouraging but generic feedback

### Error handling:

```typescript
async function generateSynthesisPrompt(
  noteId: string
): Promise<ReviewPrompt> {
  try {
    const context = buildPromptContext(noteId);

    // Check if context is sufficient
    if (!hasEnoughContext(context)) {
      return generateFallbackPrompt(noteId, 'single-note');
    }

    const prompt = await callAI(context);
    return prompt;

  } catch (error) {
    if (error.code === 'CONTEXT_TOO_LARGE') {
      // Reduce context and retry
      return generateSynthesisPrompt(noteId, { reduceContext: true });
    }

    // Ultimate fallback
    return getTemplatePrompt(noteId);
  }
}
```

## Future Optimizations

### 1. Summary Caching

Pre-compute and cache summaries:
```typescript
interface SummaryCache {
  noteId: string;
  lengths: {
    short: { text: string; timestamp: Date };
    medium: { text: string; timestamp: Date };
    long: { text: string; timestamp: Date };
  };
  embeddings?: Vector;
}
```

Invalidate when note changes:
- Watch for note edits
- Regenerate summaries in background
- Keep old summaries for recent history

### 2. Hierarchical Context

Build context in layers:
```
Layer 1: Titles + tags (always include)
Layer 2: First paragraph summaries (include if budget allows)
Layer 3: Full markdown structure (include for main note)
Layer 4: Full content (only for main note in analysis)
```

### 3. Relevance Scoring

Score each piece of context:
```typescript
function scoreRelevance(
  chunk: string,
  mainConcept: string,
  relationship: string
): number {
  let score = 0;

  // Explicit links score higher
  if (relationship === 'explicit-link') score += 50;

  // Shared tags
  score += countSharedTags(chunk, mainConcept) * 10;

  // Semantic similarity (if embeddings available)
  score += semanticSimilarity(chunk, mainConcept) * 30;

  return score;
}
```

Include only highest-scoring chunks until budget exhausted.

### 4. User Preferences

Let users control trade-offs:
```yaml
review:
  context_strategy: 'balanced' # 'minimal' | 'balanced' | 'comprehensive'
  max_tokens_per_review: 6000
  include_full_main_note: true
  related_notes_count: 3
  use_ai_summaries: false # enable for large notes
```

## Comparison Table

| Strategy | Quality | Cost | Speed | Complexity | Scalability |
|----------|---------|------|-------|------------|-------------|
| Simple truncation (200 chars) | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ |
| Smart truncation (start+end) | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ |
| Markdown-aware | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| Token budgets | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| AI summarization | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Embedding retrieval | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Hybrid (recommended) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

## Implementation Checklist

### MVP (Phase 1)

- [ ] Implement `extractMarkdownSummary()` function
- [ ] Set context budgets for prompt generation (3k tokens)
- [ ] Set context budgets for response analysis (5k tokens)
- [ ] Limit to max 3 related notes
- [ ] Add fallback for when context insufficient
- [ ] Add error handling for context too large
- [ ] Test with various note sizes (100 chars to 10k chars)
- [ ] Monitor actual token usage in development

### Phase 2 Improvements

- [ ] Add summary caching layer
- [ ] Implement smart truncation with paragraph awareness
- [ ] Add token counting utilities
- [ ] Create adaptive budgets based on note size
- [ ] Add user preferences for context depth
- [ ] Measure and log context quality metrics

### Future Enhancements

- [ ] Implement embedding-based retrieval
- [ ] Add AI-powered summarization for long notes
- [ ] Build hierarchical context system
- [ ] Create relevance scoring for chunks
- [ ] Support user-defined context strategies

## Open Questions

1. **What's the minimum context for good synthesis prompts?**
   - Need to test with real notes
   - May vary by domain (technical vs. narrative notes)

2. **Should we include backlinks context?**
   - Backlinks provide additional connections
   - But may balloon context size
   - Consider for Phase 2

3. **How to handle very long notes (10k+ words)?**
   - Option: Warn user that note may be too long for effective review
   - Option: Require user to split into smaller notes
   - Option: Use embedding-based extraction

4. **Should context strategy be per-note-type?**
   - Literature notes might need more context
   - Fleeting notes need less
   - Consider type-aware budgets

5. **Cache invalidation strategy?**
   - When note edited, invalidate summaries
   - But what if linked notes change?
   - Trade-off: accuracy vs. performance

## Conclusion

**For MVP:** Start with hybrid approach (Option 7)
- Markdown-aware extraction
- Fixed token budgets
- Simple and predictable
- Good enough for most notes

**Monitor and iterate:**
- Collect metrics on prompt/analysis quality
- Adjust budgets based on real usage
- Add more sophisticated strategies as needed

**Long-term:** Move toward embedding-based retrieval for large vaults

The key is to start simple, measure actual performance, and optimize based on data rather than premature optimization.

---

**Document Status:** Analysis complete, ready for review
**Created:** 2025-01-15
**Next Steps:** Review with team, implement MVP strategy, test with real notes
