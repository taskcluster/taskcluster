module.exports = {
  use: [
    ['neutrino-preset-mozilla-frontend-infra/node', {
      babel: {
        plugins: [
          require.resolve('babel-plugin-transform-object-rest-spread'),
        ],
      },
      eslint: {
        rules: {
          'no-nested-ternary': 'off',
        },
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
