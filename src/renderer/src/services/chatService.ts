import { ElectronChatService } from './electronChatService';
import type { ChatService } from './types';

// Default to Electron service, but this can be easily swapped out
let chatService: ChatService = new ElectronChatService();

export function setChatService(service: ChatService): void {
  chatService = service;
}

export function getChatService(): ChatService {
  return chatService;
}
