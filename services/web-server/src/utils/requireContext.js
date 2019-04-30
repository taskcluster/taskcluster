const fs = require('fs');
const path = require('path');

require.extensions['.graphql'] = function (module, filename) {
  module.exports = fs.readFileSync(filename, 'utf8');
};

// Mock webpack's implementation of require.context
module.exports = (base = '.', scanSubDirectories = false, regularExpression = /\.js$/) => {
  const files = {};

  function readDirectory(directory) {
    fs.readdirSync(directory).forEach((file) => {
      const fullPath = path.resolve(directory, file);

      if (fs.statSync(fullPath).isDirectory()) {
        if (scanSubDirectories) {readDirectory(fullPath);}

        return;
      }

      if (!regularExpression.test(fullPath)) {return;}

      files[fullPath] = true;
    });
  }

  readDirectory(path.resolve(__dirname, '..', base));

  function Module(file) {
    return require(file);
  }

  Module.keys = () => Object.keys(files);

  return Module;
};
