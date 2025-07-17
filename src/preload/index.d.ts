import { ElectronAPI } from '@electron-toolkit/preload';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      sendMessage: (message: string) => Promise<string>;
      clearConversation: () => Promise<{ success: boolean; error?: string }>;
    };
  }
}
