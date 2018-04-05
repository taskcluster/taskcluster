module.exports = {
  use: [
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
    }
  ]
};
