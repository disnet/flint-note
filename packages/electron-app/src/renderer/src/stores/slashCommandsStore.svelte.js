class SlashCommandsStore {
    commands = $state([]);
    constructor() {
        this.loadCommands();
    }
    get allCommands() {
        return this.commands;
    }
    addCommand(name, instruction, parameters) {
        const command = {
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
    updateCommand(id, name, instruction, parameters) {
        const commandIndex = this.commands.findIndex((cmd) => cmd.id === id);
        if (commandIndex === -1)
            return null;
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
    deleteCommand(id) {
        const originalLength = this.commands.length;
        this.commands = this.commands.filter((cmd) => cmd.id !== id);
        if (this.commands.length < originalLength) {
            this.saveCommands();
            return true;
        }
        return false;
    }
    getCommand(id) {
        return this.commands.find((cmd) => cmd.id === id) || null;
    }
    findCommandByName(name) {
        return (this.commands.find((cmd) => cmd.name.toLowerCase() === name.toLowerCase()) || null);
    }
    searchCommands(query) {
        const lowerQuery = query.toLowerCase();
        return this.commands.filter((cmd) => cmd.name.toLowerCase().includes(lowerQuery) ||
            cmd.instruction.toLowerCase().includes(lowerQuery));
    }
    expandCommandWithParameters(command, parameterValues) {
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
    loadCommands() {
        try {
            const stored = localStorage.getItem('flint-slash-commands');
            if (stored) {
                const parsed = JSON.parse(stored);
                this.commands = parsed.map((cmd) => ({
                    ...cmd,
                    createdAt: new Date(cmd.createdAt),
                    updatedAt: new Date(cmd.updatedAt),
                    parameters: cmd.parameters || []
                }));
            }
        }
        catch (error) {
            console.error('Failed to load slash commands:', error);
            this.commands = [];
        }
    }
    saveCommands() {
        try {
            localStorage.setItem('flint-slash-commands', JSON.stringify(this.commands));
        }
        catch (error) {
            console.error('Failed to save slash commands:', error);
        }
    }
}
export const slashCommandsStore = new SlashCommandsStore();
