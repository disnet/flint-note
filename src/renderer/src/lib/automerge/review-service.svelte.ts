/**
 * Review Service for AI-powered review prompts and feedback
 *
 * Uses the same pattern as chat-service.svelte.ts with streamText()
 * for generating review challenges and analyzing user responses.
 */

import { streamText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

const PROMPT_GENERATION_SYSTEM = `You are a learning coach helping users deeply engage with their notes through active review. Your role is to create review challenges that encourage explanation, connection-making, and application of concepts.

When generating a review challenge:
1. Read the note content carefully
2. Create 1-2 focused questions that require the user to think actively about the material
3. Prefer questions that ask them to:
   - Explain concepts in their own words
   - Make connections to other ideas or experiences
   - Apply the concept to a new situation
   - Identify the key insight or takeaway
4. Avoid simple recall questions - focus on understanding and synthesis
5. Keep the challenge concise but thought-provoking

Format your response as a direct challenge to the user. Don't include preamble like "Here's a challenge for you:". Just ask the question(s) directly.`;

const RESPONSE_ANALYSIS_SYSTEM = `You are a learning coach providing feedback on a user's review response. Your role is to encourage deeper engagement and help them solidify their understanding.

When analyzing their response:
1. Acknowledge what they got right and what shows good understanding
2. Gently point out any gaps or areas for deeper exploration
3. Suggest connections they might make to other concepts
4. Keep feedback encouraging and constructive
5. Be concise - aim for 2-3 sentences of feedback

Don't be overly effusive or use excessive praise. Be genuine and helpful. Focus on the substance of their response.

If their response is very brief or off-topic, gently encourage more engagement without being critical.`;

export type ReviewServiceStatus = 'ready' | 'generating' | 'error';

/**
 * Review Service class that handles AI-powered review prompts and feedback
 */
export class ReviewService {
  private proxyUrl: string;
  private _status = $state<ReviewServiceStatus>('ready');
  private _error = $state<Error | null>(null);
  private abortController: AbortController | null = null;

  constructor(proxyPort: number) {
    this.proxyUrl = `http://127.0.0.1:${proxyPort}/api/chat/proxy`;
  }

  /**
   * Get current status (reactive)
   */
  get status(): ReviewServiceStatus {
    return this._status;
  }

  /**
   * Get current error (reactive)
   */
  get error(): Error | null {
    return this._error;
  }

  /**
   * Check if currently generating
   */
  get isLoading(): boolean {
    return this._status === 'generating';
  }

  /**
   * Cancel any ongoing generation
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this._status = 'ready';
  }

  /**
   * Generate a review challenge prompt for a note
   * @param noteTitle The title of the note
   * @param noteContent The content of the note
   * @param onTextUpdate Optional callback for streaming text updates
   */
  async generatePrompt(
    noteTitle: string,
    noteContent: string,
    onTextUpdate?: (text: string) => void
  ): Promise<string> {
    this._status = 'generating';
    this._error = null;
    this.abortController = new AbortController();

    try {
      // Create OpenRouter provider pointing to our proxy
      // The proxy will add the real API key
      const openrouter = createOpenRouter({
        baseURL: this.proxyUrl,
        apiKey: 'proxy-handled' // Dummy - real key added by proxy
      });

      const result = streamText({
        model: openrouter(DEFAULT_MODEL),
        system: PROMPT_GENERATION_SYSTEM,
        prompt: `Note Title: ${noteTitle}\n\nNote Content:\n${noteContent}\n\nGenerate a review challenge for this note:`,
        abortSignal: this.abortController.signal
      });

      let fullText = '';

      // Process the stream
      for await (const chunk of result.textStream) {
        fullText += chunk;
        if (onTextUpdate) {
          onTextUpdate(fullText);
        }
      }

      this._status = 'ready';
      return fullText.trim();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this._status = 'ready';
        throw error;
      }

      this._error = error instanceof Error ? error : new Error('Unknown error');
      this._status = 'error';
      throw this._error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Analyze a user's response and provide feedback
   * @param noteTitle The title of the note
   * @param noteContent The content of the note
   * @param challengePrompt The challenge that was given
   * @param userResponse The user's response to analyze
   * @param onTextUpdate Optional callback for streaming text updates
   */
  async analyzeResponse(
    noteTitle: string,
    noteContent: string,
    challengePrompt: string,
    userResponse: string,
    onTextUpdate?: (text: string) => void
  ): Promise<string> {
    this._status = 'generating';
    this._error = null;
    this.abortController = new AbortController();

    try {
      // Create OpenRouter provider pointing to our proxy
      // The proxy will add the real API key
      const openrouter = createOpenRouter({
        baseURL: this.proxyUrl,
        apiKey: 'proxy-handled' // Dummy - real key added by proxy
      });

      const result = streamText({
        model: openrouter(DEFAULT_MODEL),
        system: RESPONSE_ANALYSIS_SYSTEM,
        prompt: `Note Title: ${noteTitle}

Note Content:
${noteContent}

Challenge Given:
${challengePrompt}

User's Response:
${userResponse}

Provide brief, constructive feedback:`,
        abortSignal: this.abortController.signal
      });

      let fullText = '';

      // Process the stream
      for await (const chunk of result.textStream) {
        fullText += chunk;
        if (onTextUpdate) {
          onTextUpdate(fullText);
        }
      }

      this._status = 'ready';
      return fullText.trim();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this._status = 'ready';
        throw error;
      }

      this._error = error instanceof Error ? error : new Error('Unknown error');
      this._status = 'error';
      throw this._error;
    } finally {
      this.abortController = null;
    }
  }
}

// Singleton instance (created on first use)
let reviewServiceInstance: ReviewService | null = null;

/**
 * Get or create the review service singleton
 * @param proxyPort The port number for the API proxy
 */
export function getReviewService(proxyPort: number): ReviewService {
  if (!reviewServiceInstance) {
    reviewServiceInstance = new ReviewService(proxyPort);
  }
  return reviewServiceInstance;
}

/**
 * Reset the review service singleton (for testing)
 */
export function resetReviewService(): void {
  if (reviewServiceInstance) {
    reviewServiceInstance.cancel();
    reviewServiceInstance = null;
  }
}
