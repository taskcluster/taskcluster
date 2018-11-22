const merge = require('deepmerge');
const { join } = require('path');

require('@babel/register')({
  presets: [require.resolve('@babel/preset-env')],
  cache: false,
});

const theme = require('./src/theme').default;

module.exports = {
  use: [
    ['@mozilla-frontend-infra/react-lint', {
      parserOptions: {
        ecmaFeatures: {
          legacyDecorators: true
        },
      },
      rules: {
        'react/no-access-state-in-setstate': 'off',
        'babel/no-unused-expressions': 'off',
      },
    }],
    ['@neutrinojs/react', {
      html: {
        title: process.env.APPLICATION_NAME
      },
      devServer: {
        port: process.env.PORT,
        historyApiFallback: { disableDotRule: true },
        proxy: {
          '/login': {
            target: 'http://localhost:3050',
          },
          '/graphql': {
            target: 'http://localhost:3050',
          },
          '/subscription': {
            ws: true,
            changeOrigin: true,
            target: 'ws://localhost:3050',
          },
        },
      },
      env: {
        APPLICATION_NAME: 'Application Name',
        LOGIN_STRATEGIES: '',
        PORT: 5080,
        TASKCLUSTER_ROOT_URL: 'https://taskcluster.net',
        GRAPHQL_SUBSCRIPTION_ENDPOINT: 'ws://localhost:5080/subscription',
        GRAPHQL_ENDPOINT: 'http://localhost:5080/graphql',
        GA_TRACKING_ID: '',
        SENTRY_DSN: '',
      },
      babel: {
        plugins: [
          [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
          [require.resolve('@babel/plugin-proposal-class-properties'), { loose: true }],
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

      neutrino.config.module
        .rule('markdown')
          .test(/\.mdx?$/)
          .use('babel-loader')
            .loader('babel-loader')
            .end()
          .use('mdx-loader')
            .loader('mdx-loader');
    },
    '@neutrinojs/karma',
  ],
};
