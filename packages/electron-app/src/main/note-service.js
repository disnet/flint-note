import { FlintNoteApi } from '@flint-note/server/dist/api';
import { logger } from './logger';
export class NoteService {
    api;
    isInitialized = false;
    constructor() {
        // Use default workspace path if not provided
        this.api = new FlintNoteApi({
            throwOnError: false
        });
    }
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        try {
            await this.api.initialize();
            this.isInitialized = true;
            logger.info('FlintNote API initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize FlintNote API', { error });
            throw error;
        }
    }
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('NoteService must be initialized before use');
        }
    }
    // Note CRUD operations
    async createNote(type, identifier, content, vaultId, metadata) {
        this.ensureInitialized();
        return await this.api.createNote({
            type,
            title: identifier,
            content,
            vaultId,
            metadata
        });
    }
    async getNote(identifier, vaultId) {
        this.ensureInitialized();
        return await this.api.getNote(identifier, vaultId);
    }
    async updateNote(identifier, content, vaultId, metadata) {
        this.ensureInitialized();
        // Get current note to obtain content hash
        const note = await this.api.getNote(identifier, vaultId);
        if (!note) {
            throw new Error('Note not found');
        }
        return await this.api.updateNote({
            identifier,
            content,
            metadata,
            contentHash: note.content_hash,
            vaultId
        });
    }
    async deleteNote(identifier, vaultId) {
        this.ensureInitialized();
        return await this.api.deleteNote({
            identifier,
            confirm: true,
            vaultId
        });
    }
    async renameNote(identifier, newIdentifier, vaultId) {
        this.ensureInitialized();
        // Get the note first to obtain content hash
        const note = await this.api.getNote(identifier, vaultId);
        if (!note) {
            throw new Error('Note not found');
        }
        return await this.api.renameNote({
            identifier,
            new_title: newIdentifier,
            content_hash: note.content_hash,
            vault_id: vaultId
        });
    }
    async moveNote(identifier, newType, vaultId) {
        this.ensureInitialized();
        // Get the note first to obtain content hash
        const note = await this.api.getNote(identifier, vaultId);
        if (!note) {
            throw new Error('Note not found');
        }
        return await this.api.moveNote({
            identifier,
            new_type: newType,
            content_hash: note.content_hash,
            vault_id: vaultId
        });
    }
    // Search operations
    async searchNotes(query, vaultId, limit) {
        this.ensureInitialized();
        return await this.api.searchNotesByText({
            query,
            limit,
            vaultId
        });
    }
    async searchNotesAdvanced(params) {
        this.ensureInitialized();
        return await this.api.searchNotesAdvanced({
            content_contains: params.query,
            type: params.type,
            metadata_filters: params.tags
                ? [
                    {
                        key: 'tags',
                        value: params.tags.join(','),
                        operator: 'IN'
                    }
                ]
                : undefined,
            created_within: params.dateFrom,
            created_before: params.dateTo,
            limit: params.limit,
            vault_id: params.vaultId
        });
    }
    // Note type operations
    async listNoteTypes() {
        this.ensureInitialized();
        return await this.api.listNoteTypes();
    }
    async createNoteType(params) {
        this.ensureInitialized();
        return await this.api.createNoteType({
            type_name: params.typeName,
            description: params.description,
            agent_instructions: params.agentInstructions,
            metadata_schema: params.metadataSchema,
            vault_id: params.vaultId
        });
    }
    async getNoteTypeInfo(args) {
        this.ensureInitialized();
        return await this.api.getNoteTypeInfo(args);
    }
    async updateNoteType(params) {
        this.ensureInitialized();
        // For now, just return what the API gives us
        return await this.api.updateNoteType({
            type_name: params.typeName,
            description: params.description,
            instructions: params.instructions,
            metadata_schema: params.metadataSchema,
            vault_id: params.vaultId
        });
    }
    async listNotesByType(type, vaultId, limit) {
        this.ensureInitialized();
        return await this.api.listNotes({
            typeName: type,
            limit,
            vaultId
        });
    }
    // Vault operations
    async listVaults() {
        this.ensureInitialized();
        const vaults = await this.api.listVaults();
        return vaults;
    }
    async getCurrentVault() {
        this.ensureInitialized();
        return await this.api.getCurrentVault();
    }
    async createVault(name, path, description) {
        this.ensureInitialized();
        return await this.api.createVault({
            id: name.toLowerCase().replace(/\s+/g, '-'),
            name,
            path,
            description
        });
    }
    async switchVault(vaultId) {
        this.ensureInitialized();
        return await this.api.switchVault({ id: vaultId });
    }
    // Link operations
    async getNoteLinks(identifier, vaultId) {
        this.ensureInitialized();
        return await this.api.getNoteLinks(identifier, vaultId);
    }
    async getBacklinks(identifier, vaultId) {
        this.ensureInitialized();
        return await this.api.getBacklinks(identifier, vaultId);
    }
    async findBrokenLinks(vaultId) {
        this.ensureInitialized();
        return await this.api.findBrokenLinks(vaultId);
    }
    // Additional helper methods
    async getAllNotes(vaultId) {
        this.ensureInitialized();
        return await this.api.listNotes({
            vaultId
        });
    }
    // Ensure default note type exists across all vaults
    async ensureDefaultNoteType() {
        this.ensureInitialized();
        try {
            // Get all vaults
            const vaults = await this.api.listVaults();
            const currentVault = await this.api.getCurrentVault();
            logger.info(`Ensuring default 'note' type exists across ${vaults.length} vaults`);
            for (const vault of vaults) {
                try {
                    // Switch to this vault if it's not the current one
                    if (!currentVault || vault.id !== currentVault.id) {
                        await this.api.switchVault({ id: vault.id });
                    }
                    // Check if 'note' type already exists
                    const noteTypes = await this.api.listNoteTypes();
                    const hasNoteType = noteTypes.some((type) => type.name === 'note');
                    if (!hasNoteType) {
                        // Create the default 'note' type
                        await this.api.createNoteType({
                            type_name: 'note',
                            description: 'General purpose note for unspecified content',
                            agent_instructions: [
                                'This is a general purpose note with no specific structure requirements.',
                                "Use for any content that doesn't fit into other specific note types."
                            ],
                            metadata_schema: {
                                fields: [
                                    {
                                        name: 'tags',
                                        type: 'array',
                                        required: false,
                                        description: 'Optional tags for categorizing the note'
                                    },
                                    {
                                        name: 'created_by',
                                        type: 'string',
                                        required: false,
                                        description: 'Optional field indicating who created the note'
                                    }
                                ]
                            }
                        });
                        logger.info(`Created default 'note' type in vault: ${vault.name}`);
                    }
                    else {
                        logger.debug(`Default 'note' type already exists in vault: ${vault.name}`);
                    }
                }
                catch (error) {
                    logger.warn(`Failed to ensure default note type in vault ${vault.name}:`, {
                        error
                    });
                }
            }
            // Restore original vault if we switched
            if (currentVault && vaults.length > 1) {
                try {
                    await this.api.switchVault({ id: currentVault.id });
                }
                catch (error) {
                    logger.warn('Failed to restore original vault:', { error });
                }
            }
            logger.info('Finished ensuring default note type across all vaults');
        }
        catch (error) {
            logger.error('Failed to ensure default note type:', { error });
        }
    }
    // Utility methods
    isReady() {
        return this.isInitialized;
    }
}
