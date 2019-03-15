const neutrino = require('neutrino');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

module.exports = config => {
  neutrino().karma()(config);

  // The karma preset uses deepmerge to merge the options.
  // For deepmerging, add properties to the karma preset
  // in the options argument in`.neutrinorc.js`. For overriding
  // config properties, use this file.
  return config.set({
    browsers: [process.env.CI ? 'FirefoxHeadless' : 'Firefox'],
  });
};
