/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var _       = require('lodash');
var SockJS  = require('./lib/sockjs');

// Export methods and classes from lib/ with the exception of amqplistener, as
// cannot be supported by browserify
var taskcluster = _.defaults({},
  require('./lib/client'),
  require('./lib/weblistener')
);

// Provide a SockJS client implementation for the WebListener
taskcluster.WebListener.SockJS = SockJS;

// Export taskcluster
module.exports = taskcluster;