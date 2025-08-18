export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    icon: string;
    contextLength?: number;
    costPerMTokens?: {
        input: number;
        output: number;
        cached?: number;
    };
}
export declare const SUPPORTED_MODELS: ModelInfo[];
export declare const DEFAULT_MODEL = "openai/gpt-5";
export declare function getModelById(id: string): ModelInfo | undefined;
export declare function getModelsByProvider(): Record<string, ModelInfo[]>;
