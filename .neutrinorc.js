module.exports = {
  use: [
    ['neutrino-preset-mozilla-frontend-infra', {
      react: {
        html: {
          title: process.env.APPLICATION_NAME
        },
        devServer: {
          port: +process.env.PORT || 9000
        }
      }
    }],
    ['@neutrinojs/env', ['NODE_ENV', 'APPLICATION_NAME']],
    (neutrino) => {
      // Hacks to replace react-hot-loader with latest version (v4)
      neutrino.config
        .entry('index')
          .batch(index => {
            const values = index
              .values()
              .filter(value => !value.includes('react-hot-loader'));

            index
              .clear()
              .merge(values);
          });

      neutrino.config.module
        .rule('compile')
          .use('babel')
            .tap(options => {
              options.plugins.forEach((plugin, index) => {

                if (Array.isArray(plugin)) {
                  if (plugin[0].includes('react-hot-loader')) {
                    plugin[0] = require.resolve('react-hot-loader/babel');
                  }
                } else {
                  if (plugin.includes('react-hot-loader')) {
                    options.plugins[index] = require.resolve('react-hot-loader/babel');
                  }
                }
              });

          return options;
        });
    }
  ]
};
