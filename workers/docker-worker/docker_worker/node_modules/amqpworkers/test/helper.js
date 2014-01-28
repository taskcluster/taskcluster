require('mocha-as-promised')();


if (process.env.BLANKET) {
  require('blanket')({
    pattern: function(file) {
      return file.indexOf('_test.js') === -1;
    },
    "data-cover-never": function(file) {
      return file.indexOf('node_modules') !== -1;
    }
  });
}

global.assert = require('assert');
