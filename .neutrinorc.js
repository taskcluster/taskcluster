const merge = require('deepmerge');

module.exports = {
  use: [
    'neutrino-preset-taskcluster-web-library',
    (neutrino) => {
     neutrino.config.when(process.env.NODE_ENV !== 'test', () => {
       neutrino.config.externals({
         hawk: 'hawk',
         'query-string': {
           commonjs: 'query-string',
           commonjs2: 'query-string',
           amd: 'query-string',
           root: 'queryString'
         }
       });
     });
      neutrino.config.output.library('taskcluster');
      neutrino.config.resolve.alias.set('hawk', 'hawk/dist/browser.js');
      neutrino.config.module
        .rule('compile')
        .use('babel')
        .tap(options => merge(options, {
          plugins: [
            ...options.plugins,
            require.resolve('babel-plugin-transform-object-rest-spread'),
            [require.resolve('babel-plugin-transform-class-properties'), { spec: true }],
          ]
        }));
    },
    'neutrino-preset-karma'
  ],
  env: {
    NODE_ENV: {
      'test': (neutrino) => neutrino.config.devtool('inline-source-map')
    }
  }
};
