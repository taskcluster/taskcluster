module.exports = {
  use: [
    ['@mozilla-frontend-infra/node-lint', {
      rules: {
        'no-nested-ternary': 'off',
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
