export interface Message {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    noteReferences?: NoteReference[];
    error?: boolean;
  };
}

export interface NoteReference {
  id: string;
  title: string;
  type?: string;
  path?: string;
}

export interface ChatState {
  messages: Message[];
  isTyping: boolean;
  currentVault?: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  category: 'note' | 'vault' | 'prompt' | 'system';
  handler: (args: string[]) => Promise<void>;
}
