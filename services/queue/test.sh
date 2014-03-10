#! /bin/bash -e

# These can safely be run in all cases
./node_modules/.bin/nodeunit test/queue/data.js \
  test/events/index.js \
  test/validation/index.js

if [ "$AWS_ACCESS_KEY_ID" == '' ] || [ "$AWS_SECRET_ACCESS_KEY" == '' ];
then
  echo "Skipping running test that require s3";
else
  echo "Running tests which require s3 credentials"
  ./node_modules/.bin/nodeunit test/api/index.js;
  ./node_modules/.bin/mocha test/api/claim_timeout.js
  ./node_modules/.bin/mocha test/api/claim.js
fi
