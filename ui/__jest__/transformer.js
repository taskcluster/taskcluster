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

module.exports = babelJest.createTransformer(jestBabelOptions);
