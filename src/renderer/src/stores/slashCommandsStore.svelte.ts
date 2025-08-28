interface SlashCommandParameter {
  id: string;
  name: string;
  type: 'text' | 'number' | 'selection' | 'textblock';
  required: boolean;
  defaultValue?: string;
  description?: string;
}

interface SlashCommand {
  id: string;
  name: string;
  instruction: string;
  createdAt: Date;
  updatedAt: Date;
  parameters?: SlashCommandParameter[];
}

class SlashCommandsStore {
  private commands = $state<SlashCommand[]>([]);
  private isLoading = $state(true);
  private isInitialized = $state(false);
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    this.isLoading = true;
    try {
      await this.loadCommands();
    } catch (error) {
      console.warn('Slash commands initialization failed:', error);
      this.commands = [];
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  get loading(): boolean {
    return this.isLoading;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  get allCommands(): SlashCommand[] {
    return this.commands;
  }

  async addCommand(
    name: string,
    instruction: string,
    parameters?: SlashCommandParameter[]
  ): Promise<SlashCommand> {
    await this.ensureInitialized();

    const command: SlashCommand = {
      id: crypto.randomUUID(),
      name: name.trim(),
      instruction: instruction.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
      parameters: parameters || []
    };

    this.commands.push(command);
    await this.saveCommands();
    return command;
  }

  async updateCommand(
    id: string,
    name: string,
    instruction: string,
    parameters?: SlashCommandParameter[]
  ): Promise<SlashCommand | null> {
    await this.ensureInitialized();

    const commandIndex = this.commands.findIndex((cmd) => cmd.id === id);
    if (commandIndex === -1) return null;

    this.commands[commandIndex] = {
      ...this.commands[commandIndex],
      name: name.trim(),
      instruction: instruction.trim(),
      updatedAt: new Date(),
      parameters:
        parameters !== undefined ? parameters : this.commands[commandIndex].parameters
    };

    await this.saveCommands();
    return this.commands[commandIndex];
  }

  async deleteCommand(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const originalLength = this.commands.length;
    this.commands = this.commands.filter((cmd) => cmd.id !== id);

    if (this.commands.length < originalLength) {
      await this.saveCommands();
      return true;
    }
    return false;
  }

  getCommand(id: string): SlashCommand | null {
    return this.commands.find((cmd) => cmd.id === id) || null;
  }

  findCommandByName(name: string): SlashCommand | null {
    return (
      this.commands.find((cmd) => cmd.name.toLowerCase() === name.toLowerCase()) || null
    );
  }

  searchCommands(query: string): SlashCommand[] {
    const lowerQuery = query.toLowerCase();
    return this.commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(lowerQuery) ||
        cmd.instruction.toLowerCase().includes(lowerQuery)
    );
  }

  expandCommandWithParameters(
    command: SlashCommand,
    parameterValues: Record<string, string>
  ): string {
    let expandedText = command.instruction;

    if (command.parameters) {
      for (const parameter of command.parameters) {
        const value = parameterValues[parameter.name] || parameter.defaultValue || '';
        const placeholder = `{${parameter.name}}`;
        expandedText = expandedText.replace(
          new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
          value
        );
      }
    }

    return expandedText;
  }

  private async loadCommands(): Promise<void> {
    try {
      const stored = await window.api?.loadSlashCommands();
      if (stored && Array.isArray(stored)) {
        this.commands = stored.map(
          (cmd: SlashCommand & { createdAt: string; updatedAt: string }) => ({
            ...cmd,
            createdAt: new Date(cmd.createdAt),
            updatedAt: new Date(cmd.updatedAt),
            parameters: cmd.parameters || []
          })
        );
      } else {
        this.commands = [];
      }
    } catch (error) {
      console.error('Failed to load slash commands:', error);
      this.commands = [];
    }
  }

  private async saveCommands(): Promise<void> {
    try {
      // Use $state.snapshot to get a serializable copy
      const serializableCommands = $state.snapshot(this.commands);
      await window.api?.saveSlashCommands(serializableCommands);
    } catch (error) {
      console.error('Failed to save slash commands:', error);
    }
  }
}

export const slashCommandsStore = new SlashCommandsStore();
export type { SlashCommand, SlashCommandParameter };
