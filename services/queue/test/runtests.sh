#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

mocha                             \
  test/validate_test.js
  #test/queue/events_test.js       \
  #test/queue/tasks_store_test.js  \
  ;


if [ "$AWS_ACCESS_KEY_ID" == '' ] ;
then
  echo "Skipping running test that require s3";
else
  echo "Running tests which require s3 credentials"
  #./node_modules/.bin/mocha test/api/*.js; test/queue/bucket_test.js
fi

