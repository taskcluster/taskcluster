const babelJestMd = require('babel-jest');
const babelJest = babelJestMd.__esModule ? babelJestMd.default : babelJestMd;

const jestBabelOptions = {
  babelrc: false,
  configFile: false,
  presets: [
    [
      '@babel/preset-env',
      {
        debug: false,
        useBuiltIns: false,
        shippedProposals: true,
        targets: {
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
    [
      '@babel/preset-react',
      {
        development: true,
        useSpread: true,
      },
    ],
  ],
    plugins: [
        "@babel/plugin-syntax-dynamic-import",
        [
            "transform-react-remove-prop-types",
            {
                removeImport: true,
            },
        ],
        [
            "@babel/plugin-proposal-decorators",
            {
                legacy: true,
            },
        ],
        [
            "@babel/plugin-proposal-class-properties",
            {
                loose: false,
            },
        ],
        [
            "@babel/plugin-proposal-optional-chaining",
            {
                loose: true,
            },
        ],
        [
            "@babel/plugin-proposal-nullish-coalescing-operator",
            {
                loose: true,
            },
        ],
        [
            "@babel/plugin-transform-modules-commonjs",
            {
                loose: true,
            },
        ],
    ],
};

const innerTransformer = babelJest.createTransformer(jestBabelOptions);

// babel-jest 30 expects jest 30's 3-arg calling convention:
//   getCacheKey(sourceText, sourcePath, transformOptions)
//   process(sourceText, sourcePath, transformOptions)
// where transformOptions = { config, instrument, ... }
//
// jest 26 calls with the older 4-arg convention:
//   getCacheKey(fileData, filePath, configString, { config, instrument, ... })
//   process(sourceText, sourcePath, config, { instrument, ... })
//
// This wrapper adapts the jest 26 calls to the format babel-jest 30 expects.
module.exports = {
  canInstrument: innerTransformer.canInstrument,

  getCacheKey(sourceText, sourcePath, configStringOrOpts, transformOptions) {
    if (transformOptions !== undefined) {
      // jest 26 style: 4 args — configString is 3rd arg, options is 4th
      // Merge configString into the transformOptions object babel-jest 30 expects
      return innerTransformer.getCacheKey(sourceText, sourcePath, {
        ...transformOptions,
        configString: configStringOrOpts,
      });
    }
    // jest 30 style: 3 args
    return innerTransformer.getCacheKey(sourceText, sourcePath, configStringOrOpts);
  },

  process(sourceText, sourcePath, configOrOpts, transformOptions) {
    if (transformOptions !== undefined) {
      // jest 26 style: 4 args — config is 3rd arg, options is 4th
      // Merge into the single transformOptions object babel-jest 30 expects
      return innerTransformer.process(sourceText, sourcePath, {
        ...transformOptions,
        config: configOrOpts,
      });
    }
    // jest 30 style: 3 args
    return innerTransformer.process(sourceText, sourcePath, configOrOpts);
  },
};
