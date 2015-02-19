/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var _ = require('lodash');

// Export methods and classes from lib/
_.defaults(exports,
  require('./lib/client'),
  require('./lib/amqplistener'),
  require('./lib/pulselistener'),
  require('./lib/weblistener'),
  require('./lib/utils')
);

// Provide a SockJS client implementation for the WebListener
Object.defineProperty(exports.WebListener, 'SockJS', {
  enumerable: true,
  get:        function() {
    // Load it on demand to keep things working under node 0.11 where binary
    // modules doesn't work well; at least have seen issues with this component
    return require('sockjs-client-node');
  }
});