const _ = require('lodash');
const assert = require('assert');
const taskcluster = require('taskcluster-client');
const mocha = require('mocha');
const {stickyLoader} = require('taskcluster-lib-testing');
const load = require('../src/main');
const config = require('typed-env-config');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});
