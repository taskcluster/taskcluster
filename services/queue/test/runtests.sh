#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

mocha                             \
  .test/lint_test.js              \
  .test/validate_test.js          \
  .test/bucket_test.js            \
  .test/blobstore_test.js         \
  .test/queueservice_test.js      \
  .test/ping_test.js              \
  .test/createtask_test.js        \
  .test/minimumtask_test.js       \
  .test/gettask_test.js           \
  .test/claimtask_test.js         \
  .test/claimwork_test.js         \
  .test/resolvetask_test.js       \
  .test/polltask_test.js          \
  .test/priority_test.js          \
  .test/querytasks_test.js        \
  .test/taskgroup_test.js         \
  .test/canceltask_test.js        \
  .test/reruntask_test.js         \
  .test/artifact_test.js          \
  .test/retry_test.js             \
  .test/deadline_test.js          \
  .test/expiretask_test.js        \
  .test/expirequeues_test.js      \
  .test/dependency_test.js        \
  .test/workerinfo_test.js        \
  ;
