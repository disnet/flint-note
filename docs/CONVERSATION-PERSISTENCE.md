# Conversation Persistence in Flint

This document outlines the conversation persistence system implemented in Flint's UI, which allows AI agent conversations to survive app restarts and provides a robust conversation management experience.

## Overview

The conversation persistence system transforms the previously ephemeral AI conversations into a persistent, vault-organized conversation history. Each conversation is automatically saved and can be resumed at any time, providing a seamless user experience across app sessions.

## Architecture

### Core Components

**ConversationStore** (`src/renderer/src/stores/conversationStore.svelte.ts`)
- Central state management for all conversation data
- Handles persistence to localStorage with vault-specific keys
- Manages conversation lifecycle (create, update, delete, switch)
- Provides reactive access to conversation data via Svelte 5 runes

**ConversationHistory Component** (`src/renderer/src/components/ConversationHistory.svelte`)
- UI component for browsing and managing conversation history
- Displays conversation metadata (title, preview, message count, date)
- Enables conversation switching and deletion
- Shows empty state when no conversations exist

**Enhanced AIAssistant** (`src/renderer/src/components/AIAssistant.svelte`)
- Integrates conversation history panel toggle
- Shows current conversation indicator
- Provides new conversation creation
- Maintains backwards compatibility with existing message flow

### Data Structure

```typescript
interface Conversation {
  id: string;              // Unique conversation identifier
  title: string;           // Auto-generated from first user message
  messages: Message[];     // Array of conversation messages
  createdAt: Date;        // Conversation creation timestamp
  updatedAt: Date;        // Last activity timestamp
  vaultId: string;        // Associated vault for organization
}
```

## Key Features

### 1. Automatic Persistence

**Message Integration**: Every message sent or received is automatically saved to the active conversation without requiring explicit user action.

**Real-time Updates**: Streaming responses and tool calls are captured in real-time as they arrive, ensuring no data is lost during streaming operations.

**Vault Association**: Each conversation is tied to the vault that was active when it was created, providing logical organization.

### 2. Conversation Management

**Auto-generated Titles**: Conversation titles are automatically created from the first 50 characters of the initial user message, with "..." appended if truncated.

**Recency Ordering**: Conversations are automatically sorted by last activity, with the most recent conversations appearing first.

**Storage Limits**: Each vault maintains up to 50 conversations, with older conversations automatically pruned when the limit is exceeded.

### 3. Vault Integration

**Vault-specific Storage**: Conversations are stored using vault-specific localStorage keys (`conversations-{vaultId}`), ensuring isolation between different vaults.

**Automatic Switching**: When switching vaults, the conversation store automatically loads the conversation history for the new vault and saves the current vault's conversations.

**Migration Support**: The system handles vault switching gracefully, preserving conversations for each vault independently.

### 4. User Interface

**History Panel**: A toggleable panel within the AI Assistant that shows all conversations for the current vault.

**Conversation Indicators**: The AI Assistant header displays the current conversation title, providing clear context about which conversation is active.

**Quick Actions**: Users can quickly start new conversations, switch between existing ones, or delete conversations they no longer need.

## Storage Implementation

### localStorage Schema

Conversations are stored in localStorage with the following structure:

```javascript
// Key: `conversations-{vaultId}`
{
  conversations: [
    {
      id: "conv-1704067200000-abc123def",
      title: "How to implement authentication in Svelte?",
      messages: [...],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:15:30.000Z",
      vaultId: "vault-123"
    },
    // ... more conversations
  ],
  activeConversationId: "conv-1704067200000-abc123def",
  maxConversations: 50
}
```

### Data Persistence Flow

1. **Message Addition**: When a user sends a message or receives a response:
   - If no active conversation exists, a new one is automatically created
   - The message is added to the active conversation's message array
   - Conversation metadata (title, updateAt) is updated if necessary
   - The entire state is saved to localStorage

2. **Conversation Switching**: When switching to a different conversation:
   - The activeConversationId is updated
   - UI automatically updates to show the selected conversation's messages
   - State is persisted to localStorage

