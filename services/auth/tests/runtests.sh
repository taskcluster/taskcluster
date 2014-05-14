#! /bin/bash -vex

./node_modules/.bin/nodeunit  \
  tests/auth_test.js          \
  tests/validate_test.js

