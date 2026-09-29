import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

const noDynamicCode = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
};

export default defineConfig([
  globalIgnores([
    '**/node_modules',
    '**/dist',
    'vendor',
    'coverage',
    'playwright-report',
    'test-results',
    'Simulation',
    'packages/core/test/fixtures',
  ]),

  // All TypeScript: type-aware recommended rules.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      ...noDynamicCode,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Plain JS (configs, scripts).
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
    rules: noDynamicCode,
  },

  // Web app: React rules and browser globals.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: { ...globals.browser } },
  },

  // Core purity (SPEC §1): no Node/DOM APIs, no nondeterminism in library code.
  {
    files: ['packages/core/src/**/*.ts', 'packages/content/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['node:*', 'fs', 'path', 'os', 'child_process'], message: 'core must stay pure (no Node APIs)' }] }],
      'no-restricted-globals': ['error', 'process', 'Buffer', 'window', 'document', 'localStorage', 'require'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'use the seeded RNG (analysis/makeRng)' },
        { object: 'Date', property: 'now', message: 'pass time in explicitly' },
      ],
    },
  },
]);
