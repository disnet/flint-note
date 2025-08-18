import type { ModelInfo } from '../config/models';
export declare function getSelectedModel(): string;
export declare function getCurrentModelInfo(): ModelInfo;
export declare function setSelectedModel(modelId: string): void;
export declare const modelStore: {
    readonly selectedModel: string;
    readonly currentModelInfo: ModelInfo;
    setSelectedModel: typeof setSelectedModel;
};
