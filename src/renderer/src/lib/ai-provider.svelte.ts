/**
 * AI Provider Factory
 *
 * Returns the right AI SDK provider based on platform:
 * - Web: createOpenRouter({ apiKey }) — direct API call with key from localStorage
 * - Electron: createOpenRouter({ baseURL: proxyUrl, apiKey: 'proxy-handled' }) — existing proxy
 *
 * On web, only OpenRouter is supported (Anthropic's API doesn't support browser CORS).
 */

import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider';
import { isWeb } from './platform.svelte';
import { secureStorageService } from '../services/secureStorageService';

/**
 * Create an OpenRouter provider configured for the current platform.
 *
 * @param proxyPort - The proxy port (required on Electron, ignored on web)
 * @returns An OpenRouter provider instance
 */
export async function createAIProvider(proxyPort?: number): Promise<OpenRouterProvider> {
  if (isWeb()) {
    // Web: call OpenRouter directly with the stored API key
    const { key } = await secureStorageService.getApiKey('openrouter');
    if (!key) {
      throw new Error('No OpenRouter API key configured. Please add one in Settings.');
    }
    return createOpenRouter({ apiKey: key });
  } else {
    // Electron: route through the local proxy
    if (!proxyPort) {
      throw new Error('Proxy port is required in Electron mode');
    }
    const proxyUrl = `http://127.0.0.1:${proxyPort}/api/chat/proxy`;
    return createOpenRouter({
      baseURL: proxyUrl,
      apiKey: 'proxy-handled' // Dummy - real key added by proxy
    });
  }
}
