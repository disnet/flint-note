# Flint Agent UX & Interaction Improvements Plan

## Executive Summary

This document analyzes the current state of Flint's LLM agent interactions and proposes improvements across UI/UX, context management, system prompts, agent alignment, tooling, and evaluation. The goal is to create a more transparent, efficient, and effective AI assistant experience.

## Current State Analysis

### Architecture Overview

**AI Service** (`src/main/ai-service.ts`)

- Uses Vercel AI SDK with OpenRouter
- Currently limited to Claude models (Sonnet 4.5, Haiku 3.5)
- Context window: 200k tokens for both models
- Implements prompt caching (system message + history)
- Fixed conversation history: 20 messages max
- Tool calling via Vercel AI SDK
- Streaming responses with tool call events

**UI Components**

- `AIAssistant.svelte`: Main conversation container
- `MessageComponent.svelte`: Individual message display
- `ToolCallComponent.svelte`: Collapsible tool call widget (one per tool call)
- `ConversationHistory.svelte`: Thread list sidebar
- `AgentControlBar.svelte`: Thread switching controls

**System Prompt** (`src/main/system-prompt.md`)

- ~390 lines of instructions
- Includes: tool descriptions, API docs, note type definitions, agent instructions
- Dynamically includes: date/time context, note types, custom functions
- Gets injected with vault-specific note type instructions at runtime

**Tool System** (`src/main/tool-service.ts`)

- 14 tools total (basic CRUD + code evaluation + custom functions)
- Tools passed to AI SDK's `generateText` and `streamText`
- Results returned as structured JSON

---

## Problem Areas & Proposed Solutions

### 1. Tool Call UI/UX

#### Current State

- Each tool call creates a separate `ToolCallComponent` widget
- Multiple tools in sequence = cluttered UI
- No aggregation or progressive disclosure
- Tool calls appear inline with messages

#### Problems

- Visual clutter during multi-step operations
- Hard to track overall progress
- Doesn't show "thinking" state well
- No way to collapse all tool activity

#### Proposed Solution: Unified Tool Activity Widget

**Design:**

```
┌─────────────────────────────────────────────┐
│ 🔧 Agent Activity (3 tools running...)      │
│                                     ▼ Collapse
├─────────────────────────────────────────────┤
│ ✅ search_notes ("project notes")           │
│ ⏳ evaluate_note_code (running...)          │
│ ⏳ create_note (pending...)                 │
└─────────────────────────────────────────────┘
```

**Features:**

- Single widget per agent turn
- Animated progress indicator while tools running
- Shows tool execution order
- Collapsible detail view
- Color-coded status (pending, running, success, error)
- Compact by default, expandable for details

**Implementation:**

1. Create `AgentActivityWidget.svelte` component
2. Track tool calls at the message level (not individual components)
3. Group all tool calls from a single agent turn
4. Add animation states: idle → running → complete
5. Store collapsed/expanded state per message

**Phased Rollout:**

- Phase 1: Basic aggregation (group tool calls)
- Phase 2: Animation and status indicators
- Phase 3: Progressive disclosure UI

---

### 2. Context Window Management

#### Current State

- No visibility into token usage
- Hard limit: 20 messages per conversation
- No max token limit enforcement
- Uses rough estimation (char count / 3.5)
- Context window: 200k tokens

#### Problems

- Users don't know how much context they've used
- Message limit is arbitrary and confusing
- Bad for caching (cuts off older messages)
- No graceful degradation when approaching limit
- Doesn't leverage full context window

#### Proposed Solution: Token-Aware Context Management

**UI Indicators:**

```
┌─────────────────────────────────────┐
│ Context: ████████░░░░░░  45%        │
│ ~90k / 200k tokens                  │
└─────────────────────────────────────┘
```

**Display Options:**

1. **Progress bar** in conversation header (subtle, always visible)
2. **Detailed breakdown** in settings/debug view
   - System prompt: X tokens
   - Conversation history: Y tokens
   - Remaining: Z tokens
