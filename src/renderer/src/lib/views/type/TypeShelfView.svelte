<script lang="ts">
  import yaml from 'js-yaml';
  import type { MetadataSchema } from '../../../../../server/core/metadata-schema';

  interface Props {
    content: string;
  }

  let { content }: Props = $props();

  // Type definition interface matching server's TypeNoteDefinition
  interface TypeDefinition {
    name: string;
    icon?: string;
    purpose: string;
    agent_instructions?: string[];
    metadata_schema?: MetadataSchema;
    suggestions_config?: {
      enabled: boolean;
      prompt_guidance?: string;
      suggestion_types?: string[];
    };
    default_review_mode?: boolean;
    editor_chips?: string[];
  }

  // Parse the YAML content
  const definition = $derived.by((): TypeDefinition | null => {
    if (!content) return null;
    try {
      const parsed = yaml.load(content);
      if (parsed && typeof parsed === 'object') {
        return parsed as TypeDefinition;
      }
    } catch {
      // Fall back to null on parse error
    }
    return null;
  });

  // Get field type display
  function getFieldTypeLabel(type: string): string {
    switch (type) {
      case 'string':
        return 'text';
      case 'number':
        return 'num';
      case 'boolean':
        return 'bool';
      case 'date':
        return 'date';
      case 'array':
        return 'list';
      case 'select':
        return 'select';
      default:
        return type;
    }
  }
</script>

<div class="type-shelf-view">
  {#if definition}
    <!-- Header with icon and purpose -->
    <div class="type-header">
      {#if definition.icon}
        <span class="type-icon">{definition.icon}</span>
      {/if}
      {#if definition.purpose}
        <p class="type-purpose">{definition.purpose}</p>
      {:else}
        <p class="type-purpose empty">No purpose defined</p>
      {/if}
    </div>

    <!-- Properties -->
    {#if definition.metadata_schema?.fields && definition.metadata_schema.fields.length > 0}
      <div class="type-section">
        <h4 class="section-label">Properties</h4>
        <div class="properties-list">
          {#each definition.metadata_schema.fields as field (field.name)}
            <div class="property-item">
              <span class="property-name">{field.name}</span>
              <span class="property-type">{getFieldTypeLabel(field.type)}</span>
              {#if field.required}
                <span class="property-required">req</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Agent Instructions -->
    {#if definition.agent_instructions && definition.agent_instructions.length > 0}
      <div class="type-section">
        <h4 class="section-label">Agent Instructions</h4>
        <ul class="instructions-list">
          {#each definition.agent_instructions as instruction (instruction)}
            <li class="instruction-item">{instruction}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Options -->
    {#if definition.default_review_mode || definition.suggestions_config?.enabled}
      <div class="type-options">
        {#if definition.default_review_mode}
          <span class="option-badge">Review Mode</span>
        {/if}
        {#if definition.suggestions_config?.enabled}
          <span class="option-badge">AI Suggestions</span>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="parse-error">
      <p>Unable to parse type definition</p>
    </div>
  {/if}
</div>

<style>
  .type-shelf-view {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .type-header {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .type-icon {
    font-size: 1.25rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .type-purpose {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-primary);
    line-height: 1.4;
  }

  .type-purpose.empty {
    color: var(--text-muted);
    font-style: italic;
  }

  .type-section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .section-label {
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .properties-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .property-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--bg-tertiary);
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .property-name {
    color: var(--text-primary);
    font-weight: 500;
  }

  .property-type {
    color: var(--text-muted);
    font-size: 0.6875rem;
  }

  .property-required {
    color: var(--accent-primary);
    font-size: 0.625rem;
    font-weight: 500;
  }

  .instructions-list {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .instruction-item {
    margin-bottom: 0.25rem;
    line-height: 1.4;
  }

  .instruction-item:last-child {
    margin-bottom: 0;
  }

  .type-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.25rem;
  }

  .option-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.375rem;
    background: var(--accent-primary);
    color: white;
    font-size: 0.6875rem;
    font-weight: 500;
    border-radius: 0.25rem;
    opacity: 0.85;
  }

  .parse-error {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    color: var(--text-muted);
  }

  .parse-error p {
    margin: 0;
    font-size: 0.875rem;
    font-style: italic;
  }
</style>
