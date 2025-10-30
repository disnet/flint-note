/**
 * Message Stream Parser for Agent Input Requests
 *
 * Parses agent message streams to detect and extract <input-request> tags
 * containing structured input configurations. Uses Svelte 5 runes for reactive state.
 */

import type { AgentInputConfig, ParsedInputRequest } from '../types/agent-input';

/**
 * Maximum size of JSON content to prevent memory issues (10KB)
 */
const MAX_JSON_SIZE = 10 * 1024;

/**
 * Maximum number of input requests per message to prevent spam
 */
const MAX_REQUESTS_PER_MESSAGE = 10;

/**
 * Regex pattern to match <input-request> tags with content
 * Captures: id attribute and JSON content
 */
const INPUT_REQUEST_PATTERN = /<input-request\s+id="([^"]+)">([\s\S]*?)<\/input-request>/g;

/**
 * Regex pattern to validate request IDs (alphanumeric, hyphens, underscores only)
 */
const VALID_REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Result of parsing a chunk of message stream
 */
export interface ParseResult {
  /** Visible text with input-request tags removed */
  visibleText: string;
  /** Detected input requests */
  inputRequests: ParsedInputRequest[];
  /** Any parsing errors encountered */
  errors: string[];
}

/**
 * Message Stream Parser
 *
 * Handles detection and extraction of <input-request> tags from agent message streams.
 * Supports incremental parsing for streaming scenarios and validates input configurations.
 */
export class MessageStreamParser {
  /** Buffer for accumulating partial tags across stream chunks */
  private buffer = $state('');

  /** Count of requests detected in current message */
  private requestCount = $state(0);

  /**
   * Parse a chunk of message stream
   *
   * @param chunk - New text chunk from stream
   * @returns Parse result with visible text and detected input requests
   */
  parseChunk(chunk: string): ParseResult {
    // Append chunk to buffer for handling split tags
    this.buffer += chunk;

    const inputRequests: ParsedInputRequest[] = [];
    const errors: string[] = [];
    let visibleText = this.buffer;

    // Find all input-request tags
    const matches = Array.from(this.buffer.matchAll(INPUT_REQUEST_PATTERN));

    for (const match of matches) {
      // Check limit
      if (this.requestCount >= MAX_REQUESTS_PER_MESSAGE) {
        errors.push(`Maximum ${MAX_REQUESTS_PER_MESSAGE} input requests per message exceeded`);
        break;
      }

      const [fullMatch, requestId, jsonContent] = match;

      try {
        // Validate request ID format
        if (!VALID_REQUEST_ID_PATTERN.test(requestId)) {
          errors.push(`Invalid request ID format: "${requestId}". Use alphanumeric, hyphens, and underscores only.`);
          continue;
        }

        // Check JSON size
        if (jsonContent.length > MAX_JSON_SIZE) {
          errors.push(`Input request JSON exceeds maximum size of ${MAX_JSON_SIZE} bytes`);
          continue;
        }

        // Parse JSON content
        const config = JSON.parse(jsonContent.trim()) as AgentInputConfig;

        // Set the id from the tag attribute
        config.id = requestId;

        // Validate required fields
        if (!config.inputType) {
          errors.push(`Input request "${requestId}" missing required field: inputType`);
          continue;
        }

        if (!config.prompt) {
          errors.push(`Input request "${requestId}" missing required field: prompt`);
          continue;
        }

        // Validate options for types that require them
        if (['select', 'multiselect', 'slider'].includes(config.inputType)) {
          if (!config.options || config.options.length === 0) {
            errors.push(`Input request "${requestId}" of type "${config.inputType}" requires options array`);
            continue;
          }
        }

        // Add to results
        inputRequests.push({
          id: requestId,
          config,
          rawMatch: fullMatch
        });

        // Remove tag from visible text
        visibleText = visibleText.replace(fullMatch, '');

        this.requestCount++;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to parse input request "${requestId}": ${errorMessage}`);
        console.error('Input request parsing error:', error);
      }
    }

    // Update buffer to remove processed complete tags
    this.buffer = visibleText;

    return {
      visibleText: visibleText.trim(),
      inputRequests,
      errors
    };
  }

  /**
   * Check if buffer contains a potentially incomplete tag
   * Useful for detecting when to wait for more data in streaming scenarios
   */
  hasIncompleteTag(): boolean {
    const openTagIndex = this.buffer.lastIndexOf('<input-request');
    if (openTagIndex === -1) {
      return false;
    }

    // Check if there's a closing tag after the last opening tag
    const closeTagIndex = this.buffer.indexOf('</input-request>', openTagIndex);
    return closeTagIndex === -1;
  }

  /**
   * Reset the parser state for a new message
   * Call this when starting to parse a new message stream
   */
  reset(): void {
    this.buffer = '';
    this.requestCount = 0;
  }

  /**
   * Get the current buffer content
   * Useful for debugging
   */
  getBuffer(): string {
    return this.buffer;
  }
}

/**
 * Format an input response message to send back to the agent
 *
 * @param requestId - ID of the input request being responded to
 * @param value - The user's input value
 * @param canceled - Whether the user canceled the input
 * @returns Formatted response message
 */
export function formatInputResponse(
  requestId: string,
  value: unknown,
  canceled: boolean
): string {
  if (canceled) {
    return `<input-response id="${requestId}">CANCELED</input-response>`;
  }

  // Format value based on type
  let formattedValue: string;

  if (typeof value === 'string') {
    formattedValue = value;
  } else if (typeof value === 'boolean' || typeof value === 'number') {
    formattedValue = String(value);
  } else if (Array.isArray(value)) {
    formattedValue = JSON.stringify(value);
  } else if (value === null || value === undefined) {
    formattedValue = 'null';
  } else {
    formattedValue = JSON.stringify(value);
  }

  return `<input-response id="${requestId}">${formattedValue}</input-response>`;
}

/**
 * Validate an input value against validation rules
 *
 * @param value - Value to validate
 * @param config - Input configuration with validation rules
 * @returns Validation error message, or null if valid
 */
export function validateInput(value: unknown, config: AgentInputConfig): string | null {
  const validation = config.validation;
  if (!validation) {
    return null;
  }

  // Required check
  if (validation.required) {
    if (value === null || value === undefined || value === '') {
      return 'This field is required';
    }
    if (Array.isArray(value) && value.length === 0) {
      return 'At least one selection is required';
    }
  }

  // String validations
  if (typeof value === 'string') {
    if (validation.minLength && value.length < validation.minLength) {
      return `Minimum length is ${validation.minLength} characters`;
    }
    if (validation.maxLength && value.length > validation.maxLength) {
      return `Maximum length is ${validation.maxLength} characters`;
    }
    if (validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return config.helpText || 'Input does not match required format';
      }
    }
  }

  // Number validations
  if (typeof value === 'number') {
    if (validation.min !== undefined && value < validation.min) {
      return `Minimum value is ${validation.min}`;
    }
    if (validation.max !== undefined && value > validation.max) {
      return `Maximum value is ${validation.max}`;
    }
  }

  // Array validations (for multiselect)
  if (Array.isArray(value)) {
    if (validation.min !== undefined && value.length < validation.min) {
      return `Select at least ${validation.min} option${validation.min > 1 ? 's' : ''}`;
    }
    if (validation.max !== undefined && value.length > validation.max) {
      return `Select at most ${validation.max} option${validation.max > 1 ? 's' : ''}`;
    }
  }

  return null;
}