3. **Warning states:**
   - 60%: Yellow indicator
   - 80%: Orange indicator
   - 95%: Red indicator with options

**Token Counting:**

- Use actual tokenizer for accurate counts (not estimation)
- Options:
  - Client-side: `@anthropic-ai/tokenizer` (if available)
  - Server-side: Count from API response metadata
  - Hybrid: Estimate client-side, confirm server-side

**Context Strategy:**

Replace message-count limit with token-based management:

1. **Target: Keep conversation at 60-70% of context window**
   - Reserves 30-40% for responses and tool outputs
2. **When approaching 80%:**
   - Show warning to user
   - Offer options: compact, summarize, or new thread
3. **Compaction strategies:**
   - Remove tool call details (keep results only)
   - Summarize older message pairs
   - Keep system prompt + recent messages

**Implementation:**

```typescript
interface ContextUsage {
  systemPrompt: number; // tokens
  conversationHistory: number; // tokens
  tools: number; // tokens
  total: number; // tokens
  percentage: number; // 0-100
  maxTokens: number; // model-specific
}

class ContextManager {
  calculateUsage(): ContextUsage;
  shouldWarn(): boolean;
  shouldCompact(): boolean;
  compactHistory(strategy: 'summarize' | 'prune'): Message[];
}
```

**Caching Considerations:**

- Longer histories are BETTER for caching
- Don't prune cached segments
- Cache-friendly compaction: keep old messages, compress details

**Model-Specific Limits:**

```typescript
// src/renderer/src/config/models.ts
export const SUPPORTED_MODELS: ModelInfo[] = [
  {
    id: 'anthropic/claude-sonnet-4.5',
    contextLength: 200000,
    recommendedMaxConversation: 140000 // 70% of context
  }
  // ... other models with different limits
];
```

---

### 3. System Prompt Optimization

#### Current State

- ~390 lines base prompt
- Dynamically adds:
  - Note types (with descriptions + agent instructions)
  - Custom functions (with signatures + descriptions)
  - Date/time context
- All vault context in system prompt

#### Problems

- Large vaults with many note types → huge system prompt
- Token burden scales with vault complexity
- Agent instructions may not be in optimal location
- Unclear if system prompt is the right place for all this

#### Analysis: System Prompt vs. Context Injection

**What SHOULD be in system prompt:**

- Core identity and role
- Fundamental behaviors and constraints
- Tool usage philosophy
- Critical safety instructions
- Stable, vault-independent guidelines

**What COULD be injected as messages:**

- Note type definitions (when relevant)
- Specific agent instructions (when working with that type)
- Custom function docs (when needed)
- Temporal context (less critical to cache)

**Proposed Strategy:**

**Tier 1: Core System Prompt (Always)**

- Agent identity and communication style
- Tool selection guidance (basic vs. code evaluator)
- Safety and ethical guidelines
- Base note management philosophy
- ~100-150 lines

**Tier 2: Vault Context (Cached System Prompt Extension)**

- Current vault info
- Note type registry (list only, no full docs)
- Custom function registry (list only)
- ~50-100 lines
- **Benefit:** Caches well per vault

**Tier 3: Just-in-Time Context (User Messages)**

- Full note type details when user asks about that type
- Full custom function docs when referenced
- Recent note activity
- Injected as system-style messages in conversation

**Example Flow:**

User: "Create a meeting note"

```
System: [Core prompt + Vault context]
Assistant: [Recognizes "meeting" type]
System-as-User: <note-type-context>
  Meeting note type:
  - Purpose: Capture meeting discussions
  - Agent instructions: Extract action items, ...
</note-type-context>
Assistant: [Creates note following instructions]
```

**Implementation:**

