#! /bin/bash -vex

# These can safely be run in all cases
./node_modules/.bin/nodeunit test/validate_test.js
 # test/data_test.js (disabled as it doesn't work reliably)

./node_modules/.bin/mocha \
  test/queue/events_test.js \
  test/queue/tasks_store_test.js

if [ "$AWS_ACCESS_KEY_ID" == '' ] ;
then
  echo "Skipping running test that require s3";
else
  echo "Running tests which require s3 credentials"
  ./node_modules/.bin/mocha test/api/*.js; test/queue/bucket_test.js
fi

