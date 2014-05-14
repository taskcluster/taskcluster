#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

./node_modules/.bin/mocha   \
  test/config_test.js       \
  test/validator_test.js    \
  test/api/publish_test.js  \
  test/api/auth_test.js

