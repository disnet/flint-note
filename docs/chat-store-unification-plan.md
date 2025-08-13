# Chat Store Unification Plan

## Overview

This document outlines the plan to unify the dual chat store system in the Flint application. Currently, we have two parallel conversation management systems:

- **conversationStore** - The active production system handling all chat functionality
- **aiThreadsStore** - A more advanced threading system with richer features but not integrated into the main app

This duplication creates maintenance overhead (~1200 lines of similar code) and prevents users from accessing advanced threading features like archiving, tagging, and search.

## Current State Analysis

### conversationStore (Primary System)
**Components:** App.svelte, AIAssistant.svelte, ConversationHistory.svelte, VaultSwitcher.svelte, electronChatService.ts

**Key Features:**
- Vault-specific conversation isolation
- Backend chat service synchronization
- IPC serialization handling
- Automatic localStorage persistence
- Cost and usage tracking

### aiThreadsStore (Secondary System)
**Components:** ThreadSwitcher.svelte, ThreadList.svelte, threadCleanup.svelte.ts

**Key Features:**
- Rich threading (archiving, tagging, search)
- Notes discussed tracking (wikilinks extraction)
- Enhanced cost tracking with model breakdown
- Better organized data model
- Thread management utilities

**Critical Finding:** No components use both stores - they are completely separate systems.

## Unified Data Model

The new unified store will combine the best aspects of both systems:

```typescript
export interface UnifiedThread {
  // Core thread identity
  id: string;
  title: string;

  // Vault integration (from conversationStore)
  vaultId: string;

  // Messages and conversation
  messages: Message[];

  // Threading features (from aiThreadsStore)
  notesDiscussed: string[];
  tags?: string[];
  isArchived?: boolean;

  // Timestamps
  createdAt: Date;
  lastActivity: Date;

  // Cost tracking (enhanced from both)
  costInfo: ThreadCostInfo;
}

interface UnifiedChatState {
  // Vault-scoped threads
  threadsByVault: Map<string, UnifiedThread[]>;
  activeThreadId: string | null;
  currentVaultId: string | null;

  // Settings
  maxThreadsPerVault: number;
  isLoading: boolean;
}
```

## Implementation Strategy

### Phase 1: Foundation (Low Risk)
**Deliverables:**
- Create `unifiedChatStore.svelte.ts`
- Add backward compatibility layer for smooth transition

**Backward Compatibility Layer:**
```typescript
export const unifiedChatStore = {
  // conversationStore compatibility
  get currentMessages() { return this.activeThread?.messages || [] },
  get activeConversation() { return this.activeThread },
  addMessage: (message) => this.addMessageToActiveThread(message),

  // aiThreadsStore compatibility
  get threads() { return this.getThreadsForCurrentVault() },
  get activeThread() { return this.getActiveThread() },
  createThread: (message?) => this.createThreadInCurrentVault(message),

  // Enhanced unified methods
  switchVault: (vaultId) => this.refreshForVault(vaultId),
  searchThreadsInVault: (query, vaultId?) => { /* ... */ }
}
```

**Risk Mitigation:** All existing component interfaces remain unchanged during this phase.

### Phase 2: Gradual Integration (Medium Risk)
**Migration Order:**
1. Update `App.svelte` to use unified store with compatibility methods
2. Migrate `ConversationHistory.svelte`
3. Migrate `AIAssistant.svelte`
4. Migrate `VaultSwitcher.svelte`
5. Update `electronChatService.ts`

**Risk Mitigation:**
- Maintain both old stores during transition for rollback capability
- Migrate one component at a time with thorough testing
- Feature flags to switch between old/new implementations

### Phase 3: Feature Enhancement (Medium Risk)
**Deliverables:**
- Integrate thread management UI (`ThreadSwitcher.svelte`, `ThreadList.svelte`) into main application flow
- Enable advanced features in main UI:
  - Thread archiving and unarchiving
  - Thread tagging system
  - Cross-thread search
  - Notes discussed tracking
- Add vault-aware thread operations

**Risk Mitigation:** New features are additive and can be disabled if issues arise.

### Phase 4: Cleanup (Low Risk)
**Deliverables:**
- Remove `conversationStore.svelte.ts` and `aiThreadsStore.svelte.ts`
- Remove backward compatibility layer methods
- Optimize data structures and localStorage keys
- Update documentation

**Risk Mitigation:** Only performed after all components successfully migrated and tested.

## Data Migration Strategy

Since there are no existing users of the application, we can implement a clean slate approach:

1. **Clean Implementation:** Build the unified store from scratch without legacy data concerns
2. **Simple Storage:** Use the new unified data model from day one
3. **No Migration Logic:** Skip complex migration utilities and fallback support

This significantly simplifies the implementation and reduces risk.

## Key Benefits

### For Users
- **Enhanced Threading:** Access to archiving, tagging, and search features
- **Better Organization:** Vault-aware thread management with rich metadata
- **Improved Performance:** Single store reduces memory usage and complexity
- **Unified UI:** Thread management becomes part of main application flow

### For Developers
- **Reduced Maintenance:** Eliminate ~1200 lines of duplicated code
- **Single Source of Truth:** One store to maintain, test, and extend
- **Better Architecture:** Clean separation of concerns with unified data model
- **Easier Feature Development:** Single integration point for new chat features

## Risk Assessment and Mitigation

### High Risk Areas
1. **Backend Synchronization Issues**
   - *Mitigation:* Maintain existing IPC serialization logic, gradual rollout
2. **Component Integration Breakage**
   - *Mitigation:* Backward compatibility layer, incremental migration

### Medium Risk Areas
1. **Performance Impact of Vault-Scoped Storage**
   - *Mitigation:* Lazy loading, efficient data structures, performance monitoring
2. **UI/UX Disruption During Transition**
   - *Mitigation:* Feature flags, A/B testing capability

### Low Risk Areas
1. **New Feature Integration**
   - *Mitigation:* Additive features that can be disabled if needed

## Conclusion

This unification plan provides a structured approach to consolidating the dual store system while preserving all existing functionality and enabling advanced threading features. The phased approach with comprehensive backward compatibility minimizes risk while delivering immediate architectural benefits.

The end result will be a more maintainable codebase with enhanced user capabilities, positioning the application for future chat and threading feature development.
