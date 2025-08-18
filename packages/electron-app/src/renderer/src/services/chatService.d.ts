import type { ChatService, NoteService } from './types';
export declare function setChatService(service: ChatService & NoteService): void;
export declare function getChatService(): ChatService & NoteService;
