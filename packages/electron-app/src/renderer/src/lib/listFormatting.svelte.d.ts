import { ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
declare const listFormattingPlugin: ViewPlugin<{
    decorations: DecorationSet;
    update(update: ViewUpdate): void;
}, undefined>;
declare const listFormattingTheme: import("@codemirror/state").Extension;
export declare function listFormattingExtension(): (typeof listFormattingPlugin | typeof listFormattingTheme)[];
export {};
