import js from '@eslint/js';
import pluginImport from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    plugins: {
      import: pluginImport,
    },
    rules: {
      ...pluginImport.configs.recommended.rules,
      'import/no-unresolved': 'off', // ts handles resolution
    },
  },
  prettier,
  {
    ignores: ['dist/', 'node_modules/'],
  },
];
