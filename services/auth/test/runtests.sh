#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

mocha                             \
  test/validate_test.js           \
  test/client_test.js             \
  test/role_test.js               \
  test/rolelogic_test.js          \
  test/grantsrole_test.js         \
  test/remotevalidation_test.js   \
  test/azure_test.js              \
  test/s3_test.js                 \
  ;

