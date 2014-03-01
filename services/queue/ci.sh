#! /bin/bash -e

# These can safely be run in all cases
./node_modules/.bin/nodeunit \
  tests/queue/data.js \
  tests/events/index.js \
  tests/validation/index.js

if [ "$TRAVIS_PULL_REQUEST" == "false" ];
then
  # aws credentials are required
  test $AWS_ACCESS_KEY_ID;
  test $AWS_SECRET_ACCESS_KEY;

  # test bucket is required
  test $TASKCLUSTER_TEST_TASK_BUCKET;

  ./node_modules/.bin/nodeunit tests/api/index.js;
else
  echo "Skipping running tests that require s3";
fi
