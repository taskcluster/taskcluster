#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)


mocha                                 \
  test/validate_test.js               \
  test/queue/bucket_test.js           \
  test/queue/blobstore_test.js        \
  test/api/ping_test.js               \
  test/api/createtask_test.js         \
  test/api/minimumtask_test.js        \
  test/api/gettask_test.js            \
  test/api/claimtask_test.js          \
  test/api/reportcompleted_test.js    \
  test/api/polltask_test.js           \
  test/api/querytasks_test.js         \
  test/api/canceltask_test.js         \
  test/api/reruntask_test.js          \
  test/api/artifact_test.js           \
  test/api/retry_test.js              \
  test/api/deadline_test.js           \
  test/api/expiretask_test.js         \
  ;