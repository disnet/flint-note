import { ElectronChatService } from './electronChatService';
// Default to Electron service, but this can be easily swapped out
let chatService = new ElectronChatService();
export function setChatService(service) {
    chatService = service;
}
export function getChatService() {
    return chatService;
}
