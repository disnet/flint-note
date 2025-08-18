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
declare class SlashCommandsStore {
    private commands;
    constructor();
    get allCommands(): SlashCommand[];
    addCommand(name: string, instruction: string, parameters?: SlashCommandParameter[]): SlashCommand;
    updateCommand(id: string, name: string, instruction: string, parameters?: SlashCommandParameter[]): SlashCommand | null;
    deleteCommand(id: string): boolean;
    getCommand(id: string): SlashCommand | null;
    findCommandByName(name: string): SlashCommand | null;
    searchCommands(query: string): SlashCommand[];
    expandCommandWithParameters(command: SlashCommand, parameterValues: Record<string, string>): string;
    private loadCommands;
    private saveCommands;
}
export declare const slashCommandsStore: SlashCommandsStore;
export type { SlashCommand, SlashCommandParameter };
