const fs = require('fs');
const path = require('path');
const getCallerFile = require('get-caller-file');

require.extensions['.graphql'] = function (module, filename) {
  module.exports = fs.readFileSync(filename, 'utf8');
};

// Mock webpack's implementation of require.context
// https://webpack.js.org/guides/dependency-management/#requirecontext
module.exports = (directory = '.', scanSubDirectories = false, regularExpression = /\.js$/) => {
  const files = {};
  const callerDirname = path.dirname(getCallerFile());
  const base = path.isAbsolute(directory) ? directory : path.resolve(callerDirname, directory);

  function readDirectory(directory) {
    fs.readdirSync(directory).forEach(function(file) {
      const fullPath = path.resolve(directory, file);

      if (fs.statSync(fullPath).isDirectory()) {
        if (scanSubDirectories) {
          readDirectory(fullPath);
        }

        return;
      }

      if (!regularExpression.test(fullPath)) {
        return;
      }

      files[fullPath] = true;
    });
  }

  readDirectory(base);

  function Module(key) {
    const file = Module.resolve(key);

    return require(file);
  }

  Module.keys = () => Object.keys(files).map(key => key.slice(base.length + 1));

  Module.resolve = (key) => {
    return path.join(base, key);
  };

  return Module;
};
