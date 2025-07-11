# OpenRouter Migration Summary

This document summarizes the changes made to migrate Flint from LM Studio to OpenRouter as the default LLM provider.

## Overview

Flint has been updated to use OpenRouter as the default LLM provider instead of LM Studio. This change provides access to multiple state-of-the-art models through a single API while maintaining the option to use local LLM servers for privacy.

## Changes Made

### 1. LLMService Configuration (`src/main/services/llmService.ts`)

- **Default Base URL**: Changed from `http://localhost:1234/v1` to `https://openrouter.ai/api/v1`
- **Default API Key**: Changed from `lm-studio` to empty string (user must provide)
- **Default Model**: Changed from `local-model` to `anthropic/claude-3.5-sonnet`
- **Added OpenRouter Headers**: Added `HTTP-Referer` and `X-Title` headers for OpenRouter compatibility
- **Enhanced Error Handling**: Added specific error messages for OpenRouter authentication, model not found, and rate limiting

### 2. UI Components (`src/renderer/src/components/LLMSettings.svelte`)

- **Updated Default Configuration**: Modified initial state to use OpenRouter defaults
- **Updated Form Fields**:
  - Base URL placeholder: `https://openrouter.ai/api/v1`
  - API Key placeholder: `sk-or-v1-...`
  - Model Name placeholder: `anthropic/claude-3.5-sonnet`
- **Updated Help Text**: Changed descriptions to reference OpenRouter instead of LM Studio
- **Updated Instructions**: Modified setup instructions to guide users through OpenRouter signup and API key generation
- **Updated Reset Function**: Modified `resetToDefaults()` to use OpenRouter configuration

### 3. Chat Interface (`src/renderer/src/components/Chat.svelte`)

- **Welcome Message**: Updated to be generic instead of mentioning LM Studio
- **Error Messages**: Updated fallback messages to be provider-agnostic

### 4. Documentation Updates

#### README.md
- **Updated Project Description**: Changed from "LM Studio" to "OpenRouter" integration
- **New Setup Instructions**: Added OpenRouter setup section with API key instructions
- **Maintained Local LLM Support**: Kept LM Studio and Ollama instructions as alternatives
- **Updated Feature Lists**: Reflected OpenRouter as primary provider
- **Updated Architecture Section**: Changed technology stack to mention OpenRouter

#### Key Documentation Changes:
- Primary setup now focuses on OpenRouter
- Local LLM servers (LM Studio, Ollama) documented as alternatives
- Updated all feature descriptions to be provider-agnostic
- Maintained comprehensive setup instructions for both cloud and local options

## Benefits of Migration

### 1. **Easier Setup**
- No need to download and configure local LLM software
- Simple API key setup process
- Immediate access to latest models

### 2. **Better Model Access**
- Access to Claude 3.5 Sonnet, GPT-4, and other state-of-the-art models
- Regular updates to newest model versions
- Ability to switch between models easily

### 3. **Improved Reliability**
- Professional-grade infrastructure
- Built-in rate limiting and error handling
- Consistent performance

### 4. **Maintained Privacy Options**
- Local LLM servers still supported for privacy-conscious users
- Easy configuration switching between providers
- No breaking changes to existing local setups

## Configuration Options

### OpenRouter (Default)
```
Base URL: https://openrouter.ai/api/v1
API Key: sk-or-v1-... (from openrouter.ai)
Model: anthropic/claude-3.5-haiku
```

### LM Studio (Alternative)
```
Base URL: http://localhost:1234/v1
API Key: lm-studio
Model: (loaded model name)
```

### Ollama (Alternative)
```
Base URL: http://localhost:11434/v1
API Key: ollama
Model: (installed model name)
```

## Migration Guide for Existing Users

1. **Get OpenRouter API Key**:
   - Visit [openrouter.ai](https://openrouter.ai)
   - Sign up for an account
   - Generate an API key from your account settings

2. **Update Configuration**:
   - Open Flint settings
   - The configuration will already be set to OpenRouter defaults
   - Enter your API key
   - Default model: `anthropic/claude-3.5-haiku`
   - Test the connection

3. **Verify Tool Functionality**:
   - Try using MCP tools (note search, creation, etc.)
   - If tool calls fail with Claude models, try switching to a GPT-4 model
   - Check console logs for debugging information

4. **Optional: Keep Local Setup**:
   - If you prefer local LLMs, you can change the Base URL back to your local server
   - All existing local configurations continue to work
   - Note: Tool call reliability may vary with local models

## Troubleshooting

### Tool Call Errors:
- **400 Provider Error**: Try switching to `openai/gpt-4-turbo-preview` if using Claude models
- **Missing IDs**: Fixed automatically by the system
- **Format Issues**: Content is now normalized to strings

### Configuration Issues:
- **Settings Not Saving**: Check file permissions in userData directory
- **Default Values**: Delete settings file to reset to defaults
- **API Key Lost**: Re-enter in settings, it will be automatically saved

## Technical Details

- **No Breaking Changes**: Existing local LLM configurations continue to work
- **Backwards Compatibility**: All existing features and APIs remain unchanged
- **Enhanced Error Handling**: Better error messages for different provider types
- **Provider Detection**: Automatic detection of OpenRouter vs. local providers for appropriate error handling
- **Configuration Persistence**: Settings are now saved to disk and persist between app restarts
- **Tool Call Compatibility**: Fixed OpenRouter tool call format issues with proper ID generation

## Tool Call Fixes

### Issues Resolved:
1. **Missing Tool Call IDs**: OpenRouter wasn't providing proper IDs for tool calls, causing LangChain conversion errors
2. **Content Format Issues**: Some models expected string content but received arrays, causing 400 errors
3. **Empty Content**: Messages with empty content were rejected by certain providers (Amazon Bedrock)

### Solutions Implemented:
- **Automatic ID Generation**: Generate unique IDs for tool calls that don't have them
- **Content Normalization**: Ensure all message content is properly formatted as strings
- **Provider-Specific Handling**: Different handling for OpenRouter vs. local providers
- **Enhanced Debugging**: Added comprehensive logging for tool call processing

### Model Compatibility:
- **GPT-4 Models**: Best compatibility with OpenAI-style tool calls
- **Claude Models**: May route through Amazon Bedrock with stricter format requirements
- **Default**: `anthropic/claude-3.5-haiku` (fast and cost-effective)
- **Alternative**: `openai/gpt-4-turbo-preview` for maximum tool compatibility

## Configuration Persistence

### Settings Storage:
- **Location**: `{userData}/flint-settings.json`
- **Format**: JSON with nested configuration objects
- **Automatic**: Loads on startup, saves on changes
- **Fallback**: Uses defaults if file doesn't exist or is corrupted

### Persisted Settings:
- LLM configuration (API key, model, temperature, etc.)
- MCP tools enabled/disabled state
- Maximum tools limit
- All user preferences

## Future Considerations

- **Multi-Provider Support**: Could be extended to support multiple providers simultaneously
- **Provider Profiles**: Could add preset configurations for common providers
- **Cost Tracking**: Could add usage tracking for cloud providers
- **Model Marketplace**: Could integrate with OpenRouter's model discovery features
- **Tool Call Optimization**: Further improvements to tool call reliability across providers
