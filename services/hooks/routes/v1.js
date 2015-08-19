var Promise = require('promise')l
var debug   = require('debug')('routes:v1');
var base    = require('taskcluster-base');

var api = new base.API({
  title: "Hooks API Documentation",
  description: "Todo"
});

// Export api
module.exports = api;
