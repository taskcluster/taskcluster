module.exports = {
  use: [
    [
      '@neutrinojs/library',
      {
        name: 'taskcluster',
        env: {
          NODE_ENV: 'development',
          TASKCLUSTER_ROOT_URL: process.env.TASKCLUSTER_ROOT_URL,
        },
        babel: {
          plugins: [require.resolve('@babel/plugin-proposal-class-properties')],
          presets: [
            [
              // TODO: Override using tap() so as to not have to repeat the
              // existing debug/useBuiltIns options. (Or remove entirely if
              // @neutrinojs/library stops defaulting to IE 9 target.)
              require.resolve('@babel/preset-env'),
              {
                debug: false,
                useBuiltIns: 'entry',
                targets: {
                  // Override browsers from its default value of 'ie 9'
                  browsers: [
                    'last 2 Chrome versions',
                    'last 2 Firefox versions',
                    'last 2 Edge versions',
                    'last 2 Opera versions',
                    'last 2 Safari versions',
                    'last 2 iOS versions',
                  ],
                },
              },
            ],
          ],
        },
      },
    ],
    neutrino => {
      if (process.env.NODE_ENV === 'test') {
        neutrino.config.devtool('inline-source-map');
        // Don't set any externals when testing, since karma runs the output
        // as-is in the browser, which won't understand the require()s.
        // TODO: Remove this when fixed in @neutrinojs/library.
        neutrino.config.externals(undefined);
      } else {
        neutrino.config.devtool('source-map');
      }

      neutrino.config.resolve.alias.set('hawk', 'hawk/dist/browser.js');
    },
    ['@neutrinojs/karma', {
      client: {
        args: [process.env.TASKCLUSTER_ROOT_URL],
      },
      plugins: [
        'karma-firefox-launcher',
      ],
    }],
  ],
};
