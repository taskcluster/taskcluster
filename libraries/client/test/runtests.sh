#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

mocha                         \
  test/client_test.js         \
  test/listener_test.js       \
  ;

mocha-phantomjs -R spec       \
  test/browserify_test.html   \
  ;