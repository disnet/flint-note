export type NoteMetadata = {
    id: string;
    type: string;
    filename: string;
    title: string;
    created: string;
    modified: string;
    size: number;
    tags: string[];
    path: string;
    snippet?: string;
};
export type NoteType = {
    name: string;
    count: number;
};
export declare const notesStore: {
    readonly notes: NoteMetadata[];
    readonly noteTypes: NoteType[];
    readonly loading: boolean;
    readonly error: string | null;
    readonly groupedNotes: Record<string, NoteMetadata[]>;
    refresh: () => Promise<void>;
    handleToolCall: (toolCall: {
        name: string;
    }) => void;
};