```typescript
class ContextualSystemPrompt {
  getCorePrompt(): string; // Tier 1
  getVaultContext(vaultId): string; // Tier 2
  getNoteTypeContext(type): Message; // Tier 3
  getCustomFunctionContext(name): Message; // Tier 3
}
```

**Benefits:**

- Reduces token usage for simple queries
- Puts detailed instructions closer to usage point
- Better prompt caching (core rarely changes)
- Scales better with vault complexity

---

### 4. Agent Instruction Adherence

#### Current State

- Note types have `agentInstructions` field (array of strings)
- Instructions added to system prompt
- No verification that agent follows them
- No feedback mechanism

#### Problems

- Hard to know if instructions are working
- Instructions may be too vague
- No way to debug poor adherence
- System prompt position may not be optimal

#### Root Cause Analysis

**Why might agents ignore instructions?**

1. **Prompt position**: Too early in system prompt (buried)
2. **Instruction quality**: Vague or conflicting
3. **Lack of emphasis**: No special formatting or reinforcement
4. **Tool friction**: Instructions require tools agent isn't using
5. **Context dilution**: Too much other information

#### Proposed Solutions

**Solution 1: Instruction Formatting & Emphasis**

Current:

```markdown
### Meeting Note Type

- Extract action items from content
- Identify key decisions
- Tag participants
```

Improved:

```markdown
## CRITICAL: Meeting Note Instructions

When working with meeting notes, you MUST:

1. **Extract Action Items**
   - Format: "[ ] @person: task description"
   - Add to dedicated "Action Items" section
   - Include due dates when mentioned

2. **Identify Key Decisions**
   - Mark with "DECISION:" prefix
   - Include decision maker if mentioned
     ...

VERIFICATION: Before responding, confirm you've:

- [ ] Extracted all action items
- [ ] Identified key decisions
      ...
```

**Solution 2: Contextual Injection (see Section 3)**

Instead of system prompt, inject when relevant:

```typescript
// When user creates/updates a meeting note
messages.push({
  role: 'system',
  content: `ACTIVE NOTE TYPE: meeting\n\n${noteType.agentInstructions.join('\n')}`
});
```

**Solution 3: Instruction Templates & Best Practices**

Provide vault creators with instruction templates:

```markdown
# Agent Instruction Template

## Good Instructions:

- Specific and actionable
- Include examples
- Specify format/structure
- Explain the "why"

## Bad Instructions:

- Vague ("be helpful")
- Contradictory
- Too complex
- No examples

## Template:

When working with [NOTE_TYPE] notes:

1. **Always** [specific action]
   Example: [concrete example]

2. **Extract** [specific data pattern]
   Format: [exact format]

3. **Avoid** [specific anti-pattern]
   Why: [reasoning]
```

**Solution 4: Instruction Validation & Testing**

```typescript
interface InstructionTest {
  noteType: string;
  testScenario: string;
  expectedBehavior: string;
  verificationPrompt: string;
}

// Example:
{
  noteType: 'meeting',
  testScenario: 'Create a meeting note with: "John will follow up on the API design by Friday"',
  expectedBehavior: 'Should extract: [ ] @John: Follow up on API design (by Friday)',
  verificationPrompt: 'Did you extract the action item in the correct format?'
}
```

**Solution 5: Feedback Loop**

Allow users to flag when agent doesn't follow instructions:

- UI: "Agent didn't follow note type instructions" button
- Capture: Note type, instruction, agent output, user expectation
- Use for: Manual review, instruction refinement, model evaluation

---

### 5. RAG vs. Search-Based Context

#### Current Analysis

**Current Approach:**

- Tools for note search (`search_notes`)
- Tools for specific note retrieval (`get_note`)
- Code evaluator for complex queries
- No embeddings or semantic search

**Claude Code's Approach:**

- No RAG
- Search/grep tools
- Pull in context as needed
- Works well for code

**Key Differences: Notes vs. Code**

