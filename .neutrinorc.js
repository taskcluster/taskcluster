module.exports = {
  use: [
    ['neutrino-preset-mozilla-frontend-infra', {
      react: {
        html: {
          title: process.env.APPLICATION_TITLE
        },
        devServer: {
          port: process.env.PORT
        }
      }
    }],
    ['@neutrinojs/env', ['NODE_ENV', 'APPLICATION_TITLE']]
  ]
};
