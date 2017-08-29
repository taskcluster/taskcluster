const merge = require('deepmerge');

module.exports = {
  use: [
    '@eliperelman/neutrino-preset-library',
    (neutrino) => {
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
    }
  ]
};
