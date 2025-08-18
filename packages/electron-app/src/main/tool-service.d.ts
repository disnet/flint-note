import { Tool } from 'ai';
import { NoteService } from './note-service';
export declare class ToolService {
    private noteService;
    constructor(noteService: NoteService | null);
    getTools(): Record<string, Tool> | undefined;
    private createNoteTool;
    private getNoteTool;
    private getNotesTool;
    private updateNoteTool;
    private deleteNoteTool;
    private renameNoteTool;
    private moveNoteTool;
    private searchNotesTool;
    private searchNotesAdvancedTool;
    private createNoteTypeTool;
    private listNoteTypesTool;
    private getNoteTypeInfoTool;
    private updateNoteTypeTool;
    private deleteNoteTypeTool;
    private getCurrentVaultTool;
    private listVaultsTool;
    private getNoteLinksTool;
    private getBacklinksTool;
    private findBrokenLinksTool;
}
