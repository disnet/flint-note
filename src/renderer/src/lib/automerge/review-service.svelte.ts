/**
 * Review Service for AI-powered review prompts and feedback
 *
 * Uses the same pattern as chat-service.svelte.ts with streamText()
 * for generating review challenges and analyzing user responses.
 */

import { streamText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

/**
 * Check if we're in screenshot mode (for mock responses)
 */
function isScreenshotMode(): boolean {
  return document.documentElement.hasAttribute('data-screenshot-mode');
}

/**
 * Mock review data for screenshot mode
 * Maps note title patterns to mock prompts and feedback
 */
interface MockReviewData {
  titlePattern: RegExp;
  prompts: string[];
  feedbackPatterns: Array<{
    responsePattern: RegExp;
    feedback: string;
  }>;
  defaultFeedback: string;
}

const MOCK_REVIEW_DATA: MockReviewData[] = [
  {
    titlePattern: /art of doing science|hamming/i,
    prompts: [
      `Explain the relationship between Hamming's concept of the "prepared mind" and the tolerance for ambiguity he describes. How do these two ideas work together in the creative process?`
    ],
    feedbackPatterns: [
      {
        responsePattern: /prepared|mind|intuition|luck|favor/i,
        feedback: `Good connection to the expertise-intuition link. You're right that the "prepared mind" isn't passive waiting - it's the result of years of focused engagement. This ties to Kahneman's System 1: expertise trains our fast thinking to recognize patterns others miss. The tolerance for ambiguity Hamming describes is what allows this preparation to happen - staying with uncertainty long enough for insights to emerge.`
      }
    ],
    defaultFeedback: `You're engaging with Hamming's core ideas about doing important work. Consider pushing deeper on the connection between his "important problems" framework and the practical methods he suggests - the Friday afternoons, the tolerance for ambiguity, the prepared mind. These aren't separate concepts; they're parts of a coherent approach to meaningful creative work.`
  },
  {
    titlePattern: /flow state|flow/i,
    prompts: [
      `What conditions does Csikszentmihalyi identify as necessary for entering a flow state? How do these relate to the challenge-skill balance, and what happens when that balance is disrupted?`,
      `Explain how the concept of "autotelic experience" connects to intrinsic motivation in flow states. Why might external rewards actually interfere with achieving flow?`
    ],
    feedbackPatterns: [
      {
        responsePattern: /challenge|skill|balance|match/i,
        feedback: `You've identified the critical balance point correctly. When challenge exceeds skill, we get anxiety; when skill exceeds challenge, boredom. The flow channel is narrow but learnable - we can deliberately tune task difficulty or develop skills to stay in it. This connects to Hamming's idea of working on important problems: the best problems keep us at the edge of our capabilities.`
      }
    ],
    defaultFeedback: `Good start on understanding flow mechanics. Consider how the conditions you've described relate to practical applications - how might you engineer your environment or tasks to make flow more likely?`
  },
  {
    titlePattern: /creativity|creative|science of creativity/i,
    prompts: [
      `Your notes suggest creativity emerges from constraints rather than complete freedom. What evidence supports this counterintuitive claim, and what types of constraints seem most generative?`,
      `How do the concepts of divergent and convergent thinking work together in the creative process? When should each mode dominate?`
    ],
    feedbackPatterns: [
      {
        responsePattern: /constraint|limit|focus|bound/i,
        feedback: `You've captured the paradox well - constraints liberate by eliminating options and focusing energy. The key insight is that not all constraints are equal: generative constraints channel creativity without prescribing outcomes. This explains why rigid formulas fail while open-ended limitations (like a sonnet's structure or a budget limit) can inspire breakthrough work.`
      }
    ],
    defaultFeedback: `You're exploring the relationship between structure and creativity thoughtfully. Consider how this applies to your own creative practice - what constraints have you found most productive?`
  }
];

/**
 * Get a mock prompt for a note title
 */
function getMockPrompt(noteTitle: string): string {
  for (const data of MOCK_REVIEW_DATA) {
    if (data.titlePattern.test(noteTitle)) {
      // Return a random prompt from the list
      const index = Math.floor(Math.random() * data.prompts.length);
      return data.prompts[index];
    }
  }
  // Default generic prompt
  return `What are the key insights from this note that you want to remember? How do they connect to other ideas you've been thinking about?`;
}

/**
 * Get mock feedback for a note title and user response
 */
function getMockFeedback(noteTitle: string, userResponse: string): string {
  for (const data of MOCK_REVIEW_DATA) {
    if (data.titlePattern.test(noteTitle)) {
      // Check response patterns
      for (const pattern of data.feedbackPatterns) {
        if (pattern.responsePattern.test(userResponse)) {
          return pattern.feedback;
        }
      }
      return data.defaultFeedback;
    }
  }
  // Default generic feedback
  return `Good reflection on this material. Consider how these ideas might apply to a current project or challenge you're working on. Making concrete connections helps solidify understanding.`;
}

/**
 * Simulate streaming text by calling the callback with progressively longer text
 */
async function simulateStreaming(
  text: string,
  onTextUpdate?: (text: string) => void
): Promise<string> {
  if (!onTextUpdate) return text;

  const charsPerChunk = 15;
  const delayPerChunk = 8; // ms

  for (let i = 0; i < text.length; i += charsPerChunk) {
    const chunk = text.slice(0, i + charsPerChunk);
    onTextUpdate(chunk);
    await new Promise((resolve) => setTimeout(resolve, delayPerChunk));
  }
  onTextUpdate(text);
  return text;
}

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
    // Screenshot mode: use mock responses instead of real API calls
    if (isScreenshotMode()) {
      this._status = 'generating';
      const mockPrompt = getMockPrompt(noteTitle);
      const result = await simulateStreaming(mockPrompt, onTextUpdate);
      this._status = 'ready';
      return result;
    }

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
    // Screenshot mode: use mock responses instead of real API calls
    if (isScreenshotMode()) {
      this._status = 'generating';
      const mockFeedback = getMockFeedback(noteTitle, userResponse);
      const result = await simulateStreaming(mockFeedback, onTextUpdate);
      this._status = 'ready';
      return result;
    }

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
