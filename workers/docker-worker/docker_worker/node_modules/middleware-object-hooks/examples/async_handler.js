var middleware = require('../')();
var Promise = require('promise');

middleware.use({
  echo: function(value) {
    return new Promise(function(accept, reject) {
      setTimeout(accept, 0, value);
    });
  }
});

module.exports = middleware;
