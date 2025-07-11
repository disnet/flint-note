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

class NoteEditorStore {
  private state = $state<NoteEditorState>({
    isOpen: false,
    activeNote: null,
    content: '',
    isLoading: false,
    isSaving: false,
    error: null,
    hasUnsavedChanges: false
  });

  get isOpen() {
    return this.state.isOpen;
  }

  get activeNote() {
    return this.state.activeNote;
  }

  get content() {
    return this.state.content;
  }

  get isLoading() {
    return this.state.isLoading;
  }

  get isSaving() {
    return this.state.isSaving;
  }

  get error() {
    return this.state.error;
  }

  get hasUnsavedChanges() {
    return this.state.hasUnsavedChanges;
  }

  openNote(note: NoteReference) {
    this.state.activeNote = note;
    this.state.isOpen = true;
    this.state.content = '';
    this.state.error = null;
    this.state.hasUnsavedChanges = false;
  }

  closeNote() {
    this.state.isOpen = false;
    this.state.activeNote = null;
    this.state.content = '';
    this.state.error = null;
    this.state.hasUnsavedChanges = false;
  }

  setContent(content: string) {
    this.state.content = content;
    this.state.hasUnsavedChanges = true;
  }

  setLoading(loading: boolean) {
    this.state.isLoading = loading;
  }

  setSaving(saving: boolean) {
    this.state.isSaving = saving;
  }

  setError(error: string | null) {
    this.state.error = error;
  }

  markSaved() {
    this.state.hasUnsavedChanges = false;
  }

  // Method to get the current state (useful for reactive subscriptions)
  getState() {
    return this.state;
  }
}

export const noteEditorStore = new NoteEditorStore();
