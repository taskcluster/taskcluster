const { join } = require('path');

require('babel-register')({
  plugins: [
    [require.resolve('babel-plugin-transform-es2015-modules-commonjs'), {
      useBuiltIns: true
    }],
    require.resolve('babel-plugin-transform-object-rest-spread'),
  ],
  cache: false,
});

const theme = require('./src/theme').default;

module.exports = {
  use: [
    ['neutrino-preset-mozilla-frontend-infra/styleguide', {
      components: 'src/components/**/index.jsx',
      theme: theme.styleguide,
      styles: {
        StyleGuide: theme.styleguide.StyleGuide,
      },
      editorConfig: {
        theme: 'material',
      },
      showUsage: true,
      skipComponentsWithoutExample: false,
      styleguideComponents: {
        Wrapper: join(__dirname, 'src/styleguide/ThemeWrapper.jsx'),
        StyleGuideRenderer: join(__dirname, 'src/styleguide/StyleGuideRenderer.jsx'),
      },
    }],
    ['neutrino-preset-mozilla-frontend-infra/react', {
      html: {
        title: process.env.APPLICATION_NAME
      },
      devServer: {
        port: process.env.PORT || 9000,
        historyApiFallback: { disableDotRule: true },
        proxy: {
          '/graphql': {
            target: 'http://localhost:3050',
          },
          '/subscription': {
            ws: true,
            changeOrigin: true,
            target: 'http://localhost:3050',
          },
        },
      },
      eslint: {
        rules: {
          // This has been set in the latest Airbnb preset, but has not been
          // released yet.
          'react/no-did-mount-set-state': 'off',
        }
      }
    }],
    ['@neutrinojs/env', [
      'NODE_ENV',
      'APPLICATION_NAME',
      'AUTH0_DOMAIN',
      'AUTH0_CLIENT_ID',
      'AUTH0_REDIRECT_URI',
      'AUTH0_RESPONSE_TYPE',
      'AUTH0_SCOPE',
      'BASE_URL',
    ]],
    (neutrino) => {
      if (process.env.NODE_ENV === 'development') {
        neutrino.config.devtool('cheap-module-source-map');
      }

      neutrino.config.output.publicPath('/');
      neutrino.config.module
        .rule('graphql')
          .test(/\.graphql$/)
          .include
            .add(neutrino.options.source)
            .end()
          .use('gql-loader')
            .loader(require.resolve('graphql-tag/loader'));
    },
  ],
};
