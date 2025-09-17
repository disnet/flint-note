export class AutoSave {
  hasChanges = $state(false);
  isSaving = $state(false);

  private saveTimeout: number | null = null;

  constructor(
    private onSave: () => Promise<void>,
    private delay = 500
  ) {}

  markChanged(): void {
    this.hasChanges = true;
    this.debouncedSave();
  }

  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(async () => {
      if (this.hasChanges) {
        await this.triggerSave();
      }
    }, this.delay);
  }

  async triggerSave(): Promise<void> {
    if (this.isSaving) return;

    try {
      this.isSaving = true;
      await this.onSave();
      this.hasChanges = false;
    } catch (error) {
      console.error('Auto-save failed:', error);
      throw error;
    } finally {
      this.isSaving = false;
    }
  }

  clearChanges(): void {
    this.hasChanges = false;
  }

  destroy(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
  }
}
