const merge = require('deepmerge');
const copy = require('@neutrinojs/copy');
const { join, resolve } = require('path');
const fs = require('fs');
const generateEnvJs = require('./generate-env-js');

const DEFAULT_PORT = 5080;
const STATIC_DIR = join(__dirname, 'src/static');
const port = process.env.PORT || DEFAULT_PORT;

require('@babel/register')({
  presets: [require.resolve('@babel/preset-env')],
  cache: false,
});

const theme = require('./src/theme').default;

module.exports = {
  options: {
    mains: {
      index: 'index.jsx',
      docs: 'docs.jsx',
    },
  },
  use: [
    ['@mozilla-frontend-infra/react-lint', {
      parserOptions: {
        ecmaFeatures: {
          legacyDecorators: true
        },
      },
      plugins: ['react-hooks'],
      rules: {
        'react/no-access-state-in-setstate': 'off',
        'babel/no-unused-expressions': 'off',
        'linebreak-style': 'off',
        'react-hooks/rules-of-hooks': 'error',
      },
    }],
    ['@neutrinojs/react', {
      html: {
        template: './src/index.html',
      },
      devServer: {
        port,
        historyApiFallback: {
          disableDotRule: true,
          rewrites: [
            { from: /^\/docs/, to: '/docs.html' },
          ],
        },
        proxy: {
          '/login': {
            target: 'http://localhost:3050',
          },
          '/graphql': {
            target: 'http://localhost:3050',
          },
          '/subscription': {
            ws: true,
            changeOrigin: true,
            target: 'ws://localhost:3050',
          },
        },
      },
    }],
    (neutrino) => {
      neutrino.register('styleguide', () => ({
        webpackConfig: neutrino.config.toConfig(),
        components: join(
          neutrino.options.source,
          'components/**',
          `*.{${neutrino.options.extensions.join(',')}}`
        ),
        skipComponentsWithoutExample: true,
        theme: theme.styleguide,
        styles: {
          StyleGuide: theme.styleguide.StyleGuide,
        },
        editorConfig: {
          theme: 'material',
        },
        usageMode: 'expand',
        styleguideComponents: {
          Wrapper: join(__dirname, 'src/styleguide/ThemeWrapper.jsx'),
          StyleGuideRenderer: join(__dirname, 'src/styleguide/StyleGuideRenderer.jsx'),
        },
      }));
    },
    (neutrino) => {
      neutrino.config.node.set('Buffer', true);

      // The shell view requires this
      neutrino.config
        .externals(merge(neutrino.config.get('externals'), {
          bindings: 'bindings'
        }));

      neutrino.config.module
        .rule('compile')
          .use('babel')
            .tap(options => ({
              ...options,
              plugins: options.plugins
                // @babel/plugin-proposal-decorators needs to come before @babel/plugin-proposal-class-properties
                .filter(plugin => !plugin[0].includes('plugin-proposal-class-properties'))
                .concat([
                  [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
                  [require.resolve('@babel/plugin-proposal-class-properties'), { loose: true }],
                ]).filter(Boolean)
            }));

      neutrino.config.module
        .rule('graphql')
          .test(/\.graphql$/)
          .include
            .add(neutrino.options.source)
            .end()
          .use('gql-loader')
            .loader(require.resolve('graphql-tag/loader'));

      // The JSONStream module's main file has a Node.js shebang
      // which Webpack doesn't like loading as JS
      neutrino.config.module
        .rule('shebang')
          .test(/JSONStream/)
          .use('shebang')
            .loader('shebang-loader');

      neutrino.config.module
        .rule('markdown')
          .test(/\.mdx?$/)
          .use('babel-loader')
            .loader('babel-loader')
            .options({
              presets: [require.resolve('@babel/preset-react')],
            })
            .end()
          .use('mdx-loader')
            .loader('mdx-loader');

      neutrino.config.module
        .rule('all-contributors')
          .test(/\.all-contributorsrc$/)
          .use('json-loader')
            .loader('json-loader');

      neutrino.config.module
        .rule('taskcluster-version')
          .test(/taskcluster-version$/)
          .use('raw-loader')
            .loader('raw-loader');
    },
    (neutrino) => {
      neutrino.config.resolve
        .alias.set('taskcluster-ui', resolve(__dirname, 'src/'));
    },
    (neutrino) => {
      // Generate env.js, combining env vars into the build, when
      // GENERATE_ENV_JS is set
      const envJs = join(STATIC_DIR, 'env.js');
      if (process.env.GENERATE_ENV_JS) {
        generateEnvJs(envJs);
      } else {
        // just so that we never end up accidentally including something
        // in a production build
        if (fs.existsSync(envJs)) {
          fs.unlinkSync(envJs);
        }
      }

      neutrino.use(copy, {
        patterns: [
          {
            context: 'src/static',
            from: '**/*',
            to: 'static',
          },
        ],
      });
    },
    ['@neutrinojs/karma', {
      plugins: [
        'karma-firefox-launcher',
      ],
    }],
  ],
};
