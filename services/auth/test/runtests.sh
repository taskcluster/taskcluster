#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

./node_modules/.bin/mocha   \
  test/validate_test.js

