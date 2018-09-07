module.exports = {
  use: [
    ['neutrino-preset-mozilla-frontend-infra/node', {
      hot: false,
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
    },
    // work around https://bugzilla.mozilla.org/show_bug.cgi?id=1489273
    (neutrino) => {
      neutrino.config.when(neutrino.options.command === 'build', config => {
        config.plugins.delete('named-chunks');
      });
    },
  ],
};
