class ViewRegistryClass {
    views = new Map();
    registerView(noteType, view) {
        if (!this.views.has(noteType)) {
            this.views.set(noteType, []);
        }
        const typeViews = this.views.get(noteType);
        typeViews.push(view);
        // Sort by priority (highest first)
        typeViews.sort((a, b) => b.priority - a.priority);
    }
    getView(noteType, mode = 'hybrid') {
        const typeViews = this.views.get(noteType);
        if (!typeViews || typeViews.length === 0) {
            return null;
        }
        // Find the highest priority view that supports the requested mode
        return typeViews.find((view) => view.modes.includes(mode)) || null;
    }
    hasCustomView(noteType) {
        return this.views.has(noteType) && this.views.get(noteType).length > 0;
    }
    getAllViews() {
        return new Map(this.views);
    }
    unregisterView(noteType, component) {
        const typeViews = this.views.get(noteType);
        if (!typeViews)
            return;
        const filtered = typeViews.filter((view) => view.component !== component);
        if (filtered.length === 0) {
            this.views.delete(noteType);
        }
        else {
            this.views.set(noteType, filtered);
        }
    }
}
export const ViewRegistry = new ViewRegistryClass();
