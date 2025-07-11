<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Message, SlashCommand, NoteReference } from '../types/chat';
  import SlashCommands from './SlashCommands.svelte';
  import MessageContent from './MessageContent.svelte';
  import { llmClient } from '../services/llmClient';
  import { mcpClient } from '../services/mcpClient';

  // Initial welcome message - use regular let for now
  let messages: Message[] = $state([
    {
      id: '1',
      type: 'system',
      content:
        "Welcome to Flint! I'm your AI assistant powered by LM Studio. How can I help you today?",
      timestamp: new Date()
    }
  ]);

  let inputValue = $state('');
  let chatContainer: HTMLElement;
  let isTyping = $state(false);
  let showSlashCommands = $state(false);
  let slashCommandQuery = $state('');
  let slashCommandPosition = $state({ x: 0, y: 0 });
  let slashCommandMaxHeight = $state(400);
  let inputElement: HTMLTextAreaElement;
  let isLLMAvailable = $state(false);
  let streamingResponse = $state('');
  let isStreaming = $state(false);
  let mcpEnabled = $state(false);
  let mcpTools: Array<{ name: string; description: string }> = [];

  const handleSendMessage = async (): Promise<void> => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    messages = [...messages, newMessage];
    const userInput = inputValue;
    inputValue = '';

    // Reset textarea height
    if (inputElement) {
      inputElement.style.height = 'auto';
      inputElement.style.height = '2.5rem';
    }

    // Generate LLM response
    await generateLLMResponse(userInput);
  };

  const generateLLMResponse = async (userInput: string): Promise<void> => {
    if (!isLLMAvailable) {
      // Fallback to mock response if LLM is not available
      const fallbackResponse: Message = {
        id: Date.now().toString(),
        type: 'agent',
        content: `I received your message: "${userInput}". LLM is not available. Please check your LM Studio connection.`,
        timestamp: new Date()
      };
      messages = [...messages, fallbackResponse];
      return;
    }

    try {
      isTyping = true;
      isStreaming = true;
      streamingResponse = '';

      // Create conversation history for context
      const conversationHistory = llmClient.createConversationHistory(messages, 10);

      // Stream the response
      await llmClient.streamResponse(
        conversationHistory,
        (chunk: string) => {
          streamingResponse += chunk;
        },
        (fullResponse: string) => {
          // Response complete
          const agentResponse: Message = {
            id: Date.now().toString(),
            type: 'agent',
            content: fullResponse,
            timestamp: new Date()
          };
          messages = [...messages, agentResponse];
          isTyping = false;
          isStreaming = false;
          streamingResponse = '';
        },
        (error: string) => {
          // Error occurred
          console.error('LLM streaming error:', error);
          const errorResponse: Message = {
            id: Date.now().toString(),
            type: 'agent',
            content: `Sorry, I encountered an error: ${error}`,
            timestamp: new Date()
          };
          messages = [...messages, errorResponse];
          isTyping = false;
          isStreaming = false;
          streamingResponse = '';
        }
      );
    } catch (error) {
      console.error('Error generating LLM response:', error);
      const errorResponse: Message = {
        id: Date.now().toString(),
        type: 'agent',
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date()
      };
      messages = [...messages, errorResponse];
      isTyping = false;
      isStreaming = false;
      streamingResponse = '';
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (showSlashCommands) {
      // Let SlashCommands component handle navigation
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleInput = (event: Event): void => {
    const target = event.target as HTMLTextAreaElement;
    inputValue = target.value;

    // Auto-resize textarea
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 8 * 24) + 'px'; // Max 8 lines

    // Check for slash command trigger
    const cursorPosition = target.selectionStart;
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

    if (lastSlashIndex !== -1) {
      const textAfterSlash = textBeforeCursor.substring(lastSlashIndex + 1);
      // Only show commands if slash is at start or after whitespace
      const charBeforeSlash =
        lastSlashIndex === 0 ? ' ' : textBeforeCursor[lastSlashIndex - 1];

      if (charBeforeSlash === ' ' || lastSlashIndex === 0) {
        if (!textAfterSlash.includes(' ') || textAfterSlash.trim() === '') {
          showSlashCommands = true;
          slashCommandQuery = textAfterSlash;
          updateSlashCommandPosition(target);
          return;
        }
      }
    }

    // Hide slash commands if not triggered
    showSlashCommands = false;
  };

  const updateSlashCommandPosition = (textarea: HTMLTextAreaElement): void => {
    const rect = textarea.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Calculate available space above and below the textarea
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;

    // Preferred command palette height (from CSS max-height)
    const preferredHeight = 400;
    const minHeight = 200;
    const padding = 20;

    // Check if we have enough space above for the full palette
    if (spaceAbove >= preferredHeight + padding) {
      // Position above with full height
      slashCommandPosition = {
        x: rect.left,
        y: rect.top - preferredHeight - padding
      };
      slashCommandMaxHeight = preferredHeight;
    } else if (spaceAbove >= minHeight + padding) {
      // Position above with reduced height
      const availableHeight = spaceAbove - padding;
      slashCommandPosition = {
        x: rect.left,
        y: padding
      };
      slashCommandMaxHeight = availableHeight;
    } else {
      // Not enough space above, position below if there's more space there
      if (spaceBelow > spaceAbove) {
        slashCommandPosition = {
          x: rect.left,
          y: rect.bottom + 10
        };
        slashCommandMaxHeight = Math.min(spaceBelow - 20, preferredHeight);
      } else {
        // Position at top of viewport with available height
        const availableHeight = spaceAbove - padding;
        slashCommandPosition = {
          x: rect.left,
          y: padding
        };
        slashCommandMaxHeight = Math.max(availableHeight, minHeight);
      }
    }
  };

  const handleSlashCommand = (command: SlashCommand, args: string[]): void => {
    // Remove the slash command from input
    const slashIndex = inputValue.lastIndexOf('/');
    if (slashIndex !== -1) {
      inputValue = inputValue.substring(0, slashIndex);
    }

    // Execute the command
    executeSlashCommand(command, args);
    showSlashCommands = false;
  };

  const executeSlashCommand = async (
    command: SlashCommand,
    args: string[]
  ): Promise<void> => {
    // Create a system message showing the command execution
    const commandMessage: Message = {
      id: Date.now().toString(),
      type: 'system',
      content: `Executed command: /${command.name}${args.length > 0 ? ' ' + args.join(' ') : ''}`,
      timestamp: new Date()
    };

    messages = [...messages, commandMessage];

    // Generate contextual response using LLM
    const commandPrompt = `User executed the command: /${command.name}${args.length > 0 ? ' ' + args.join(' ') : ''}. ${command.description}. Please provide a helpful response for this command.`;

    if (isLLMAvailable) {
      await generateLLMResponse(commandPrompt);
    } else {
      // Fallback to mock responses
      setTimeout(() => {
        const response: Message = {
          id: (Date.now() + 1).toString(),
          type: 'agent',
          content: getCommandResponse(command, args),
          timestamp: new Date()
        };
        messages = [...messages, response];
      }, 1000);
    }
  };

  const getCommandResponse = (command: SlashCommand, args: string[]): string => {
    const argText = args.length > 0 ? args.join(' ') : '';

    switch (command.name) {
      case 'create':
        return `I've created a new note${argText ? ` about "${argText}"` : ''}. The [[${argText || 'New Note'}]] is now available in your vault. Would you like me to add any specific sections or content?`;

      case 'find':
        return `I found several notes${argText ? ` related to "${argText}"` : ''}:\n\n• [[Project Planning Template]]\n• [[Daily Standup Notes]]\n• [[Meeting with Design Team]]\n\nWhich one would you like to open?`;

      case 'update':
        return `I've updated the [[${argText || 'selected note'}]] with your recent changes. The modifications have been saved and are ready for review.`;

      case 'switch-vault':
        return `Switched to vault: ${argText || 'Personal Notes'}. You now have access to all notes in this vault. Current vault contains 47 notes across 8 categories.`;

      case 'list-vaults':
        return `Available vaults:\n\n• **Personal Notes** (47 notes) - *Current*\n• **Work Projects** (23 notes)\n• **Research** (15 notes)\n• **Archive** (102 notes)\n\nUse \`/switch-vault [name]\` to change vaults.`;

      case 'weekly-review':
        return `I've generated your weekly review template. Here's what I found:\n\n**This Week's Progress:**\n• Completed 5 tasks from [[Project Planning Template]]\n• Updated [[Daily Standup Notes]] daily\n• Attended [[Meeting with Design Team]]\n\n**Next Week's Goals:**\n• Finalize project timeline\n• Review [[Feature Ideas Brainstorm]]\n• Update [[API Documentation]]`;

      case 'brainstorm':
        return `Let's start brainstorming${argText ? ` about "${argText}"` : ''}! I'll help you generate ideas and organize them.\n\n**Initial thoughts:**\n• What are the core objectives?\n• Who are the stakeholders?\n• What constraints should we consider?\n\nI can create a [[Feature Ideas Brainstorm]] document to track our session.`;

      case 'weather':
        return `Getting current weather for ${argText || 'your location'}...\n\nI'll use the weather tool to get real-time weather information. Please wait a moment while I fetch the data.`;

      case 'forecast':
        return `Getting weather forecast for ${argText || 'your location'}...\n\nI'll use the forecast tool to get the upcoming weather predictions. Please wait a moment while I fetch the data.`;

      case 'help':
        return `Here are the available commands:\n\n**Note Commands:**\n• \`/create [title]\` - Create a new note\n• \`/find [query]\` - Search for notes\n• \`/update [title]\` - Update existing note\n\n**Vault Commands:**\n• \`/switch-vault [name]\` - Switch vaults\n• \`/list-vaults\` - Show all vaults\n\n**Tool Commands:**\n• \`/weather [location]\` - Get current weather\n• \`/forecast [location]\` - Get weather forecast\n\n**Templates:**\n• \`/weekly-review\` - Generate weekly review\n• \`/brainstorm [topic]\` - Start brainstorming session\n\nType \`/\` to see all commands with autocomplete!`;

      default:
        return `Command /${command.name} executed successfully. This is a mock response for the ${command.category} command.`;
    }
  };

  const closeSlashCommands = (): void => {
    showSlashCommands = false;
  };

  const handleNoteOpen = (note: NoteReference): void => {
    // Create a system message showing the note click
    const noteMessage: Message = {
      id: Date.now().toString(),
      type: 'system',
      content: `Opening note: ${note.title}${note.type ? ` (${note.type})` : ''}`,
      timestamp: new Date()
    };

    messages = [...messages, noteMessage];

    // TODO: Implement note editor opening logic
    console.log('Opening note:', note);
  };

  // Auto-scroll to bottom when messages or streaming state changes
  let previousMessagesLength = 0;
  let previousStreamingState = false;

  $effect(() => {
    if (chatContainer) {
      const messagesChanged = messages.length !== previousMessagesLength;
      const streamingChanged = isStreaming !== previousStreamingState;

      if (messagesChanged || streamingChanged) {
        setTimeout(() => {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 100);
      }

      previousMessagesLength = messages.length;
      previousStreamingState = isStreaming;
    }
  });

  onMount(async () => {
    // Focus input on mount
    if (inputElement) inputElement.focus();

    // Test LLM connection
    try {
      isLLMAvailable = await llmClient.testConnection();
      if (isLLMAvailable) {
        console.log('LLM connection established');
      } else {
        console.warn('LLM connection failed - falling back to mock responses');
      }
    } catch (error) {
      console.error('Error testing LLM connection:', error);
      isLLMAvailable = false;
    }

    // Check MCP status
    try {
      mcpEnabled = await mcpClient.isEnabled();
      if (mcpEnabled) {
        mcpTools = await mcpClient.getTools();
        console.log('MCP tools available:', mcpTools.length);
        console.log(mcpTools);
      }
    } catch (error) {
      console.error('Error checking MCP status:', error);
      mcpEnabled = false;
    }

    // Add window resize listener to update slash command position
    const handleResize = (): void => {
      if (showSlashCommands && inputElement) {
        updateSlashCommandPosition(inputElement);
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  onDestroy(() => {
    // Clean up streaming listeners
    if (llmClient) {
      llmClient.stopStreaming();
    }
  });
</script>

<div class="chat-container">
  <div class="messages-container" bind:this={chatContainer}>
    {#each messages as message (message.id)}
      <div class="message message-{message.type}">
        <div class="message-content">
          <MessageContent
            content={message.content}
            messageType={message.type}
            openNote={handleNoteOpen}
          />
        </div>
        <div class="message-timestamp">
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    {/each}

    {#if isTyping}
      <div class="message message-agent">
        <div class="message-content">
          {#if isStreaming && streamingResponse}
            <MessageContent
              content={streamingResponse}
              messageType="agent"
              openNote={handleNoteOpen}
            />
          {:else}
            <div class="typing-indicator">
              <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- MCP Status Indicator -->
  <!-- {#if mcpEnabled && mcpTools.length > 0}
    <div class="mcp-status">
      <span class="mcp-indicator">🔧</span>
      <span class="mcp-text">MCP Tools: {mcpTools.length} available</span>
    </div>
  {/if} -->

  <div class="input-area">
    <div class="input-wrapper">
      <textarea
        id="chat-input"
        bind:this={inputElement}
        bind:value={inputValue}
        onkeydown={handleKeyDown}
        oninput={handleInput}
        placeholder="Type your message... (Press Enter to send, Shift+Enter for new line, / for commands){isLLMAvailable
          ? ''
          : ' - LLM offline'}"
        rows="1"
        class="chat-input"
        style="height: auto; min-height: 2.5rem;"
        disabled={isStreaming}
      ></textarea>
      <button
        onclick={handleSendMessage}
        disabled={!inputValue.trim() || isStreaming}
        class="send-button"
        aria-label="Send message"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M22 2L11 13" />
          <path d="M22 2L15 22L11 13L2 9L22 2Z" />
        </svg>
      </button>
    </div>
  </div>
</div>

<SlashCommands
  isOpen={showSlashCommands}
  query={slashCommandQuery}
  position={slashCommandPosition}
  maxHeight={slashCommandMaxHeight}
  command={handleSlashCommand}
  close={closeSlashCommands}
/>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 100%;
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    scroll-behavior: smooth;
  }

  .message {
    margin-bottom: 1rem;
    max-width: 80%;
    word-wrap: break-word;
  }

  .message-user {
    margin-left: auto;
  }

  .message-agent,
  .message-system {
    margin-right: auto;
  }

  .message-content {
    padding: 0.75rem 1rem;
    border-radius: 1rem;
    white-space: pre-wrap;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .message-user .message-content {
    background-color: #007bff;
    color: white;
    border-bottom-right-radius: 0.25rem;
  }

  .message-agent .message-content {
    background-color: #f8f9fa;
    color: #333;
    border: 1px solid #dee2e6;
    border-bottom-left-radius: 0.25rem;
  }

  .message-system .message-content {
    background-color: #e9ecef;
    color: #6c757d;
    font-style: italic;
    text-align: center;
  }

  .message-timestamp {
    font-size: 0.75rem;
    color: #6c757d;
    margin-top: 0.25rem;
    text-align: right;
  }

  .message-agent .message-timestamp,
  .message-system .message-timestamp {
    text-align: left;
  }

  .typing-indicator {
    background-color: #f8f9fa !important;
    border: 1px solid #dee2e6 !important;
    padding: 0.75rem 1rem !important;
  }

  .typing-dots {
    display: flex;
    gap: 0.25rem;
  }

  .typing-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #6c757d;
    animation: typing 1.4s infinite ease-in-out;
  }

  .typing-dots span:nth-child(1) {
    animation-delay: -0.32s;
  }

  .typing-dots span:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes typing {
    0%,
    80%,
    100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }

  .input-area {
    padding: 1rem;
    border-top: 1px solid #dee2e6;
    background-color: white;
  }

  .input-wrapper {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
    max-width: 100%;
  }

  .chat-input {
    flex: 1;
    resize: none;
    border: 1px solid #dee2e6;
    border-radius: 1rem;
    padding: 0.75rem 1rem;
    font-family: inherit;
    font-size: 0.9rem;
    line-height: 1.4;
    min-height: 2.5rem;
    max-height: 8rem;
    overflow-y: auto;
    outline: none;
    transition: border-color 0.2s;
  }

  .chat-input:focus {
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }

  .send-button {
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 50%;
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .send-button:hover:not(:disabled) {
    background-color: #0056b3;
    transform: scale(1.05);
  }

  .send-button:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
    transform: none;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .message-agent .message-content {
      background-color: #343a40;
      color: #f8f9fa;
      border-color: #495057;
    }

    .message-system .message-content {
      background-color: #495057;
      color: #adb5bd;
    }

    .input-area {
      background-color: #212529;
      border-color: #495057;
    }

    .chat-input {
      background-color: #343a40;
      color: #f8f9fa;
      border-color: #495057;
    }

    .chat-input:focus {
      border-color: #007bff;
      box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
    }

    .typing-indicator {
      background-color: #343a40 !important;
      border-color: #495057 !important;
    }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .message {
      max-width: 90%;
    }

    .messages-container {
      padding: 0.5rem;
    }

    .input-area {
      padding: 0.5rem;
    }

    .message-content {
      font-size: 0.85rem;
    }
  }
</style>