| Aspect        | Code                      | Notes                        |
| ------------- | ------------------------- | ---------------------------- |
| Structure     | Files, functions, imports | Freeform, links, metadata    |
| Queries       | "Find function X"         | "What did I learn about Y?"  |
| Precision     | High (symbols, types)     | Variable (concepts, themes)  |
| Volume        | Large but structured      | Can be huge and unstructured |
| Relationships | Explicit (imports)        | Implicit (links, themes)     |

#### Recommendation: Hybrid Approach

**Phase 1: Optimize Current Search**

- Improve `search_notes` tool
- Add filters: date range, note type, metadata
- Better ranking/relevance
- Support boolean operators

**Phase 2: Semantic Layer (Optional RAG)**

- **When to use RAG:**
  - Vaults with 1000+ notes
  - Heavy conceptual querying
  - Cross-note synthesis
  - Theme/topic exploration

- **When search is enough:**
  - Small to medium vaults (< 500 notes)
  - Specific note retrieval
  - Link-based navigation
  - Structured metadata queries

**Implementation Strategy:**

```typescript
// Phase 1: Enhanced Search
interface SearchOptions {
  query: string;
  noteTypes?: string[];
  dateRange?: { start: Date; end: Date };
  tags?: string[];
  metadata?: Record<string, any>;
  limit?: number;
  sortBy?: 'relevance' | 'date' | 'title';
}

// Phase 2: Optional Semantic Search
interface SemanticSearchOptions extends SearchOptions {
  useEmbeddings?: boolean; // default: false
  similarityThreshold?: number;
  contextExpansion?: boolean; // include related notes
}
```

**Decision Framework:**

```
User Query → Analyze Query Type
│
├─ Specific ("Get the project note") → Use get_note
├─ Keyword ("Notes about React") → Use search_notes
├─ Conceptual ("What have I learned about leadership?") → Use semantic search (if available)
└─ Complex ("Summarize all Q4 meeting notes") → Use code evaluator
```

**Recommendation:** Start without RAG, add only if needed based on user feedback and vault sizes.

---

### 6. Context Limit Handling Strategies

#### Current Behavior

- Hits 20 message limit → truncates silently
- No user notification
- Loses conversation context
- Bad for prompt caching

#### Proposed Strategies

**Strategy 1: Transparent Warning**

```
┌─────────────────────────────────────────┐
│ ⚠️  Context approaching limit (85%)    │
│                                         │
│ Options:                                │
│ • Start new thread                      │
│ • Compact conversation (keeps essence) │
│ • Continue (may lose context)           │
└─────────────────────────────────────────┘
```

**Strategy 2: Smart Compaction**

Similar to Claude Code's approach:

1. Keep first message (often contains important context)
2. Keep recent N messages (active context)
3. Summarize middle section
4. Preserve critical tool results

```typescript
interface CompactionStrategy {
  keepFirst: number; // e.g., 2 messages
  keepRecent: number; // e.g., 10 messages
  summarizeMiddle: boolean; // true
  preserveToolResults: boolean; // true
}
```

**Strategy 3: Conversation Forking**

Instead of compaction, allow forking:

```
Thread A (old, approaching limit)
  └─> Thread B (new, keeps summary of A)
      - Summary of Thread A in first message
      - Links back to Thread A
      - Fresh context window
```

**Strategy 4: Adaptive Context Window**

Different strategies for different conversation types:

| Conversation Type    | Strategy                     |
| -------------------- | ---------------------------- |
| Quick Q&A            | Aggressive pruning           |
| Research session     | Compaction with summaries    |
| Note creation sprint | New thread with context      |
| Analysis task        | Code evaluator (single turn) |

**Recommended Approach:**

1. **Default:** Warn at 70%, require choice at 90%
2. **Offer:** New thread (default) or compaction
3. **Compaction:** Keep recent 15 messages + summarize rest
4. **Preserve:** All tool results and note references
5. **Link:** New thread references old thread ID

---

