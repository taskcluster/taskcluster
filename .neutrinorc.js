const { join } = require('path');
const theme = require('./src/theme');

const env = process.env.NODE_ENV;
const isEnvProduction = env === 'production';

module.exports = {
  use: [
    ['@mozilla-frontend-infra/react-lint', {
      parserOptions: {
        ecmaFeatures: {
          legacyDecorators: true
        },
      },
    }],
    '@neutrinojs/react-components',
    (neutrino) => {
      neutrino.register('styleguide', () => ({
        webpackConfig: neutrino.config.toConfig(),
        components: 'src/components/**/index.jsx',
        skipComponentsWithoutExample: true,
        theme: theme.styleguide,
        styles: {
          StyleGuide: theme.styleguide.StyleGuide,
        },
        usageMode: 'expand',
        styleguideComponents: {
          Wrapper: join(__dirname, 'src/styleguide/ThemeWrapper.jsx'),
          StyleGuideRenderer: join(__dirname, 'src/styleguide/StyleGuideRenderer.jsx'),
        },
      }));
    },
    (neutrino) => {
      if (process.env.NODE_ENV === 'development') {
        neutrino.config.module.rules.delete('lint');
      }

      neutrino.config.module
        .rule('compile')
        .use('babel')
        .tap(options => ({
          ...options,
          plugins: options.plugins
            // @babel/plugin-proposal-decorators needs to come before @babel/plugin-proposal-class-properties
            .filter(plugin => !plugin[0].includes('plugin-proposal-class-properties')).concat([
              [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
              [require.resolve('@babel/plugin-proposal-class-properties'), { loose: true }],
              isEnvProduction ? require.resolve('babel-plugin-transform-react-remove-prop-types') : null
            ]).filter(Boolean)
        }))
    },
    ['@neutrinojs/jest', {
      setupFilesAfterEnv: ['<rootDir>test/setupTests.js'],
      setupFiles: ['jest-prop-type-error'],
      snapshotSerializers: ["enzyme-to-json/serializer"],
    }],
  ],
};
