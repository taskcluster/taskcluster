#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

mocha                         \
  test/client_test.js         \
  test/utils_test.js          \
  test/retry_test.js          \
  test/pulselistener_test.js  \
  test/weblistener_test.js    \
  ;

# Build browserify bundle for testing
./bin/update-apis.js browserify;

# Start moch auth server for mocha-phantomjs testing
node test/mockauthserver.js &
trap "kill $!" EXIT; sleep 0.3;

mocha-phantomjs -R spec       \
  test/browserify_test.html   \
  ;
