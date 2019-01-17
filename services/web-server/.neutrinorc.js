const nodeExternals = require('webpack-node-externals');
const { join } = require('path');

module.exports = {
  use: [
    ['@neutrinojs/node', {
      hot: false,
      babel: {
        plugins: [
          require.resolve('@babel/plugin-proposal-class-properties'),
        ]
      },
    }],
    (neutrino) => {
      neutrino.config.merge({
        externals: [
          nodeExternals({
            whitelist: [/^webpack/]
          }),
          nodeExternals({
            modulesFromFile: true,
          }),
          nodeExternals({
            modulesDir: join('..', '..', 'node_modules'),
          }),
        ],
      });
      neutrino.config.module
        .rule('graphql')
          .test(/\.graphql$/)
          .use('raw')
            .loader(require.resolve('raw-loader'));
    },
    '@neutrinojs/mocha'
  ],
};
