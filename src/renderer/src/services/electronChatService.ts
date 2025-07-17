import type { ChatService } from './types';

export class ElectronChatService implements ChatService {
  async sendMessage(text: string): Promise<string> {
    try {
      return await window.api.sendMessage(text);
    } catch (error) {
      console.error('Failed to send message via Electron API:', error);
      throw new Error('Failed to send message. Please try again.');
    }
  }
}
