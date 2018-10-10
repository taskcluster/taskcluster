module.exports = {
  use: [
    ['@neutrinojs/airbnb-base', {
      eslint: {
        baseConfig: {
          extends: ['eslint-config-prettier'],
        },
        plugins: ['eslint-plugin-prettier'],
        rules: {
          'no-nested-ternary': 0,
          // Specify the maximum length of a line in your program
          'max-len': [
            'error',
            80,
            2,
            {
              ignoreUrls: true,
              ignoreComments: false,
              ignoreStrings: true,
              ignoreTemplateLiterals: true,
            },
          ],
          // Allow console during development, otherwise throw an error
          'no-console': process.env.NODE_ENV === 'development' ? 'off' : 'error',
          // Our frontend strives to adopt functional programming practices,
          // so we prefer const over let
          'prefer-const': 'error',
          'prettier/prettier': [
            'error',
            {
              singleQuote: true,
              trailingComma: 'es5',
              bracketSpacing: true,
              jsxBracketSameLine: true,
            },
          ],
          'class-methods-use-this': 'off',
          'no-shadow': 'off',
          'babel/new-cap': 'off',
        },
      },
    }],
    ['@neutrinojs/node', {
      hot: false,
      babel: {
        plugins: [
          [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
          require.resolve('@babel/plugin-proposal-class-properties'),
        ]
      },
    }],
    (neutrino) => {
      neutrino.config.module
        .rule('graphql')
          .test(/\.graphql$/)
          .use('raw')
            .loader(require.resolve('raw-loader'));
    },
    '@neutrinojs/mocha'
  ],
};
