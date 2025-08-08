interface SlashCommandParameter {
  id: string;
  name: string;
  type: 'text' | 'number' | 'selection';
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

  constructor() {
    this.loadCommands();
  }

  get allCommands(): SlashCommand[] {
    return this.commands;
  }

  addCommand(name: string, instruction: string, parameters?: SlashCommandParameter[]): SlashCommand {
    const command: SlashCommand = {
      id: crypto.randomUUID(),
      name: name.trim(),
      instruction: instruction.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
      parameters: parameters || []
    };

    this.commands.push(command);
    this.saveCommands();
    return command;
  }

  updateCommand(id: string, name: string, instruction: string, parameters?: SlashCommandParameter[]): SlashCommand | null {
    const commandIndex = this.commands.findIndex((cmd) => cmd.id === id);
    if (commandIndex === -1) return null;

    this.commands[commandIndex] = {
      ...this.commands[commandIndex],
      name: name.trim(),
      instruction: instruction.trim(),
      updatedAt: new Date(),
      parameters: parameters !== undefined ? parameters : this.commands[commandIndex].parameters
    };

    this.saveCommands();
    return this.commands[commandIndex];
  }

  deleteCommand(id: string): boolean {
    const originalLength = this.commands.length;
    this.commands = this.commands.filter((cmd) => cmd.id !== id);

    if (this.commands.length < originalLength) {
      this.saveCommands();
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

  expandCommandWithParameters(command: SlashCommand, parameterValues: Record<string, string>): string {
    let expandedText = command.instruction;
    
    if (command.parameters) {
      for (const parameter of command.parameters) {
        const value = parameterValues[parameter.name] || parameter.defaultValue || '';
        const placeholder = `{${parameter.name}}`;
        expandedText = expandedText.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
      }
    }
    
    return expandedText;
  }

  private loadCommands(): void {
    try {
      const stored = localStorage.getItem('flint-slash-commands');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.commands = parsed.map(
          (cmd: SlashCommand & { createdAt: string; updatedAt: string }) => ({
            ...cmd,
            createdAt: new Date(cmd.createdAt),
            updatedAt: new Date(cmd.updatedAt),
            parameters: cmd.parameters || []
          })
        );
      }
    } catch (error) {
      console.error('Failed to load slash commands:', error);
      this.commands = [];
    }
  }

  private saveCommands(): void {
    try {
      localStorage.setItem('flint-slash-commands', JSON.stringify(this.commands));
    } catch (error) {
      console.error('Failed to save slash commands:', error);
    }
  }
}

export const slashCommandsStore = new SlashCommandsStore();
export type { SlashCommand, SlashCommandParameter };
