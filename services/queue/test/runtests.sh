#! /bin/bash -vex

# These can safely be run in all cases
./node_modules/.bin/nodeunit  \
  test/validate_test.js \
  test/events_test.js
 # test/data_test.js (disabled as it doesn't work reliably)

if [ "$AWS_ACCESS_KEY_ID" == '' ] ;
then
  echo "Skipping running test that require s3";
else
  echo "Running tests which require s3 credentials"

  ./node_modules/.bin/mocha test/api/claim_timeout.js;
  ./node_modules/.bin/mocha test/api/define_schedule_task.js;
  ./node_modules/.bin/mocha test/api/post_task.js;
  ./node_modules/.bin/mocha test/api/rerun_test.js;
  ./node_modules/.bin/mocha test/api/claim.js;
fi
