import { ElectronChatService } from './electronChatService';
import type { ChatService, NoteService } from './types';

// Default to Electron service, but this can be easily swapped out
let chatService: ChatService & NoteService = new ElectronChatService();

export function setChatService(service: ChatService & NoteService): void {
  chatService = service;
}

export function getChatService(): ChatService & NoteService {
  return chatService;
}
