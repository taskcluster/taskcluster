var config    = require('./config');
config.load();

var debug     = require('debug')('worker');
var nconf     = require('nconf');
var events    = require('./events');

events.setup().then(function() {
  console.log("Now running...");
});
