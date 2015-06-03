#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

mocha                       \
  test/auth_test.js         \
  test/azure_test.js        \
  test/s3_test.js           \
  test/validate_test.js     \
  ;

