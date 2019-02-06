const { merge } = require('@neutrinojs/compile-loader');

module.exports = {
  use: [
    ['neutrino-preset-mozilla-frontend-infra/node-lint', {
      rules: {
        'no-underscore-dangle': 'off'
      }
    }],
    'neutrino-preset-mozilla-frontend-infra/stage',
    ['@neutrinojs/library', { name: 'taskcluster' }],
    ['@neutrinojs/env', ['NODE_ENV', 'TASKCLUSTER_ROOT_URL']],
    (neutrino) => {
      if (process.env.NODE_ENV === 'test') {
        neutrino.config.devtool('inline-source-map');
      } else {
        neutrino.config.devtool('source-map');
        neutrino.config.externals({
          hawk: 'hawk',
          'query-string': {
            commonjs: 'query-string',
            commonjs2: 'query-string',
            amd: 'query-string',
            root: 'queryString'
          }
        });
      }

      neutrino.config.resolve.alias.set('hawk', 'hawk/dist/browser.js');
      neutrino.config.module
        .rule('compile')
        .use('babel')
        .tap(options => merge(options, {
          plugins: [
            require.resolve('babel-plugin-transform-object-rest-spread'),
            [require.resolve('babel-plugin-transform-class-properties'), { spec: true }],
          ]
        }));

      if (process.env.NODE_ENV === 'test') {
        neutrino.use('@neutrinojs/karma');
      }
    },
  ],
};