### 7. Tool Audit & Optimization

#### Current Tools (14 total)

**Basic CRUD:**

- `get_note` - Retrieve notes by ID
- `create_note` - Create new note
- `update_note` - Update existing note (requires contentHash)
- `delete_note` - Delete note
- `search_notes` - Search or list notes

**Note Type Management:**

- `create_note_type`
- `update_note_type`
- `delete_note_type`

**Vault:**

- `get_vault_info`

**Advanced:**

- `evaluate_note_code` - TypeScript sandbox for complex operations

**Custom Functions:**

- `register_custom_function`
- `test_custom_function`
- `list_custom_functions`
- `validate_custom_function`

#### Analysis

**Well-Designed:**

- ✅ `evaluate_note_code` - Powerful, well-scoped
- ✅ `get_note` - Accepts array of IDs (efficient)
- ✅ `create_note` - Clear required/optional params
- ✅ Custom function tools - Good abstraction

**Needs Improvement:**

- ⚠️ `update_note` - Requires contentHash (friction)
- ⚠️ `search_notes` - Limited filtering options
- ⚠️ Tool descriptions - Could be more concise

**Missing:**

- ❌ Batch operations (create multiple notes)
- ❌ Link management (add/remove links)
- ❌ Hierarchy operations (add subnote, reorder)
- ❌ Tag operations (add/remove tags)

#### Recommendations

**1. Improve Existing Tools**

`update_note`: Make contentHash optional for title-only updates

```typescript
// Before: Always requires contentHash
update_note({ id, title, contentHash }); // contentHash required

// After: Optional for metadata-only updates
update_note({ id, title }); // no contentHash needed for title
update_note({ id, content, contentHash }); // required for content
```

`search_notes`: Add more filters

```typescript
interface SearchNotesInput {
  query?: string;
  noteType?: string;
  tags?: string[]; // NEW
  dateRange?: {
    // NEW
    start: string;
    end: string;
  };
  hasLinks?: boolean; // NEW
  metadata?: Record<string, any>; // NEW
  limit?: number;
  sortBy?: 'created' | 'updated' | 'title' | 'relevance'; // EXPANDED
}
```

**2. Consider New Tools**

**Option A: Add Specific Tools**

```typescript
// Link management
add_link({ noteId, targetId });
remove_link({ noteId, targetId });
get_backlinks({ noteId });

// Hierarchy
add_subnote({ parentId, childId });
get_children({ noteId });

// Tags
add_tags({ noteId, tags });
remove_tags({ noteId, tags });
```

**Option B: Expose Through Code Evaluator**

- Already have full API in sandbox
- Better for complex operations
- Less tool clutter
- Recommendation: **Use code evaluator** (already available via `flintApi`)

**3. Tool Description Improvements**

Current:

```typescript
description: 'Get notes by IDs';
```

Improved:

```typescript
description: 'Retrieve one or more notes by their IDs or identifiers (e.g., ["note123", "meeting/standup"]). Efficient for bulk retrieval.';
```

Add usage hints:

```typescript
description: `
Retrieve notes by IDs.

Use this for:
- Getting specific notes you know the ID of
- Bulk retrieval (pass array of IDs)

Use search_notes instead for:
- Finding notes by content
- Listing notes by type
`.trim();
```

---

### 8. UI Automation & Agent Capabilities

#### Current State

