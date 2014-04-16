var nconf       = require('nconf');
var utils       = require('./utils');
var slugid      = require('slugid');
var Promise     = require('promise');
var _           = require('lodash');
var debug       = require('debug')('routes:api:v1');
var request     = require('superagent-promise');
var assert      = require('assert');

/** API end-point for version v1/ */
var api = module.exports = new utils.API({
  limit:          '10mb'
});

/** Get task-graph status */
api.declare({
  method:     'get',
  route:      '/restricted',
  input:      undefined,
  output:     undefined,
  title:      "Test interface",
  desc: [
    "TODO: Write documentation..."
  ].join('\n')
}, function(req, res) {
  res.json("test");
});
