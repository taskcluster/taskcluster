module.exports = {
  use: [
    ['@neutrinojs/airbnb-base', {
      eslint: {
        fix: true,
        emitWarning: process.env.NODE_ENV === 'development',
        baseConfig: {
          extends: ['eslint-config-prettier'],
        },
        plugins: ['eslint-plugin-prettier'],
        rules: {
          'class-methods-use-this': 'off',
          'prettier/prettier': [
            'error',
            {
              singleQuote: true,
              bracketSpacing: true,
              jsxBracketSameLine: true,
              trailingComma: 'es5',
            },
            { usePrettierrc: false },
          ],
          'padding-line-between-statements': [
            'error',
            { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
            { blankLine: 'never', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
            { blankLine: 'always', prev: 'multiline-block-like', next: '*' },
            { blankLine: 'always', prev: '*', next: ['if', 'do', 'for', 'switch', 'try', 'while'] },
            { blankLine: 'always', prev: '*', next: 'return' },
          ],
          'no-console': process.env.NODE_ENV === 'development' ? 'off' : 'error',
          'no-nested-ternary': 'off',
          'no-shadow': 'off',
          'no-underscore-dangle': 'off',
        }
      }
    }],
    ['@neutrinojs/node', {
      babel: {
        plugins: [
          require.resolve('babel-plugin-transform-object-rest-spread'),
        ],
      },
    }],
    (neutrino) => {
      neutrino.config.module
        .rule('graphql')
          .test(/\.graphql$/)
          .use('raw')
            .loader(require.resolve('raw-loader'));
    }
  ],
};
