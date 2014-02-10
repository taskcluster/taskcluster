var middleware = require('..')();

middleware.use({ xfoo: function() {} });

module.exports = middleware;
