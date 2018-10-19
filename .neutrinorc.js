const merge = require('deepmerge');
const { join } = require('path');

require('@babel/register')({
  presets: [require.resolve('@babel/preset-env')],
  cache: false,
});

const theme = require('./src/theme').default;

module.exports = {
  use: [
    ['@neutrinojs/airbnb', {
      eslint: {
        parserOptions: {
          ecmaFeatures: {
            legacyDecorators: true
          }
        },
        emitWarning: process.env.NODE_ENV === 'development',
        baseConfig: {
          extends: ['plugin:react/recommended', 'eslint-config-prettier'],
        },
        envs: ['worker', 'serviceworker'],
        plugins: ['prettier'],
        rules: {
          'react/jsx-wrap-multilines': 'off',
          'react/prop-types': 'off',
          'react/jsx-one-expression-per-line': 'off',
          'react/forbid-prop-types': 'off',
          'react/prefer-stateless-function': 'off',
          'react/no-access-state-in-setstate': 'off',
          'react/destructuring-assignment': 'off',
          'babel/no-unused-expressions': 'off',
          'import/no-extraneous-dependencies': 'off',
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
          // Allow using class methods with static/non-instance functionality
          // React lifecycle methods commonly do not use an instance context for
          // anything
          'class-methods-use-this': 'off',
          // Allow console during development, otherwise throw an error
          'no-console': process.env.NODE_ENV === 'development' ? 'off' : 'error',
          'prettier/prettier': [
            'error',
            {
              singleQuote: true,
              trailingComma: 'es5',
              bracketSpacing: true,
              jsxBracketSameLine: false,
            },
          ],
          'consistent-return': 'off',
          'no-shadow': 'off',
          'no-return-assign': 'off',
          'babel/new-cap': 'off',
          'no-mixed-operators': 'off',
        },
      },
    }],
    ['@neutrinojs/react', {
      publicPath: '/',
      html: {
        title: process.env.APPLICATION_NAME
      },
      devServer: {
        port: process.env.PORT || 9000,
        historyApiFallback: { disableDotRule: true },
        proxy: {
          '/login': {
            target: process.env.TASKCLUSTER_ROOT_URL,
          },
          '/graphql': {
            target: process.env.TASKCLUSTER_ROOT_URL,
          },
          '/subscription': {
            ws: true,
            changeOrigin: true,
            target: process.env.TASKCLUSTER_ROOT_URL,
          },
        },
      },
      env: {
        APPLICATION_NAME: 'Application Name',
        LOGIN_STRATEGIES: '',
        PORT: 9000,
        TASKCLUSTER_ROOT_URL: 'http://localhost:3050',
        GRAPHQL_SUBSCRIPTION_ENDPOINT: '',
        GA_TRACKING_ID: '',
        SENTRY_DSN: '',
      },
      babel: {
        plugins: [
          [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
          require.resolve('@babel/plugin-proposal-class-properties'),
        ],
      },
    }],
    (neutrino) => {
      neutrino.register('styleguide', () => ({
        webpackConfig: neutrino.config.toConfig(),
        components: join(
          neutrino.options.source,
          'components/**',
          `*.{${neutrino.options.extensions.join(',')}}`
        ),
        skipComponentsWithoutExample: true,
        theme: theme.styleguide,
        styles: {
          StyleGuide: theme.styleguide.StyleGuide,
        },
        editorConfig: {
          theme: 'material',
        },
        usageMode: 'expand',
        styleguideComponents: {
          Wrapper: join(__dirname, 'src/styleguide/ThemeWrapper.jsx'),
          StyleGuideRenderer: join(__dirname, 'src/styleguide/StyleGuideRenderer.jsx'),
        },
      }));
    },
    (neutrino) => {
      neutrino.config.node.set('Buffer', true);

      // The shell view requires this
      neutrino.config
        .externals(merge(neutrino.config.get('externals'), {
          bindings: 'bindings'
        }));

      neutrino.config.module
        .rule('graphql')
          .test(/\.graphql$/)
          .include
            .add(neutrino.options.source)
            .end()
          .use('gql-loader')
            .loader(require.resolve('graphql-tag/loader'));

      // The JSONStream module's main file has a Node.js shebang
      // which Webpack doesn't like loading as JS
      neutrino.config.module
        .rule('shebang')
          .test(/JSONStream/)
          .use('shebang')
            .loader('shebang-loader');
    },
    '@neutrinojs/karma',
  ],
};
