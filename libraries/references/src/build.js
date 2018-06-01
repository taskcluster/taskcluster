const util = require('util');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));

const build = async (input, output, rootUrl) => {
  await rimraf(output);
  await mkdirp(output);
};

module.exports = build;
