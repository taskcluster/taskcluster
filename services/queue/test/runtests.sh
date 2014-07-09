#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

mocha                               \
  test/validate_test.js             \
  test/queue/tasks_test.js          \
  test/queue/taskstore_test.js      \
  test/api/*.js                     \
  ;
