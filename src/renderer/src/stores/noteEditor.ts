import type { NoteReference } from '../types/chat';

interface NoteEditorState {
  isOpen: boolean;
  activeNote: NoteReference | null;
  content: string;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;
}

function createNoteEditorStore(): {
  readonly isOpen: boolean;
  readonly activeNote: NoteReference | null;
  readonly content: string;
  readonly isLoading: boolean;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly hasUnsavedChanges: boolean;
  openNote: (note: NoteReference) => void;
  closeNote: () => void;
  setContent: (content: string) => void;
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  markSaved: () => void;
  getState: () => NoteEditorState;
} {
  const state = $state<NoteEditorState>({
    isOpen: false,
    activeNote: null,
    content: '',
    isLoading: false,
    isSaving: false,
    error: null,
    hasUnsavedChanges: false
  });

  return {
    get isOpen() {
      return state.isOpen;
    },

    get activeNote() {
      return state.activeNote;
    },

    get content() {
      return state.content;
    },

    get isLoading() {
      return state.isLoading;
    },

    get isSaving() {
      return state.isSaving;
    },

    get error() {
      return state.error;
    },

    get hasUnsavedChanges() {
      return state.hasUnsavedChanges;
    },

    openNote(note: NoteReference) {
      state.activeNote = note;
      state.isOpen = true;
      state.content = '';
      state.error = null;
      state.hasUnsavedChanges = false;
    },

    closeNote() {
      state.isOpen = false;
      state.activeNote = null;
      state.content = '';
      state.error = null;
      state.hasUnsavedChanges = false;
    },

    setContent(content: string) {
      state.content = content;
      state.hasUnsavedChanges = true;
    },

    setLoading(loading: boolean) {
      state.isLoading = loading;
    },

    setSaving(saving: boolean) {
      state.isSaving = saving;
    },

    setError(error: string | null) {
      state.error = error;
    },

    markSaved() {
      state.hasUnsavedChanges = false;
    },

    // Method to get the current state (useful for reactive subscriptions)
    getState() {
      return state;
    }
  };
}

export const noteEditorStore = createNoteEditorStore();
