# LLM Model Provider Switching Implementation

This document outlines the implementation of the LLM model provider switching feature in Flint Electron.

## Overview

The feature allows users to switch between different LLM model providers and specific models directly from the chat interface through a dropdown selector. This enables users to choose the most appropriate model for their specific use case - from cost-effective models for simple queries to powerful models for complex reasoning tasks.

## Architecture

### Frontend Components

1. **ModelSelector Component** (`src/renderer/src/components/ModelSelector.svelte`)
   - Dropdown interface for selecting models
   - Grouped by provider (OpenAI, Anthropic, Google, Meta, Mistral)
   - Shows model capabilities (cost, context length)
   - Visual icons for each provider

2. **Model Configuration** (`src/renderer/src/config/models.ts`)
   - Centralized model definitions
   - Provider information and capabilities
   - Cost and context length metadata

3. **Model Store** (`src/renderer/src/stores/modelStore.ts`)
   - Reactive Svelte 5 runes-based state management
   - Persists selected model to localStorage
   - Provides global access to current model state

### Backend Integration

4. **AIService Updates** (`src/main/ai-service.ts`)
   - Dynamic model switching capability
   - Maintains tool bindings across model changes
   - Conversation history preserved during switches

5. **IPC Communication** (`src/main/index.ts`, `src/preload/index.ts`)
   - Updated message passing to include model parameter
   - Backwards compatible with existing API

## Supported Models

### OpenAI

- GPT-3.5 Turbo
- GPT-4
- GPT-4 Turbo
- GPT-4o

### Anthropic Claude

- Claude 3 Haiku
- Claude 3 Sonnet
- Claude 3 Opus
- Claude 3.5 Sonnet

### Google Gemini

- Gemini Pro
- Gemini 1.5 Pro

### Meta Llama

- Llama 3.1 8B
- Llama 3.1 70B
- Llama 3.1 405B

### Mistral

- Mistral 7B
- Mixtral 8x7B
- Mixtral 8x22B

## Usage

1. The model selector appears in the message input area as a dropdown
2. Click the dropdown to see all available models grouped by provider
3. Select a model to switch immediately for new messages
4. The selection is persisted across app sessions
5. Current conversations continue with the original model; new messages use the selected model

## Technical Details

### State Management

- Uses Svelte 5 runes (`$state`, `$derived`) for reactive state
- localStorage integration for persistence
- Global accessibility through modelStore

### Error Handling

- Graceful fallback to default model on API errors
- Validation of model existence before switching
- Console warnings for invalid model selections

### Performance

- Model switching is immediate (no reinitialization delay)
- Tool bindings maintained efficiently
- Conversation history preserved

## Integration Points

### MessageInput Component

The ModelSelector is integrated directly into the MessageInput component, positioned to the left of the text input field for easy access.

### Chat Service

The ElectronChatService passes the selected model to the backend with each message, enabling per-message model selection.

### UI/UX

- Clean, intuitive dropdown design
- Provider grouping for better organization
- Cost and context length indicators
- Responsive design for mobile devices

## Configuration

The default model can be configured through:

1. Environment variable: `OPENROUTER_MODEL`
2. Model configuration: `DEFAULT_MODEL` constant
3. Falls back to `openai/gpt-4` if not specified

## Future Enhancements

- Model capability indicators (multimodal, tool support)
- Usage analytics and cost tracking
- Smart model recommendations based on query type
- Custom model configurations
- Model performance metrics display
