export type ToolCallData = {
    toolCallId: string;
    name: string;
    arguments: unknown;
    result: string | undefined;
    error: string | undefined;
};
