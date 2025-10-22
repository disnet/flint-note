/**
 * Agent Input Store
 *
 * Manages active agent input requests and their state.
 * Coordinates between message stream parsing and UI modal display.
 */

import type {
  AgentInputConfig,
  AgentInputResponse,
  ActiveInputRequest
} from '../types/agent-input';
import { MessageStreamParser } from '../utils/message-stream-parser.svelte';

/**
 * Store for managing agent input requests
 */
class AgentInputStore {
  /** Map of active input requests by ID */
  private requests = $state<Map<string, ActiveInputRequest>>(new Map());

  /** Message stream parser instance */
  private parser = new MessageStreamParser();

  /** Currently displayed modal config (only one modal at a time) */
  currentModal = $state<ActiveInputRequest | null>(null);

  /**
   * Parse a chunk from the message stream
   *
   * @param chunk - Text chunk from agent response
   * @returns Visible text with input-request tags removed
   */
  parseStreamChunk(chunk: string): string {
    const result = this.parser.parseChunk(chunk);

    // Handle any detected input requests
    for (const request of result.inputRequests) {
      this.addRequest(request.config);
    }

    // Log any parsing errors
    for (const error of result.errors) {
      console.error('[AgentInputStore] Parse error:', error);
    }

    return result.visibleText;
  }

  /**
   * Add a new input request
   *
   * @param config - Input configuration
   */
  addRequest(config: AgentInputConfig): void {
    const activeRequest: ActiveInputRequest = {
      id: config.id,
      config,
      state: 'pending',
      timestamp: Date.now()
    };

    this.requests.set(config.id, activeRequest);

    // Show modal for the first request (only one modal at a time)
    if (!this.currentModal) {
      this.currentModal = activeRequest;
    }

    console.log('[AgentInputStore] Input request added:', config.id, config.inputType);
  }

  /**
   * Handle user response to an input request
   *
   * @param response - User's response
   */
  handleResponse(response: AgentInputResponse): void {
    const request = this.requests.get(response.requestId);
    if (!request) {
      console.warn('[AgentInputStore] Response for unknown request:', response.requestId);
      return;
    }

    // Update request state
    request.state = response.canceled ? 'canceled' : 'completed';

    // Close modal
    this.currentModal = null;

    console.log('[AgentInputStore] Input response received:', {
      requestId: response.requestId,
      canceled: response.canceled,
      value: response.value
    });

    // Check if there are more pending requests to show
    this.showNextPendingRequest();
  }

  /**
   * Handle modal cancellation
   *
   * @param requestId - ID of the request being canceled
   */
  handleCancel(requestId: string): void {
    const request = this.requests.get(requestId);
    if (!request) {
      return;
    }

    request.state = 'canceled';
    this.currentModal = null;

    console.log('[AgentInputStore] Input request canceled:', requestId);

    // Check if there are more pending requests to show
    this.showNextPendingRequest();
  }

  /**
   * Show the next pending request if available
   */
  private showNextPendingRequest(): void {
    for (const request of this.requests.values()) {
      if (request.state === 'pending') {
        this.currentModal = request;
        return;
      }
    }
  }

  /**
   * Reset the parser state for a new message stream
   * Call this when starting to parse a new agent response
   */
  resetParser(): void {
    this.parser.reset();
  }

  /**
   * Clear all requests (e.g., when starting a new conversation)
   */
  clearAll(): void {
    this.requests.clear();
    this.currentModal = null;
    this.parser.reset();
  }

  /**
   * Get all active requests
   */
  getActiveRequests(): ActiveInputRequest[] {
    return Array.from(this.requests.values());
  }

  /**
   * Get request by ID
   */
  getRequest(id: string): ActiveInputRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * Check if there are any pending requests
   */
  hasPendingRequests(): boolean {
    for (const request of this.requests.values()) {
      if (request.state === 'pending') {
        return true;
      }
    }
    return false;
  }
}

// Export singleton instance
export const agentInputStore = new AgentInputStore();
