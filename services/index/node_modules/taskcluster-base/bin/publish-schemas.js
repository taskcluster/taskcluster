#!/usr/bin/env node
var path  = require('path');
var base  = require('../');

// Create publish schemas to schemas.taskcluster.net
base.validator({
  folder:       path.join(__dirname, '..', 'schemas'),
  publish:      true,
  schemaPrefix: 'base/v1/',
  schemaBucket: 'schemas.taskcluster.net',
  aws: {
    region:     'us-west-2'
  }
}).then(function() {
  console.log("Published");
}, function(err) {
  console.log("Failed to publish:");
  console.log(err);
});