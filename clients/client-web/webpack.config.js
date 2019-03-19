const neutrino = require('neutrino');

const config = neutrino().webpack();
const output = config.output;

module.exports = [
  config,
  {
    ...config,
    output: {
      ...output,
      path: `${output.path}/esm`,
      libraryTarget: 'var',
    },
  },
];
