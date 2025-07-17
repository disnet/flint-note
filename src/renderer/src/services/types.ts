export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

export interface ChatService {
  sendMessage(text: string): Promise<string>;
}
