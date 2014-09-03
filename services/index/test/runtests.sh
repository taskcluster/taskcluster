#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

# Run tests
mocha                               \
  test/index_test.js                \
  test/api_test.js                  \
  ;
