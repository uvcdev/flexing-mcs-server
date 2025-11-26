const path = require('path');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: path.resolve(__dirname, './tsconfig.json'),
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'prettier': require('eslint-plugin-prettier'),
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
        },
      ],
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: ['build/', 'node_modules/', 'dist/'],
  },
];