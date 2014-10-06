/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var _       = require('lodash');
var SockJS  = require('sockjs-client-node');

// Export methods and classes from lib/
_.defaults(exports,
  require('./lib/client'),
  require('./lib/amqplistener'),
  require('./lib/weblistener')
);

// Provide a SockJS client implementation for the WebListener
exports.WebListener.SockJS = SockJS;