3. **Vault Switching**: When changing vaults:
   - Current vault's conversations are saved to localStorage
   - New vault's conversations are loaded from localStorage
   - UI resets to show the new vault's conversation history

## Integration Points

### App.svelte Changes

The main application component (`App.svelte`) was modified to integrate with the conversation store:

- **Message State**: Replaced direct message state management with derived state from `conversationStore.currentMessages`
- **Message Handling**: Updated `handleSendMessage` to use conversation store methods
- **Streaming Support**: Modified streaming callbacks to use conversation store's `updateMessage` method

### Vault Switching Integration

The `VaultSwitcher.svelte` component was updated to include conversation store refresh:

```typescript
// Refresh all vault-specific stores when switching vaults
await pinnedNotesStore.refreshForVault(vaultId);
await temporaryTabsStore.refreshForVault(vaultId);
await conversationStore.refreshForVault(vaultId); // New integration
```

## API Reference

### ConversationStore Methods

**Core Operations**:
- `startNewConversation()`: Creates and activates a new conversation
- `addMessage(message)`: Adds a message to the active conversation
- `updateMessage(messageId, updates)`: Updates a specific message (for streaming)
- `switchToConversation(conversationId)`: Changes the active conversation
- `deleteConversation(conversationId)`: Removes a conversation permanently

**State Access**:
- `conversations`: Array of all conversations for current vault
- `activeConversation`: Current conversation object or null
- `activeConversationId`: ID of current conversation or null
- `currentMessages`: Messages array for backward compatibility

**Vault Management**:
- `refreshForVault(vaultId)`: Switches conversation context to specified vault
- `clearAllConversations()`: Removes all conversations for current vault

### ConversationHistory Component Props

```typescript
interface Props {
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
}
```

## Backward Compatibility

The system maintains full backward compatibility:

- **Existing Message Flow**: All existing message handling continues to work unchanged
- **Component Interfaces**: No breaking changes to existing component APIs
- **Storage Migration**: Old non-persistent message state gracefully transitions to persistent conversations

## Performance Considerations

### Memory Management

- **Lazy Loading**: Conversations are loaded from localStorage only when the vault is accessed
- **Efficient Updates**: Only changed conversations trigger localStorage writes
- **Cleanup**: Automatic pruning of old conversations prevents unbounded storage growth

### UI Responsiveness

- **Reactive Updates**: Svelte 5 runes ensure efficient UI updates when conversation state changes
- **Debounced Saves**: Storage operations are optimized to prevent excessive localStorage writes
- **Smooth Transitions**: Conversation switching provides immediate UI feedback

## Error Handling

### Storage Failures

- **Graceful Degradation**: If localStorage is unavailable, conversations still work in memory
- **Error Logging**: Storage failures are logged but don't crash the application
- **Recovery**: Invalid stored data is handled gracefully with fallback to empty state

### Vault Switching

- **State Cleanup**: Proper cleanup prevents memory leaks during vault switches
- **Error Recovery**: Failed vault switches don't leave the conversation store in an inconsistent state

## Future Enhancements

### Potential Improvements

1. **Search**: Full-text search across conversation history
2. **Export**: Export conversations to various formats (JSON, Markdown, etc.)
3. **Archiving**: Move old conversations to archive instead of deletion
4. **Conversation Tagging**: Add user-defined tags for better organization
5. **Conversation Sharing**: Share conversations between users or vaults
6. **Backup/Sync**: Cloud backup and synchronization across devices

### Technical Debt

1. **Storage Backend**: Consider migrating from localStorage to IndexedDB for larger storage capacity
2. **Message Compression**: Implement message compression for storage efficiency
3. **Incremental Loading**: Load conversation history incrementally for large conversation sets

## Conclusion

The conversation persistence system successfully transforms Flint's AI assistant from a stateless chat interface into a robust conversation management system. By leveraging Svelte 5's reactive capabilities and maintaining strict separation of concerns, the implementation provides a foundation for future enhancements while preserving the excellent user experience that Flint users expect.

The system's vault-aware design ensures that conversations remain contextually organized, while the automatic persistence removes the friction of manual conversation management. This enhancement significantly improves the utility of Flint's AI assistant for users who engage in extended or recurring conversations with the agent.