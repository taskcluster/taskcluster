module.exports = {
  parser: '@babel/eslint-parser',
  root: true,
  extends: [
    'eslint-config-airbnb',
    'eslint-config-airbnb/hooks',
    'prettier',
    'plugin:react/recommended',
    'prettier/react',
    'plugin:jest/recommended'
  ],
  rules: {
    'react/state-in-constructor': 'off',
    'new-cap': 'off',
    'no-invalid-this': 'off',
    'object-curly-spacing': [ 'error', 'always' ],
    semi: [ 'error', 'always' ],
    'no-unused-expressions': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'import/no-extraneous-dependencies': 'off',
    // Allow .js extensions for ESM compatibility (required for Vitest)
    'import/extensions': 'off',
    'max-len': [
      'error',
      80,
      2,
      {
        ignoreUrls: true,
        ignoreComments: false,
        ignoreStrings: true,
        ignoreTemplateLiterals: true
      }
    ],
    'class-methods-use-this': 'off',
    'no-console': 'error',
    'no-extra-parens': 'off',
    'prefer-const': 'error',
    'prettier/prettier': [
      'error',
      {
        singleQuote: true,
        trailingComma: 'es5',
        bracketSpacing: true,
        jsxBracketSameLine: true,
        tabWidth: 2,
        semi: true
      }
    ],
    'padding-line-between-statements': [
      'error',
      {
        blankLine: 'always',
        prev: [ 'const', 'let', 'var' ],
        next: '*'
      },
      {
        blankLine: 'never',
        prev: [ 'const', 'let', 'var' ],
        next: [ 'const', 'let', 'var' ]
      },
      { blankLine: 'always', prev: [ 'cjs-import' ], next: '*' },
      { blankLine: 'always', prev: [ 'import' ], next: '*' },
      { blankLine: 'always', prev: '*', next: [ 'cjs-export' ] },
      { blankLine: 'always', prev: '*', next: [ 'export' ] },
      { blankLine: 'never', prev: [ 'import' ], next: [ 'import' ] },
      {
        blankLine: 'never',
        prev: [ 'cjs-import' ],
        next: [ 'cjs-import' ]
      },
      { blankLine: 'any', prev: [ 'export' ], next: [ 'export' ] },
      {
        blankLine: 'any',
        prev: [ 'cjs-export' ],
        next: [ 'cjs-export' ]
      },
      { blankLine: 'always', prev: 'multiline-block-like', next: '*' },
      {
        blankLine: 'always',
        prev: '*',
        next: [ 'if', 'do', 'for', 'switch', 'try', 'while' ]
      },
      { blankLine: 'always', prev: '*', next: 'return' }
    ],
    'consistent-return': 'off',
    'no-shadow': 'off',
    'no-return-assign': 'off',
    'no-mixed-operators': 'off',
    'jsx-quotes': [ 'error', 'prefer-double' ],
    'jsx-a11y/anchor-is-valid': [ 'error', { components: [ 'Link' ], specialLink: [ 'to' ] } ],
    'jsx-a11y/click-events-have-key-events': 'off',
    'jsx-a11y/no-static-element-interactions': 'off',
    'react/jsx-indent-props': [ 'error', 2 ],
    'react/jsx-pascal-case': 'error',
    'react/jsx-tag-spacing': [ 'error', { beforeSelfClosing: 'always' } ],
    'react/default-props-match-prop-types': 'off',
    'react/jsx-closing-bracket-location': 'off',
    'react/destructuring-assignment': 'off',
    'react/jsx-handler-names': [
      'error',
      { eventHandlerPrefix: 'handle', eventHandlerPropPrefix: 'on' }
    ],
    'react/jsx-indent': 'off',
    'react/prefer-stateless-function': 'off',
    'react/prop-types': 'off',
    'react/sort-comp': 'off',
    'react/forbid-prop-types': 'off',
    'react/no-unused-prop-types': 'off',
    'react/require-default-props': 'off',
    'react/jsx-fragments': [ 'error', 'element' ],
    'react/no-access-state-in-setstate': 'off',
    'linebreak-style': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/static-property-placement': 'off',
    'react/jsx-no-bind': 'off'
  },
  env: { es6: true, browser: true, commonjs: true },
  globals: {
    process: true,
    // Vitest globals
    vi: 'readonly',
    describe: 'readonly',
    it: 'readonly',
    expect: 'readonly',
    beforeEach: 'readonly',
    afterEach: 'readonly',
    beforeAll: 'readonly',
    afterAll: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      legacyDecorators: true,
      jsx: true
    },
    requireConfigFile: false,
    babelOptions: {
      presets: ['@babel/preset-react'],
      plugins: [
        ['@babel/plugin-proposal-decorators', { legacy: true }]
      ]
    }
  },
  plugins: [ 'react', 'react-hooks', 'prettier' ],
  settings: { react: { version: 'detect' } }
}
