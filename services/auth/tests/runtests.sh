#! /bin/bash -vex

./node_modules/.bin/nodeunit  \
  tests/data_test.js          \
  tests/rerun_test.js         \
  tests/scheduler_test.js     \
  tests/validate_test.js      \
  tests/jsonsubs_test.js

