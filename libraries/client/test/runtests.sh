#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

mocha                         \
  test/client_test.js         \
  test/retry_test.js          \
  test/pulselistener_test.js  \
  test/amqplistener_test.js   \
  test/weblistener_test.js    \
  ;

./bin/update-apis.js browserify;

mocha-phantomjs -R spec       \
  test/browserify_test.html   \
  ;