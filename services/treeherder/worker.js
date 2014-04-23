var debug     = require('debug')('worker');
var config    = require('./config');
var nconf     = require('nconf');
var events    = require('./events');

config.load();

events.setup().then(function() {
  console.log("Now running...");
});
