const mkdirp = require('mkdirp');
const rmrf = require('rimraf');

module.exports = {
  makeDir(directory) {
    return mkdirp(directory);
  },

  removeDir(directory) {
    return new Promise(function(accept, reject) {
      rmrf(directory, function (error) {
        if (error) return reject(error);
        accept(error);
      });
    });
  }
};
