import tseslint from '@electron-toolkit/eslint-config-ts';
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier';
import eslintPluginSvelte from 'eslint-plugin-svelte';

export default tseslint.config(
  {
    ignores: ['**/node_modules', '**/dist', '**/out']
  },
  tseslint.configs.recommended,
  eslintPluginSvelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['**/*.svelte.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ['**/*.{tsx,svelte,svelte.ts}'],
    rules: {
      'svelte/no-unused-svelte-ignore': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['**/MarkdownRenderer.svelte'],
    rules: {
      'svelte/no-at-html-tags': 'off' // Safe to use {@html} here as we sanitize with DOMPurify
    }
  },
  {
    files: ['**/env.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Type definition files can use any
      '@typescript-eslint/no-unused-vars': 'off' // Imported types may not be used directly
    }
  },
  eslintConfigPrettier
);
