require('mocha-as-promised')();
global.assert = require('assert');

process.env.TREEHERDER_URL =
  process.env.TREEHERDER_URL || 'http://localhost:61623/api/';
