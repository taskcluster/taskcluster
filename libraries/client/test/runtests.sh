#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

#mocha test/*_test.js

# Build browserify bundle for testing
./bin/update-apis.js browserify;

mocha-phantomjs -R spec       \
  test/browserify_test.html   \
  ;