- Agent can only manipulate notes via tools
- No UI automation (can't open notes, switch views, etc.)
- User must manually navigate after agent creates notes

#### Proposed Capabilities

**Tier 1: Note Navigation**

```typescript
// New IPC methods
window.api.openNote(noteId);
window.api.openNoteInSplit(noteId);
window.api.focusNote(noteId);
```

**Tier 2: View Control**

```typescript
window.api.switchView('daily' | 'inbox' | 'chat');
window.api.openSidebar();
window.api.closeSidebar();
```

**Tier 3: Search & Filter**

```typescript
window.api.setSearchQuery(query);
window.api.setNoteTypeFilter(type);
```

#### Safety Considerations

**Prevent UI Chaos:**

- Rate limit UI commands (max 1 per second)
- Confirm destructive navigation (closing unsaved note)
- Allow user to disable UI automation

**User Control:**

```typescript
// Settings
interface AgentUISettings {
  allowNavigation: boolean; // default: true
  allowViewSwitching: boolean; // default: false
  allowSearch: boolean; // default: true
  confirmDestructive: boolean; // default: true
}
```

#### Implementation

**Phase 1: Post-Action Navigation**
After creating/updating note, offer to open it:

```
✅ Created meeting note "Weekly Standup"

[Open Note] [Stay Here]
```

**Phase 2: Tool-Based UI Commands**

```typescript
// New tool
{
  name: 'navigate_to_note',
  description: 'Open a note in the UI after creating or updating it',
  inputSchema: z.object({
    noteId: z.string(),
    splitView: z.boolean().optional()
  })
}
```

**Phase 3: Proactive Navigation**
Agent can suggest/execute navigation:

```
I've created the project plan note. Opening it now so you can review...
[Tool: navigate_to_note({ noteId: "project/plan" })]
```

---

### 9. Dynamic UI Generation (Advanced)

#### Vision

Allow agents to create custom views, dashboards, or visualizations

#### Challenges

- **Security:** Can't allow arbitrary code execution in UI
- **Complexity:** Significant engineering effort
- **Value:** Unclear if users want this

#### Safer Alternatives

**Option 1: Predefined Templates**

```typescript
interface DashboardTemplate {
  type: 'kanban' | 'timeline' | 'graph' | 'table';
  data: {
    noteIds: string[];
    groupBy?: string;
    sortBy?: string;
  };
}

// Agent can populate template
create_dashboard({
  type: 'kanban',
  data: {
    noteIds: allProjectNotes.map((n) => n.id),
    groupBy: 'status'
  }
});
```

**Option 2: Markdown-Based Views**
Agent creates markdown with special syntax:

````markdown
# Project Dashboard

```flint-query
type: project
status: active
```
````

```flint-graph
nodes: $result
```

````

**Recommendation:** Defer until clear user need. Focus on note-based workflows first.

---

### 10. Multi-Model Support

#### Current State
- Only Anthropic Claude (Sonnet 4.5, Haiku 3.5)
- Hard-coded in `models.ts`
- UI has model selector but limited options

#### Benefits of Multi-Model Support
- Cost optimization (cheaper models for simple tasks)
- Capability matching (use best model for task)
- Redundancy (fallback if one provider down)
- User preference

#### Implementation Strategy

**Phase 1: Add More Models**
```typescript
export const SUPPORTED_MODELS: ModelInfo[] = [
  // Anthropic
  { id: 'anthropic/claude-sonnet-4.5', contextLength: 200000, ... },
  { id: 'anthropic/claude-3.5-haiku', contextLength: 200000, ... },

  // OpenAI (add)
  { id: 'openai/gpt-4o', contextLength: 128000, ... },
  { id: 'openai/gpt-4o-mini', contextLength: 128000, ... },

  // Google (add)
  { id: 'google/gemini-2.0-flash', contextLength: 1000000, ... },

  // Others
  { id: 'deepseek/deepseek-chat', contextLength: 64000, ... },
]
````

**Phase 2: Model-Specific Handling**

Different models need different handling:

```typescript
interface ModelCapabilities {
  supportsCaching: boolean;
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  maxTokens: number;
  contextWindow: number;
}

function getModelCapabilities(modelId: string): ModelCapabilities {
  // Return model-specific capabilities
}
```

**Phase 3: Evaluation Matrix**

Test each model on:

- Tool calling reliability
- Instruction following
- Note type understanding
- Code generation quality
- Response quality
- Cost per task

**Phase 4: Smart Model Selection**

```typescript
// Auto-select model based on task
interface TaskComplexity {
  type: 'simple_query' | 'note_creation' | 'complex_analysis';
  estimatedTokens: number;
  requiresTooling: boolean;
}

function selectModel(task: TaskComplexity): string {
  if (task.type === 'simple_query' && task.estimatedTokens < 1000) {
    return 'openai/gpt-4o-mini'; // Cheap and fast
  }
  if (task.requiresTooling && task.type === 'complex_analysis') {
    return 'anthropic/claude-sonnet-4.5'; // Best tool use
  }
  // ... more logic
}
```

---

### 11. Evaluation & Testing Framework

#### Current State

- No systematic evaluation
- Manual testing only
- No benchmarks
- Hard to measure improvements

#### Proposed Framework

**Level 1: Unit Tests for Tools**

```typescript
describe('create_note tool', () => {
  it('should create note with required fields', async () => {
    const result = await toolService.createNote({
      title: 'Test Note',
      noteType: 'meeting',
      content: 'Test content'
    });
    expect(result.success).toBe(true);
  });
});
```

**Level 2: Integration Tests for Agent Flows**

```typescript
describe('Agent: Meeting Note Creation', () => {
  it('should extract action items from meeting content', async () => {
    const conversation = await testAgent({
      userMessage: 'Create a meeting note: John will follow up on API design',
      expectedToolCalls: ['create_note'],
      expectedContent: includes('[ ] @John')
    });
    expect(conversation.success).toBe(true);
  });
});
```

**Level 3: Vault-Specific Evals**

```typescript
interface VaultEvalSuite {
  vaultType: 'personal' | 'work' | 'research';
  noteTypes: string[];
  scenarios: EvalScenario[];
}

interface EvalScenario {
  name: string;
  userMessage: string;
  expectedBehavior: string;
  noteTypeInstructions?: string[];
  scoring: (result: AgentOutput) => number; // 0-100
}
```

**Level 4: Model Comparison**

```typescript
interface ModelEvalResult {
  modelId: string;
  scenario: string;
  score: number;
  latency: number;
  tokenUsage: number;
  cost: number;
  toolCallAccuracy: number;
  instructionAdherence: number;
}

// Run same scenarios across all models
function compareModels(scenarios: EvalScenario[]): ModelEvalResult[] {
  // ...
}
```

**Example Eval Suite:**

```typescript
const MEETING_NOTE_EVALS: EvalScenario[] = [
  {
    name: 'Extract action items',
    userMessage:
      'Create meeting note: Alice to review PR by Thursday, Bob to update docs',
    expectedBehavior:
      'Should create note with action items section containing both tasks',
    scoring: (output) => {
      let score = 0;
      if (output.noteCreated) score += 30;
      if (output.hasActionItems) score += 40;
      if (output.actionItemsCorrect >= 2) score += 30;
      return score;
    }
  },
  {
    name: 'Meeting note structure',
    userMessage: 'Create meeting note about Q4 planning with attendees John, Jane',
    expectedBehavior: 'Should include attendees section, date, and structured content',
    scoring: (output) => {
      // Custom scoring logic
    }
  }
];
```

**Dashboard:**

```
┌─────────────────────────────────────────────┐
│ Flint Agent Evaluation Dashboard           │
├─────────────────────────────────────────────┤
│ Model: Claude Sonnet 4.5                    │
│ Eval Suite: Meeting Notes (10 scenarios)   │
│                                             │
│ Overall Score: 87/100 ✅                    │
│ - Instruction Following: 92/100            │
│ - Tool Usage: 85/100                       │
│ - Output Quality: 89/100                   │
│                                             │
│ Failed Scenarios:                           │
│ - "Complex multi-note creation" (45/100)   │
└─────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

- [ ] Implement unified tool activity widget
- [ ] Add basic context usage tracking (estimated tokens)
- [ ] Add context warning at 80%
- [ ] Improve tool descriptions

### Phase 2: Context Management (Week 3-4)

- [ ] Implement accurate token counting
- [ ] Add context usage UI (progress bar)
- [ ] Implement conversation compaction
- [ ] Add "new thread" prompt at limit

### Phase 3: System Prompt Optimization (Week 5-6)

- [ ] Split system prompt into tiers
- [ ] Implement contextual instruction injection
- [ ] Optimize note type instruction format
- [ ] Add instruction templates for users

### Phase 4: Evaluation (Week 7-8)

- [ ] Create eval framework
- [ ] Build initial eval suite (10 scenarios)
- [ ] Test current model performance
- [ ] Establish baselines

### Phase 5: Multi-Model Support (Week 9-10)

- [ ] Add OpenAI models
- [ ] Add Google Gemini
- [ ] Implement model-specific handling
- [ ] Run comparative evals

### Phase 6: Advanced Features (Week 11-12)

- [ ] Enhanced search filters
- [ ] UI navigation tools (opt-in)
- [ ] Instruction feedback mechanism
- [ ] Agent performance monitoring

---

## Success Metrics

### User Experience

- **Clarity:** User understands agent activity (tool calls visible but not overwhelming)
- **Control:** User knows context status and can manage it
- **Trust:** Agent follows note type instructions reliably

### Technical Performance

- **Context Efficiency:** Average conversation uses 50-70% of context window
- **Cache Hit Rate:** 60%+ cache hits on system prompts
- **Tool Accuracy:** 90%+ tool calls succeed on first try
- **Instruction Adherence:** 85%+ scenarios pass eval tests

### Operational

- **Multi-Model:** Support 3+ model providers
- **Eval Coverage:** 50+ scenarios across common vault types
- **User Feedback:** Instruction feedback mechanism used by 10%+ users

---

## Open Questions

1. **RAG Priority:** Do we need semantic search now, or optimize keyword search first?
   - **Recommendation:** Start with better keyword search, add RAG only if vault size justifies it

2. **Context Compaction:** What's the best UX for compaction?
   - **Recommendation:** Default to "start new thread" with option to compact

3. **UI Automation:** How much control should agents have over UI?
   - **Recommendation:** Start with post-action navigation, expand based on feedback

4. **Model Selection:** Should users manually select models or should we auto-select?
   - **Recommendation:** Manual selection with optional "auto" mode

5. **Instruction Format:** Should we provide a strict schema for agent instructions?
   - **Recommendation:** Start with templates/examples, enforce schema later if needed

6. **Eval Maintenance:** Who creates and maintains eval scenarios?
   - **Recommendation:** Core team creates base suite, community can contribute vault-specific evals

---

## Next Steps

1. **Review this document** with team
2. **Prioritize** which improvements are MVP vs. nice-to-have
3. **Prototype** unified tool activity widget (quick win)
4. **Implement** token tracking (foundation for everything else)
5. **Create** initial eval suite (10 scenarios)
6. **Test** with real vaults and gather feedback

---

## Appendix: Related Work

### Claude Code Analysis

**What they do well:**

- No RAG (search-based)
- Compact representation of tool results
- Smart context management
- Multi-step tool planning

**What we can learn:**

- Keep it simple (no RAG initially)
- Focus on tool quality over quantity
- Good context management > more context
- Transparency in what agent is doing

### Cursor Analysis

**What they do well:**

- Model selection per task
- Aggressive caching
- Multi-file context
- Inline actions

**What we can learn:**

- Smart model routing saves costs
- Cache everything cacheable
- Show progress clearly
- Make agent actions visible

### Differences for Note-Taking

- Code: Structured, code is authoritative
- Notes: Freeform, user intent is authoritative
- Code: Deterministic queries ("find function X")
- Notes: Conceptual queries ("what did I think about Y?")
- Code: Review in place
- Notes: Exploration and discovery
