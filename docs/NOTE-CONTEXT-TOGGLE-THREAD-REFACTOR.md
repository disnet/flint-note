# Note Context Toggle - Thread-Based Persistence Refactor

## Overview

Refactored the note context toggle feature to use thread-based persistence instead of localStorage, making the toggle state part of the conversation thread rather than a global setting.

## Changes Made

### 1. **Thread Data Structure Updates**

**File**: `src/renderer/src/stores/unifiedChatStore.svelte.ts`

- Added `includeNoteContext?: boolean` to `UnifiedThread` interface
- Added `includeNoteContext?: boolean` to `SerializedThread` interface
- Updated thread creation to default `includeNoteContext: true` for new threads
- Added `toggleNoteContext()` method for updating the setting per thread

### 2. **Persistence and Migration**

**File**: `src/renderer/src/stores/unifiedChatStore.svelte.ts`

- Updated deserialization logic to default `includeNoteContext: true` for legacy threads
- Migration code ensures backwards compatibility with existing threads
- Thread state now persists automatically with existing conversation storage mechanism

### 3. **MessageInput Component Refactor**

**File**: `src/renderer/src/components/MessageInput.svelte`

- **Removed**: localStorage-based state management
- **Removed**: `currentVaultId` state variable and related effects
- **Added**: Derived state from `unifiedChatStore.activeThread?.includeNoteContext`
- **Added**: `toggleNoteContext()` function that updates the active thread
- **Updated**: Checkbox to use `onchange` handler instead of `bind:checked`
- **Updated**: Note fetching to use `unifiedChatStore.currentVaultId`

## Architecture Benefits

### 1. **Thread-Specific Context**

- Each conversation thread maintains its own note context preference
- Users can have different settings for different conversations
- Context preference travels with the conversation when switching between threads

### 2. **Improved Data Consistency**

- Note context setting is stored with conversation data
- Automatic persistence through existing conversation storage mechanism
- No risk of localStorage/conversation state getting out of sync

### 3. **Better User Experience**

- Context setting remembers per conversation thread
- More intuitive behavior - users expect conversation settings to be per-conversation
- Seamless experience when switching between threads

### 4. **Simplified State Management**

- Removed localStorage dependency for this feature
- Uses existing unified chat store infrastructure
- Leverages existing thread persistence and sync mechanisms

## Technical Implementation

### **Thread State Management**

```typescript
interface UnifiedThread {
  // ... existing properties
  includeNoteContext?: boolean; // Whether to include note context in this thread
}

// Default value for new threads
includeNoteContext: true

// Method to toggle setting
async toggleNoteContext(threadId: string, includeNoteContext: boolean): Promise<boolean>
```

### **Reactive UI State**

```typescript
// Derived from active thread state
const includeNoteContext = $derived(
  unifiedChatStore.activeThread?.includeNoteContext ?? true
);

// Toggle function updates thread
function toggleNoteContext(): void {
  const activeThreadId = unifiedChatStore.activeThreadId;
  if (activeThreadId) {
    unifiedChatStore.toggleNoteContext(activeThreadId, !includeNoteContext);
  }
}
```

### **Backwards Compatibility**

- Legacy threads without `includeNoteContext` default to `true`
- Migration code handles existing conversation data
- No data loss during transition

## User-Facing Changes

### **Before**: Global Setting

- Note context toggle was vault-wide preference stored in localStorage
- Same setting applied to all conversations in a vault
- Setting persisted across all conversations

### **After**: Per-Thread Setting

- Note context toggle is per-conversation thread
- Each thread remembers its own preference
- New threads default to enabled
- Setting travels with the conversation

This refactor provides a more intuitive and flexible user experience while leveraging better architectural patterns for state management.
