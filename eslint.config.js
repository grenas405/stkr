import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

const SECURITY_RULES = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
};

// src/core must stay free of side effects, so these are unavailable to it.
const IMPURE_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'crypto',
  'performance',
  'console',
  'setTimeout',
  'setInterval',
].map((name) => ({ name, message: 'src/core must be pure: pass this in as an argument.' }));

export default [
  { ignores: ['dist/**', 'public/**', 'node_modules/**', '.wrangler/**', 'dev-dist/**', 'test-results/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parser: vueParser, parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      ...SECURITY_RULES,
      'vue/no-v-html': 'error',
      'vue/no-v-text-v-html-on-component': 'error',
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/attributes-order': 'off',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-restricted-imports': [
        'error',
        { patterns: ['**/io/*', '**/ui/*', '**/worker/*', 'vue', 'idb', 'animejs', 'd3-force'] },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Pass the time in as an argument.' },
        { object: 'Math', property: 'random', message: 'Pass randomness in as an argument.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Pass the time in as an argument.',
        },
      ],
    },
  },
];
