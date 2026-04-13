process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const webpack = require('webpack');

module.exports = config => {
  return config.set({
    frameworks: ['mocha', 'webpack'],
    files: [
      {
        pattern: 'test/*_test.js',
        watched: false,
        included: true,
        served: true,
      },
    ],
    preprocessors: {
      'test/*_test.js': ['webpack'],
    },
    webpackMiddleware: {
      stats: {
        all: false,
        errors: true,
        timings: true,
        warnings: true,
      },
    },
    webpack: {
      mode: 'development',
      resolve: {
        fallback: {
          stream: require.resolve('stream-browserify'),
          crypto: require.resolve('crypto-browserify'),
          url: require.resolve('url/'),
          buffer: require.resolve('buffer/'),
        },
      },
      plugins: [
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: ['process/browser'],
        }),
      ],
    },
    reporters: ['mocha'],
    browsers: [process.env.CI ? 'FirefoxHeadless' : 'Firefox'],
    client: {
      args: [process.env.TASKCLUSTER_ROOT_URL],
    },
  });
};
